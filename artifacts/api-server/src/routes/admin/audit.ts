import { Router, type IRouter } from "express";
import { and, count, desc, eq, ilike } from "drizzle-orm";
import { db, conventionAuditTable } from "@workspace/db";
import { adminRequired } from "../../lib/auth";

const router: IRouter = Router();

router.get("/admin/audit", adminRequired, async (req, res): Promise<void> => {
  const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
  const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
  const conventionId = req.query.conventionId === undefined ? undefined : Number(req.query.conventionId);
  const author = req.query.author === undefined
    ? undefined
    : typeof req.query.author === "string" ? req.query.author.trim() : null;
  if (
    !Number.isInteger(limit) || limit < 1 || limit > 200 ||
    !Number.isInteger(offset) || offset < 0 ||
    (conventionId !== undefined && (!Number.isInteger(conventionId) || conventionId < 1)) ||
    author === null || (author !== undefined && author.length > 120)
  ) {
    res.status(400).json({ error: "Paramètres de filtre ou de pagination invalides." });
    return;
  }
  const where = and(
    conventionId === undefined ? undefined : eq(conventionAuditTable.conventionId, conventionId),
    author ? ilike(conventionAuditTable.actorUsername, author) : undefined,
  );
  const [items, [result]] = await Promise.all([
    db.select().from(conventionAuditTable).where(where)
      .orderBy(desc(conventionAuditTable.createdAt), desc(conventionAuditTable.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(conventionAuditTable).where(where),
  ]);
  res.json({ items, total: result?.total ?? 0 });
});

export default router;
