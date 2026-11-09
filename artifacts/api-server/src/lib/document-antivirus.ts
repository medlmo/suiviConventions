import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir, userInfo } from "node:os";
import { DocumentSecurityError, documentAnalysisBusy, documentRejected } from "./document-security-errors";
import { runDocumentTool } from "./document-tools";
import { logger } from "./logger";
import { safeErrorFields } from "./error-logging";
import {
  acquireAntivirusUpdateLease,
  ANTIVIRUS_INSTANCE_ID,
  publishAntivirusSignatureSnapshot,
  restoreAntivirusSignatureSnapshot,
  type AntivirusUpdateLease,
} from "./antivirus-signature-cache";

const DATABASE_DIR = join(tmpdir(), "conventions-antivirus");
const MAX_DB_AGE = 24 * 60 * 60 * 1000;
const SIGNATURE_REFRESH_INTERVAL = 12 * 60 * 60 * 1000;
const UPDATE_MIN_INTERVAL = 60 * 1000;
const UPDATE_RETRY_INTERVAL = 5 * 60 * 1000;
const SHARED_UPDATE_RETRY_INTERVAL = 30 * 1000;
const UPLOAD_WAIT_FOR_UPDATE_MS = 12_000;
const ENGINE_CHECK_INTERVAL_MS = 60 * 1000;
let updating: Promise<void> | undefined;
let lastAttempt = 0;
let readyAt = 0;
let lastUpdateFailed = false;
let engineAvailable: boolean | undefined;
let engineCheckedAt = 0;
let engineCheck: Promise<boolean> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let scanning = false;

function scheduleUpdateRetry(delay: number): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    lastAttempt = 0;
    void prepareDocumentAntivirus();
  }, delay);
  retryTimer.unref();
}

async function restoreSharedSignatureSnapshot(): Promise<number | null> {
  try {
    return await restoreAntivirusSignatureSnapshot(DATABASE_DIR, MAX_DB_AGE);
  } catch (error) {
    logger.warn({
      event: "antivirus.cache.restore.failed",
      operation: "antivirus.cache",
      instanceId: ANTIVIRUS_INSTANCE_ID,
      ...safeErrorFields(error),
    }, "Impossible de restaurer la base antivirus partagée");
    return null;
  }
}

async function publishSharedSignatureSnapshot(updatedAt: number): Promise<void> {
  try {
    await publishAntivirusSignatureSnapshot(DATABASE_DIR, updatedAt);
  } catch (error) {
    logger.warn({
      event: "antivirus.cache.publish.failed",
      operation: "antivirus.cache",
      instanceId: ANTIVIRUS_INSTANCE_ID,
      ...safeErrorFields(error),
    }, "La base locale est prête mais n'a pas pu être publiée dans le cache partagé");
  }
}

async function databaseDate(): Promise<number> {
  const dates = await Promise.all(["main", "daily", "bytecode"].map(async name => {
    for (const suffix of [".cld", ".cvd"]) {
      try { return (await stat(join(DATABASE_DIR, name + suffix))).mtimeMs; } catch { /* autre format */ }
    }
    return 0;
  }));
  // main peut être ancien ; daily fournit la fraîcheur, tous doivent être présents.
  if (!dates.every(Boolean)) return 0;
  try {
    const value = Number(await readFile(join(DATABASE_DIR, "last-success"), "utf8"));
    if (value > 0 && value <= Date.now()) return value;
  } catch { /* premier téléchargement, avant la création du marqueur */ }
  return dates[1]!;
}

async function verifierMoteurAntimalware(): Promise<boolean> {
  if (engineCheck) return engineCheck;
  if (engineAvailable !== undefined && Date.now() - engineCheckedAt < ENGINE_CHECK_INTERVAL_MS) {
    return engineAvailable;
  }
  engineCheck = (async () => {
    try {
      const result = await runDocumentTool("clamscan", ["--version"], 10_000);
      engineAvailable = result.code === 0;
    } catch {
      engineAvailable = false;
    }
    engineCheckedAt = Date.now();
    return engineAvailable;
  })().finally(() => { engineCheck = undefined; });
  return engineCheck;
}

export function prepareDocumentAntivirus(): Promise<void> {
  if (updating) return updating;
  if (Date.now() - lastAttempt < UPDATE_MIN_INTERVAL) return Promise.resolve();
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }
  lastAttempt = Date.now();
  updating = (async () => {
    let failureStage = "database_directory";
    let toolExitCode: number | undefined;
    let lease: AntivirusUpdateLease | undefined;
    try {
      await mkdir(DATABASE_DIR, { recursive: true, mode: 0o700 });
      failureStage = "scanner_check";
      if (!await verifierMoteurAntimalware()) {
        throw new DocumentSecurityError("Moteur antimalware indisponible.", "ANALYSIS_UNAVAILABLE");
      }

      failureStage = "shared_cache_restore";
      let priorDate = await databaseDate();
      if (priorDate <= Date.now() - MAX_DB_AGE) {
        priorDate = await restoreSharedSignatureSnapshot() ?? priorDate;
      }
      readyAt = priorDate;
      if (priorDate > Date.now() - SIGNATURE_REFRESH_INTERVAL) {
        lastUpdateFailed = false;
        failureStage = "shared_cache_publish";
        await publishSharedSignatureSnapshot(priorDate);
        return;
      }

      failureStage = "shared_update_lock";
      try {
        lease = await acquireAntivirusUpdateLease();
      } catch (error) {
        // Le scan local reste disponible si App Storage est momentanément inaccessible.
        logger.warn({
          event: "antivirus.cache.lock.failed",
          operation: "antivirus.cache",
          instanceId: ANTIVIRUS_INSTANCE_ID,
          ...safeErrorFields(error),
        }, "Verrou du cache antivirus indisponible ; mise à jour locale tentée");
        lease = { status: "disabled" };
      }

      if (lease.status === "busy") {
        failureStage = "shared_cache_restore";
        const restored = await restoreSharedSignatureSnapshot();
        priorDate = await databaseDate();
        if (restored && priorDate > Date.now() - MAX_DB_AGE) readyAt = priorDate;
        logger.info({
          event: "antivirus.update.deferred",
          operation: "antivirus.update",
          instanceId: ANTIVIRUS_INSTANCE_ID,
          localDatabaseReady: priorDate > Date.now() - MAX_DB_AGE,
        }, "Une autre instance met à jour le cache antivirus");
        scheduleUpdateRetry(SHARED_UPDATE_RETRY_INTERVAL);
        return;
      }

      // Une autre instance a pu publier le cache pendant l'acquisition du verrou.
      if (priorDate <= Date.now() - MAX_DB_AGE) {
        failureStage = "shared_cache_restore";
        priorDate = await restoreSharedSignatureSnapshot() ?? priorDate;
        readyAt = priorDate;
      }
      if (priorDate > Date.now() - SIGNATURE_REFRESH_INTERVAL) {
        lastUpdateFailed = false;
        return;
      }

      failureStage = "freshclam";
      const config = join(DATABASE_DIR, "freshclam.conf");
      await writeFile(config,
        `DatabaseDirectory ${DATABASE_DIR}\nDatabaseMirror database.clamav.net\nDatabaseOwner ${userInfo().username}\nConnectTimeout 10\nReceiveTimeout 45\nMaxAttempts 1\n`,
        { mode: 0o600 });
      const result = await runDocumentTool("freshclam", ["--config-file=" + config, "--stdout"], 180_000);
      if (result.code !== 0) {
        toolExitCode = result.code;
        throw new DocumentSecurityError("Mise à jour antimalware indisponible.", "ANALYSIS_UNAVAILABLE");
      }

      failureStage = "database_validation";
      if (!await databaseDate()) throw new DocumentSecurityError("Base antimalware absente.", "ANALYSIS_UNAVAILABLE");
      readyAt = Date.now();
      await writeFile(join(DATABASE_DIR, "last-success"), String(readyAt), { mode: 0o600 });
      lastUpdateFailed = false;
      logger.info({
        event: "antivirus.ready",
        operation: "antivirus.update",
        instanceId: ANTIVIRUS_INSTANCE_ID,
      }, "Base antimalware locale disponible");

      failureStage = "shared_cache_publish";
      await publishSharedSignatureSnapshot(readyAt);
    } catch (error) {
      lastUpdateFailed = true;
      // Ne jamais journaliser la sortie brute des outils ni le contenu d'un document.
      logger.warn({
        event: "antivirus.update.failed",
        operation: "antivirus.update",
        errorCode: "ANTIVIRUS_UPDATE_FAILED",
        instanceId: ANTIVIRUS_INSTANCE_ID,
        failureStage,
        ...(toolExitCode === undefined ? {} : { toolExitCode }),
        ...safeErrorFields(error),
      }, "Mise à jour antimalware impossible ; les fichiers non contrôlés restent bloqués");
      scheduleUpdateRetry(UPDATE_RETRY_INTERVAL);
    } finally {
      if (lease?.status === "acquired") await lease.release();
      updating = undefined;
    }
  })();
  return updating;
}

export async function getDocumentAntivirusReadiness(): Promise<{
  ready: boolean;
  updating: boolean;
  scannerAvailable: boolean;
  lastUpdateFailed: boolean;
  databaseAgeSeconds: number | null;
}> {
  let databaseTimestamp = 0;
  try {
    databaseTimestamp = await databaseDate();
  } catch {
    // A filesystem problem must report unavailable, never ready.
  }
  const scannerAvailable = await verifierMoteurAntimalware();
  const now = Date.now();
  const ready = databaseTimestamp > now - MAX_DB_AGE && scannerAvailable;
  if (ready) readyAt = databaseTimestamp;
  return {
    ready,
    updating: updating !== undefined,
    scannerAvailable,
    lastUpdateFailed,
    databaseAgeSeconds: databaseTimestamp
      ? Math.max(0, Math.floor((now - databaseTimestamp) / 1000))
      : null,
  };
}

export async function requireDocumentAntivirus(): Promise<void> {
  const now = Date.now();
  readyAt = await databaseDate().catch(() => 0);
  let engineIsAvailable = await verifierMoteurAntimalware();
  if (readyAt > now - MAX_DB_AGE && engineIsAvailable) return;

  void prepareDocumentAntivirus();
  const currentUpdate = updating;
  if (currentUpdate) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        currentUpdate,
        new Promise<void>(resolve => {
          timer = setTimeout(resolve, UPLOAD_WAIT_FOR_UPDATE_MS);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    readyAt = await databaseDate().catch(() => 0);
    if (readyAt <= Date.now() - MAX_DB_AGE) {
      readyAt = await restoreSharedSignatureSnapshot() ?? readyAt;
    }
    engineIsAvailable = await verifierMoteurAntimalware();
    if (readyAt > Date.now() - MAX_DB_AGE && engineIsAvailable) return;
  }
  throw new DocumentSecurityError(
    "L’analyse antivirus est temporairement indisponible. Votre fichier reste conservé et n’est pas validé. Réessayez dans une minute.",
    "ANALYSIS_UNAVAILABLE",
  );
}

export async function scanDocumentAntivirus(path: string): Promise<{ engine: string; signatureDate: string }> {
  // Also protect direct scanner callers, independently of the full inspection guard.
  if (scanning) throw documentAnalysisBusy();
  scanning = true;
  try {
    await requireDocumentAntivirus();
    const result = await runDocumentTool("clamscan", [
      "--database=" + DATABASE_DIR, "--no-summary", "--infected", "--fail-if-cvd-older-than=2",
      "--scan-archive=yes", "--scan-pdf=yes", "--scan-ole2=yes", "--alert-encrypted=yes",
      "--alert-macros=yes", "--alert-exceeds-max=yes", "--alert-broken=yes",
      "--max-filesize=20M", "--max-scansize=80M", "--max-files=3000", "--max-recursion=12",
      "--max-scantime=120000",
      path,
    ], 90_000);
    if (result.code === 1) throw documentRejected();
    if (result.code !== 0) throw new DocumentSecurityError(
      "Document en quarantaine : l'analyse antimalware n'a pas abouti. L'accès est refusé.",
      "ANALYSIS_UNAVAILABLE",
    );
    return { engine: "ClamAV", signatureDate: new Date(readyAt).toISOString() };
  } finally {
    scanning = false;
  }
}
