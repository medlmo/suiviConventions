import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { File } from "@google-cloud/storage";
import { logger } from "./logger";
import { safeErrorFields } from "./error-logging";
import { objectStorageClient } from "./object-storage-client";

const DATABASE_NAMES = ["main", "daily", "bytecode"] as const;
const SIGNATURE_FILE = /^(main|daily|bytecode)\.(?:cvd|cld)$/u;
const SNAPSHOT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MAX_SIGNATURE_FILE_BYTES = 512 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 1024 * 1024 * 1024;
const UPDATE_LOCK_TTL_MS = 15 * 60 * 1000;

interface SignatureFile {
  name: string;
  size: number;
}

interface SnapshotManifest {
  version: 1;
  snapshotId: string;
  updatedAt: number;
  files: SignatureFile[];
}

interface CurrentPointer {
  version: 1;
  snapshotId: string;
  previousSnapshotId?: string;
}

interface CacheLocation {
  bucketName: string;
  prefix: string;
}

export type AntivirusUpdateLease =
  | { status: "disabled" }
  | { status: "busy" }
  | { status: "acquired"; release: () => Promise<void> };

function normalizeDirectory(value: string): string {
  return value.trim().replace(/^\/+|\/+$/gu, "");
}

function cacheLocation(): CacheLocation | undefined {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) return undefined;

  const normalizedPrivateDir = normalizeDirectory(privateObjectDir);
  const [bucketName, ...privateSegments] = normalizedPrivateDir.split("/");
  if (!bucketName || privateSegments.length === 0) return undefined;

  const privatePath = `/${normalizedPrivateDir}`;
  const publicPaths = (process.env.PUBLIC_OBJECT_SEARCH_PATHS ?? "")
    .split(",")
    .map(normalizeDirectory)
    .filter(Boolean)
    .map(path => `/${path}`);
  if (publicPaths.some(path =>
    privatePath === path ||
    privatePath.startsWith(`${path}/`) ||
    path.startsWith(`${privatePath}/`)
  )) {
    throw new Error("Le cache antivirus ne peut pas utiliser un chemin public.");
  }

  return {
    bucketName,
    prefix: `${privateSegments.join("/")}/.system/antivirus-signatures`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFound(error: unknown): boolean {
  return isRecord(error) && (error.code === 404 || error.code === "404");
}

function isPreconditionFailure(error: unknown): boolean {
  return isRecord(error) &&
    (error.code === 409 || error.code === 412 || error.code === "409" || error.code === "412");
}

function parsePointer(value: unknown): CurrentPointer | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.snapshotId !== "string") return null;
  if (!SNAPSHOT_ID.test(value.snapshotId)) return null;
  const previousSnapshotId = value.previousSnapshotId;
  if (previousSnapshotId !== undefined &&
    (typeof previousSnapshotId !== "string" || !SNAPSHOT_ID.test(previousSnapshotId))) return null;
  return {
    version: 1,
    snapshotId: value.snapshotId,
    ...(typeof previousSnapshotId === "string" ? { previousSnapshotId } : {}),
  };
}

function parseManifest(value: unknown, expectedId: string): SnapshotManifest | null {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    value.snapshotId !== expectedId ||
    typeof value.updatedAt !== "number" ||
    !Number.isSafeInteger(value.updatedAt) ||
    !Array.isArray(value.files) ||
    value.files.length < DATABASE_NAMES.length ||
    value.files.length > DATABASE_NAMES.length * 2
  ) return null;

  const files: SignatureFile[] = [];
  const names = new Set<string>();
  let totalBytes = 0;
  for (const entry of value.files) {
    if (!isRecord(entry) || typeof entry.name !== "string" || !SIGNATURE_FILE.test(entry.name)) return null;
    if (!Number.isSafeInteger(entry.size) || typeof entry.size !== "number" ||
      entry.size <= 0 || entry.size > MAX_SIGNATURE_FILE_BYTES || names.has(entry.name)) return null;
    names.add(entry.name);
    totalBytes += entry.size;
    files.push({ name: entry.name, size: entry.size });
  }
  if (totalBytes > MAX_SNAPSHOT_BYTES ||
    !DATABASE_NAMES.every(name => files.some(file => file.name.startsWith(`${name}.`)))) return null;

  return { version: 1, snapshotId: expectedId, updatedAt: value.updatedAt, files };
}

async function downloadJson(file: File): Promise<unknown | null> {
  try {
    const [exists] = await file.exists();
    if (!exists) return null;
    const [bytes] = await file.download();
    return JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

async function readCurrentPointer(bucketName: string, prefix: string): Promise<{
  pointer: CurrentPointer | null;
  generation: string | undefined;
  exists: boolean;
}> {
  const file = objectStorageClient.bucket(bucketName).file(`${prefix}/current.json`);
  const [exists] = await file.exists();
  if (!exists) return { pointer: null, generation: undefined, exists: false };
  const [metadata] = await file.getMetadata();
  const pointer = parsePointer(await downloadJson(file));
  return { pointer, generation: metadata.generation, exists: true };
}

function reportCacheFailure(event: string, stage: string, error: unknown): void {
  logger.warn({
    event,
    operation: "antivirus.cache",
    stage,
    ...safeErrorFields(error),
  }, "Cache de signatures antivirus indisponible");
}

async function restoreManifest(
  bucketName: string,
  prefix: string,
  manifest: SnapshotManifest,
  targetDir: string,
  maxAgeMs: number,
): Promise<number | null> {
  const now = Date.now();
  if (manifest.updatedAt > now + 5 * 60_000 || now - manifest.updatedAt > maxAgeMs) return null;

  const bucket = objectStorageClient.bucket(bucketName);
  const stagingDir = join(tmpdir(), `antivirus-signatures-${randomUUID()}`);
  await mkdir(stagingDir, { recursive: true, mode: 0o700 });
  try {
    for (const entry of manifest.files) {
      const object = bucket.file(`${prefix}/snapshots/${manifest.snapshotId}/${entry.name}`);
      const [metadata] = await object.getMetadata();
      if (Number(metadata.size) !== entry.size) throw new Error("Taille de signature antivirus incohérente.");
      await pipeline(
        object.createReadStream(),
        createWriteStream(join(stagingDir, entry.name), { mode: 0o600 }),
      );
    }

    const currentFiles = await readdir(targetDir).catch(() => []);
    await Promise.all(currentFiles
      .filter(name => SIGNATURE_FILE.test(name))
      .map(name => rm(join(targetDir, name), { force: true })));
    await mkdir(targetDir, { recursive: true, mode: 0o700 });
    for (const entry of manifest.files) {
      await rename(join(stagingDir, entry.name), join(targetDir, entry.name));
    }
    await writeFile(join(targetDir, "last-success"), String(manifest.updatedAt), { mode: 0o600 });
    logger.info({
      event: "antivirus.cache.restored",
      operation: "antivirus.cache",
      signatureAgeSeconds: Math.max(0, Math.floor((now - manifest.updatedAt) / 1000)),
      fileCount: manifest.files.length,
    }, "Base antivirus restaurée depuis le cache privé");
    return manifest.updatedAt;
  } finally {
    await rm(stagingDir, { recursive: true, force: true });
  }
}

export async function restoreAntivirusSignatureSnapshot(
  targetDir: string,
  maxAgeMs: number,
): Promise<number | null> {
  const location = cacheLocation();
  if (!location) return null;
  const pointerFile = objectStorageClient.bucket(location.bucketName).file(`${location.prefix}/current.json`);
  const pointer = parsePointer(await downloadJson(pointerFile));
  if (!pointer) return null;

  const ids = [pointer.snapshotId, pointer.previousSnapshotId].filter((id): id is string => Boolean(id));
  for (const id of ids) {
    try {
      const manifestFile = objectStorageClient.bucket(location.bucketName)
        .file(`${location.prefix}/snapshots/${id}/manifest.json`);
      const manifest = parseManifest(await downloadJson(manifestFile), id);
      if (!manifest) continue;
      const restoredAt = await restoreManifest(location.bucketName, location.prefix, manifest, targetDir, maxAgeMs);
      if (restoredAt) return restoredAt;
    } catch (error) {
      reportCacheFailure("antivirus.cache.restore.failed", "restore", error);
    }
  }
  return null;
}

async function signatureFiles(sourceDir: string): Promise<SignatureFile[]> {
  const names = (await readdir(sourceDir)).filter(name => SIGNATURE_FILE.test(name)).sort();
  const files: SignatureFile[] = [];
  let totalBytes = 0;
  for (const name of names) {
    const info = await stat(join(sourceDir, name));
    if (!info.isFile() || info.size <= 0 || info.size > MAX_SIGNATURE_FILE_BYTES) {
      throw new Error("Fichier de signatures antivirus invalide.");
    }
    totalBytes += info.size;
    files.push({ name, size: info.size });
  }
  if (totalBytes > MAX_SNAPSHOT_BYTES ||
    !DATABASE_NAMES.every(name => files.some(file => file.name.startsWith(`${name}.`)))) {
    throw new Error("Base de signatures antivirus incomplète.");
  }
  return files;
}

async function cleanupSnapshots(bucketName: string, prefix: string, keepIds: Set<string>): Promise<void> {
  const bucket = objectStorageClient.bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix: `${prefix}/snapshots/` });
  const obsolete = files.filter(file => {
    const snapshotId = file.name.slice(`${prefix}/snapshots/`.length).split("/")[0];
    return Boolean(snapshotId && SNAPSHOT_ID.test(snapshotId) && !keepIds.has(snapshotId));
  });
  await Promise.all(obsolete.map(file => file.delete({ ignoreNotFound: true })));
}

export async function publishAntivirusSignatureSnapshot(sourceDir: string, updatedAt: number): Promise<void> {
  const location = cacheLocation();
  if (!location) return;

  const bucket = objectStorageClient.bucket(location.bucketName);
  const previous = await readCurrentPointer(location.bucketName, location.prefix);
  if (previous.exists && !previous.pointer) throw new Error("Pointeur du cache antivirus invalide.");
  const snapshotId = randomUUID();
  const files = await signatureFiles(sourceDir);
  const snapshotPrefix = `${location.prefix}/snapshots/${snapshotId}`;

  for (const entry of files) {
    await pipeline(
      createReadStream(join(sourceDir, entry.name)),
      bucket.file(`${snapshotPrefix}/${entry.name}`).createWriteStream({
        resumable: true,
        validation: "crc32c",
        metadata: { contentType: "application/octet-stream", cacheControl: "private, no-store" },
      }),
    );
  }

  const manifest: SnapshotManifest = { version: 1, snapshotId, updatedAt, files };
  await bucket.file(`${snapshotPrefix}/manifest.json`).save(JSON.stringify(manifest), {
    resumable: false,
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: { contentType: "application/json", cacheControl: "private, no-store" },
  });

  const pointer: CurrentPointer = {
    version: 1,
    snapshotId,
    ...(previous.pointer ? { previousSnapshotId: previous.pointer.snapshotId } : {}),
  };
  await bucket.file(`${location.prefix}/current.json`).save(JSON.stringify(pointer), {
    resumable: false,
    preconditionOpts: { ifGenerationMatch: previous.generation ?? 0 },
    metadata: { contentType: "application/json", cacheControl: "private, no-store" },
  });

  try {
    const keepIds = new Set([snapshotId, pointer.previousSnapshotId].filter((id): id is string => Boolean(id)));
    await cleanupSnapshots(location.bucketName, location.prefix, keepIds);
  } catch (error) {
    reportCacheFailure("antivirus.cache.cleanup.failed", "cleanup", error);
  }
}

export async function acquireAntivirusUpdateLease(): Promise<AntivirusUpdateLease> {
  const location = cacheLocation();
  if (!location) return { status: "disabled" };
  const lockFile = objectStorageClient.bucket(location.bucketName).file(`${location.prefix}/update-lock.json`);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await lockFile.save(JSON.stringify({ expiresAt: Date.now() + UPDATE_LOCK_TTL_MS }), {
        resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { contentType: "application/json", cacheControl: "private, no-store" },
      });
      const [metadata] = await lockFile.getMetadata();
      const generation = metadata.generation;
      return {
        status: "acquired",
        release: async () => {
          try {
            await lockFile.delete({ ignoreNotFound: true, ifGenerationMatch: generation });
          } catch (error) {
            reportCacheFailure("antivirus.cache.lock.release.failed", "lock_release", error);
          }
        },
      };
    } catch (error) {
      if (!isPreconditionFailure(error)) throw error;
      const [metadata] = await lockFile.getMetadata();
      const lock = await downloadJson(lockFile);
      if (!isRecord(lock) || typeof lock.expiresAt !== "number" || lock.expiresAt > Date.now()) {
        return { status: "busy" };
      }
      try {
        await lockFile.delete({ ignoreNotFound: true, ifGenerationMatch: metadata.generation });
      } catch (deleteError) {
        if (!isPreconditionFailure(deleteError) && !isNotFound(deleteError)) throw deleteError;
        return { status: "busy" };
      }
    }
  }
  return { status: "busy" };
}
