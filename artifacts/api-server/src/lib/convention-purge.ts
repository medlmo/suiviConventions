import { and, eq, isNotNull, lt, ne, sql } from "drizzle-orm";
import { db, conventionsTable } from "@workspace/db";
import { ObjectStorageService } from "./objectStorage";
import { documentsConvention } from "./document-history-mapper";
import { logger } from "./logger";
import { safeErrorFields } from "./error-logging";

const RETENTION_MS = 5 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 50;
const DOCUMENT_OBJECT_PATH = /^\/objects\/documents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const storage = new ObjectStorageService();

export type ConventionPurgeResult = {
  conventionsDeleted: number;
  documentObjectsProcessed: number;
  sharedObjectsRetained: number;
  unmanagedDocumentPaths: number;
  failures: number;
};

let purgeInProgress = false;

/**
 * Purge les conventions supprimées depuis au moins cinq jours.
 * Les instantanés d'audit sont conservés; les notifications sont supprimées
 * par la contrainte ON DELETE CASCADE.
 */
export async function purgerConventionsSupprimees(): Promise<ConventionPurgeResult> {
  const result: ConventionPurgeResult = {
    conventionsDeleted: 0,
    documentObjectsProcessed: 0,
    sharedObjectsRetained: 0,
    unmanagedDocumentPaths: 0,
    failures: 0,
  };
  if (purgeInProgress) return result;

  purgeInProgress = true;
  try {
    const cutoff = new Date(Date.now() - RETENTION_MS);
    const candidates = await db.select({ id: conventionsTable.id })
      .from(conventionsTable)
      .where(and(isNotNull(conventionsTable.deletedAt), lt(conventionsTable.deletedAt, cutoff)))
      .orderBy(conventionsTable.deletedAt, conventionsTable.id)
      .limit(BATCH_SIZE);

    for (const candidate of candidates) {
      try {
        const outcome = await db.transaction(async (tx) => {
          // Serialize purge with convention creation, edits, and soft deletion,
          // which use the same application-wide advisory lock.
          await tx.execute(sql`SELECT pg_advisory_xact_lock(741024, 1)`);
          const [current] = await tx.select().from(conventionsTable)
            .where(and(
              eq(conventionsTable.id, candidate.id),
              isNotNull(conventionsTable.deletedAt),
              lt(conventionsTable.deletedAt, cutoff),
            ))
            .for("update");
          if (!current) return { kind: "skipped" as const, objectsProcessed: 0, sharedRetained: 0, unmanaged: 0 };

          const allPaths = [...new Set(documentsConvention(current).map(document => document.objectPath))];
          const managedPaths = allPaths.filter(path => DOCUMENT_OBJECT_PATH.test(path));
          let objectsProcessed = 0;
          let sharedRetained = 0;

          for (const objectPath of managedPaths) {
            const [reference] = await tx.select({ id: conventionsTable.id })
              .from(conventionsTable)
              .where(and(
                ne(conventionsTable.id, current.id),
                sql`
                  (
                    ${conventionsTable.documentConvention} = ${objectPath}
                    OR ${conventionsTable.pv} = ${objectPath}
                    OR EXISTS (
                      SELECT 1
                      FROM jsonb_array_elements(
                        CASE
                          WHEN jsonb_typeof(${conventionsTable.documents}) = 'array'
                            THEN ${conventionsTable.documents}
                          ELSE '[]'::jsonb
                        END
                      ) AS document
                      WHERE document->>'objectPath' = ${objectPath}
                    )
                  )
                `,
              ))
              .limit(1);
            if (reference) {
              sharedRetained++;
              continue;
            }
            // Idempotent: a previous attempt may have removed the object before
            // its database transaction failed.
            await storage.deleteDocumentObject(objectPath);
            objectsProcessed++;
          }

          const [deleted] = await tx.delete(conventionsTable)
            .where(and(
              eq(conventionsTable.id, current.id),
              isNotNull(conventionsTable.deletedAt),
              lt(conventionsTable.deletedAt, cutoff),
            ))
            .returning({ id: conventionsTable.id });

          return deleted
            ? {
                kind: "deleted" as const,
                objectsProcessed,
                sharedRetained,
                unmanaged: allPaths.length - managedPaths.length,
              }
            : { kind: "skipped" as const, objectsProcessed: 0, sharedRetained: 0, unmanaged: 0 };
        });

        if (outcome.kind === "deleted") {
          result.conventionsDeleted++;
          result.documentObjectsProcessed += outcome.objectsProcessed;
          result.sharedObjectsRetained += outcome.sharedRetained;
          result.unmanagedDocumentPaths += outcome.unmanaged;
        }
      } catch (error) {
        result.failures++;
        logger.error({
          event: "conventions.purge.item_failed",
          operation: "conventions.purge",
          conventionId: candidate.id,
          errorCode: "CONVENTION_PURGE_FAILED",
          ...safeErrorFields(error),
        }, "Failed to purge a soft-deleted convention");
      }
    }
    return result;
  } finally {
    purgeInProgress = false;
  }
}
