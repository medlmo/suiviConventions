import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir, userInfo } from "node:os";
import { DocumentSecurityError, documentRejected } from "./document-security-errors";
import { runDocumentTool } from "./document-tools";
import { logger } from "./logger";

const DATABASE_DIR = join(tmpdir(), "conventions-antivirus");
const MAX_DB_AGE = 24 * 60 * 60 * 1000;
let updating: Promise<void> | undefined;
let lastAttempt = 0;
let readyAt = 0;

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

export function prepareDocumentAntivirus(): Promise<void> {
  if (updating) return updating;
  if (Date.now() - lastAttempt < 10 * 60 * 1000) return Promise.resolve();
  lastAttempt = Date.now();
  updating = (async () => {
    await mkdir(DATABASE_DIR, { recursive: true, mode: 0o700 });
    const priorDate = await databaseDate();
    if (priorDate > Date.now() - MAX_DB_AGE) readyAt = priorDate;
    const config = join(DATABASE_DIR, "freshclam.conf");
    await writeFile(config,
      `DatabaseDirectory ${DATABASE_DIR}\nDatabaseMirror database.clamav.net\nDatabaseOwner ${userInfo().username}\nConnectTimeout 10\nReceiveTimeout 45\nMaxAttempts 1\n`,
      { mode: 0o600 });
    const result = await runDocumentTool("freshclam", ["--config-file=" + config, "--stdout"], 180_000);
    if (result.code !== 0) throw new DocumentSecurityError("Mise à jour antimalware indisponible.", "ANALYSIS_UNAVAILABLE");
    if (!await databaseDate()) throw new DocumentSecurityError("Base antimalware absente.", "ANALYSIS_UNAVAILABLE");
    readyAt = Date.now();
    await writeFile(join(DATABASE_DIR, "last-success"), String(readyAt), { mode: 0o600 });
    logger.info("Base antimalware locale disponible");
  })().catch(error => {
    // Ne pas exposer la sortie des outils, les noms ou le contenu des documents.
    logger.warn({ errorType: error instanceof Error ? error.name : "unknown" }, "Mise à jour antimalware impossible ; les fichiers non contrôlés restent bloqués");
  }).finally(() => { updating = undefined; });
  return updating;
}

export async function requireDocumentAntivirus(): Promise<void> {
  if (!readyAt) readyAt = await databaseDate();
  if (readyAt <= Date.now() - MAX_DB_AGE) {
    void prepareDocumentAntivirus();
    throw new DocumentSecurityError(
      "Document en quarantaine : la base antimalware est absente ou trop ancienne. L'accès est refusé jusqu'à une analyse réussie. Réessayez ultérieurement.",
      "ANALYSIS_UNAVAILABLE",
    );
  }
}

export async function scanDocumentAntivirus(path: string): Promise<{ engine: string; signatureDate: string }> {
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
}
