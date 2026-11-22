import { Router, type IRouter } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, conventionsTable, conventionAuditTable } from "@workspace/db";
import { DeleteConventionParams } from "@workspace/api-zod";
import { isConventionAccessible, canEditConventions } from "../../lib/convention-access";
import { loadReferenceData, loadReferenceDataFrom } from "../../lib/reference-data";
import { createConventionSnapshot } from "./commun";

const router: IRouter = Router();

router.delete("/conventions/:id", async (req, res): Promise<void> => {
  if (!canEditConventions(req.user!)) {
    res.status(403).json({ error: "Ce rôle ne peut pas supprimer les conventions." });
    return;
  }
  const params = DeleteConventionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Identifiant de convention invalide." });
    return;
  }

  const version = Number(req.query.version);
  if (!Number.isSafeInteger(version) || version < 1) {
    res.status(400).json({ error: "Le paramètre version est obligatoire." });
    return;
  }
  await loadReferenceData();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(741024, 1)`);
    const reference = await loadReferenceDataFrom(tx);
    const [current] = await tx.select().from(conventionsTable)
      .where(and(eq(conventionsTable.id, params.data.id), isNull(conventionsTable.deletedAt)))
      .for("update");
    if (!current || !isConventionAccessible(current, req.user!, reference)) return "missing" as const;
    if (current.version !== version) return "stale" as const;
    const [removed] = await tx.update(conventionsTable).set({
      deletedAt: new Date(),
      updatedAt: new Date(),
      version: current.version + 1,
    }).where(and(
      eq(conventionsTable.id, params.data.id),
      eq(conventionsTable.version, version),
      isNull(conventionsTable.deletedAt),
    )).returning();
    if (!removed) return "stale" as const;
    await tx.insert(conventionAuditTable).values({
      conventionId: removed.id,
      action: "delete",
      actorUsername: req.user!.username,
      before: createConventionSnapshot(current),
      after: createConventionSnapshot(removed),
    });
    return "deleted" as const;
  });
  if (result === "missing") {
    res.status(404).json({ error: "Convention introuvable." });
    return;
  }
  if (result === "stale") {
    res.status(409).json({ error: "La convention a été modifiée entre-temps. Rechargez-la avant de réessayer." });
    return;
  }

  res.sendStatus(204);
});

export default router;
