import { pool } from "@workspace/db";
import {
  InvalidDocumentError,
  ObjectStorageService,
  validateUploadBytes,
  type VerifiedDocument,
} from "./objectStorage";
import { DocumentSecurityError } from "./document-security-errors";
import { logger } from "./logger";
import { safeErrorFields } from "./error-logging";

const RETENTION_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const LEASE_MS = 4 * 60 * 1000;
const WORKER_INTERVAL_MS = 15 * 1000;
const objectStorage = new ObjectStorageService();

export type QuarantineState = "pending" | "scanning" | "ready" | "rejected";

type QuarantineRow = {
  id: string;
  owner_id: number;
  name: string;
  content_type: string;
  size: number;
  state: QuarantineState | "storing";
  expires_at: Date;
  document_object_path: string | null;
  document_generation: string | null;
};

export async function getQuarantineStatus(
  uploadId: string,
  ownerId: number,
): Promise<{
  status: QuarantineState;
  expiresAt: string;
  document?: VerifiedDocument;
} | null> {
  const { rows } = await pool.query<QuarantineRow>(
    `SELECT id, owner_id, name, content_type, size, state, expires_at,
            document_object_path, document_generation
     FROM quarantined_document_uploads
     WHERE id = $1 AND owner_id = $2 AND expires_at > now()`,
    [uploadId, ownerId],
  );
  const row = rows[0];
  if (!row || row.state === "storing") return null;
  if (row.state === "ready" && row.document_object_path && row.document_generation) {
    return {
      status: "ready",
      expiresAt: row.expires_at.toISOString(),
      document: {
        objectPath: row.document_object_path,
        name: row.name,
        contentType: row.content_type,
        size: row.size,
        generation: row.document_generation,
      },
    };
  }
  return { status: row.state, expiresAt: row.expires_at.toISOString() };
}

async function claimNext(): Promise<QuarantineRow | undefined> {
  const { rows } = await pool.query<QuarantineRow>(
    `WITH candidate AS (
       SELECT id
       FROM quarantined_document_uploads
       WHERE expires_at > now()
         AND (
           (state = 'pending' AND next_attempt_at <= now())
           OR (state = 'scanning' AND lease_expires_at <= now())
         )
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     UPDATE quarantined_document_uploads AS upload
     SET state = 'scanning',
         attempts = attempts + 1,
         lease_expires_at = now() + ($1 * interval '1 millisecond'),
         updated_at = now()
     FROM candidate
     WHERE upload.id = candidate.id
     RETURNING upload.id, upload.owner_id, upload.name, upload.content_type,
               upload.size, upload.state, upload.expires_at,
               upload.document_object_path, upload.document_generation`,
    [LEASE_MS],
  );
  return rows[0];
}

async function setRetry(id: string, error: unknown): Promise<void> {
  const code = error instanceof DocumentSecurityError ? error.code : "PROCESSING_FAILED";
  await pool.query(
    `UPDATE quarantined_document_uploads
     SET state = 'pending', next_attempt_at = now() + ($2 * interval '1 millisecond'),
         lease_expires_at = NULL, updated_at = now()
     WHERE id = $1 AND state = 'scanning'`,
    [id, RETRY_MS],
  );
  logger.warn({
    event: "document.quarantine.retry",
    operation: "document.quarantine",
    errorCode: code,
    ...safeErrorFields(error),
  }, "Pending document validation will be retried");
}

async function marquerRejete(row: QuarantineRow): Promise<void> {
  await pool.query(
    `UPDATE quarantined_document_uploads
     SET state = 'rejected', lease_expires_at = NULL, updated_at = now()
     WHERE id = $1 AND state = 'scanning'`,
    [row.id],
  );
  await objectStorage.deleteQuarantinedUpload(row.id).catch(error => {
    logger.warn({
      event: "document.quarantine.delete.failed",
      operation: "document.quarantine",
      errorCode: "QUARANTINE_DELETE_FAILED",
      ...safeErrorFields(error),
    }, "Rejected quarantined file could not be removed immediately");
  });
}

async function traiterUneDemande(): Promise<void> {
  const row = await claimNext();
  if (!row) return;
  try {
    const bytes = await objectStorage.readQuarantinedUpload(row.id);
    validateUploadBytes(row.name, bytes);
    const document = await objectStorage.finalizeUploadedDocument(bytes, row.name, row.id);
    await pool.query(
      `UPDATE quarantined_document_uploads
       SET state = 'ready', document_object_path = $2, document_generation = $3,
           lease_expires_at = NULL, updated_at = now()
       WHERE id = $1 AND state = 'scanning'`,
      [row.id, document.objectPath, document.generation],
    );
    await objectStorage.deleteQuarantinedUpload(row.id).catch(error => {
      logger.warn({
        event: "document.quarantine.delete.failed",
        operation: "document.quarantine",
        errorCode: "QUARANTINE_DELETE_FAILED",
        ...safeErrorFields(error),
      }, "Clean quarantined file could not be removed immediately");
    });
    logger.info({
      event: "document.quarantine.structure.completed",
      operation: "document.quarantine",
      uploadId: row.id,
    }, "Pending document passed structure validation");
  } catch (error) {
    if ((error instanceof DocumentSecurityError && error.code === "DOCUMENT_REJECTED") ||
      error instanceof InvalidDocumentError) {
      await marquerRejete(row);
      logger.warn({
        event: "document.quarantine.structure.rejected",
        operation: "document.quarantine",
        uploadId: row.id,
      }, "Pending document failed structure validation");
      return;
    }
    await setRetry(row.id, error);
  }
}

async function nettoyerExpires(): Promise<void> {
  const { rows } = await pool.query<{
    id: string;
    state: QuarantineState | "storing";
    document_object_path: string | null;
  }>(
    `SELECT id, state, document_object_path FROM quarantined_document_uploads
     WHERE expires_at <= now()
     ORDER BY expires_at
     LIMIT 50`,
  );
  for (const row of rows) {
    try {
      await objectStorage.deleteQuarantinedUpload(row.id);
      if (row.state === "ready" && row.document_object_path) {
        const { rows: references } = await pool.query<{ referenced: boolean }>(
          `SELECT EXISTS (
             SELECT 1 FROM conventions
             WHERE document_convention = $1
                OR pv = $1
                OR documents @> $2::jsonb
           ) AS referenced`,
          [row.document_object_path, JSON.stringify([{ objectPath: row.document_object_path }])],
        );
        if (!references[0]?.referenced) {
          await objectStorage.deleteDocumentObject(row.document_object_path);
        }
      }
      await pool.query("DELETE FROM quarantined_document_uploads WHERE id = $1", [row.id]);
    } catch (error) {
      logger.warn({
        event: "document.quarantine.expiry_cleanup.failed",
        operation: "document.quarantine",
        errorCode: "QUARANTINE_CLEANUP_FAILED",
        ...safeErrorFields(error),
      }, "Expired quarantined upload could not be fully removed");
    }
  }
}

let workerRunning = false;
let lastCleanupAt = 0;

async function tick(): Promise<void> {
  if (workerRunning) return;
  workerRunning = true;
  try {
    if (Date.now() - lastCleanupAt >= 60 * 60 * 1000) {
      await nettoyerExpires();
      lastCleanupAt = Date.now();
    }
    await traiterUneDemande();
  } catch (error) {
    logger.error({
      event: "document.quarantine.worker.failed",
      operation: "document.quarantine",
      errorCode: "QUARANTINE_WORKER_FAILED",
      ...safeErrorFields(error),
    }, "Quarantined upload worker failed");
  } finally {
    workerRunning = false;
  }
}

export function startQuarantinedUploadWorker(): void {
  void tick();
  const timer = setInterval(() => void tick(), WORKER_INTERVAL_MS);
  timer.unref();
}
