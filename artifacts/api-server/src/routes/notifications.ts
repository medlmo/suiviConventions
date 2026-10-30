import { Router, type IRouter, type Request, type Response } from "express";
import { and, count, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { db, conventionsTable, notificationsTable } from "@workspace/db";
import { ListNotificationsQueryParams, ReadAllNotificationsBody, ReadNotificationBody, ReadNotificationParams } from "@workspace/api-zod";
import { filtrePerimetre } from "../lib/convention-access";
import { chargerReferentiel } from "../lib/reference-data";
import { resumeNotification } from "../lib/notifications";

const router: IRouter = Router();

router.get("/notifications", async (req, res) => {
  const unreadOnly = req.query.unreadOnly;
  const parsed = ListNotificationsQueryParams.safeParse({
    ...req.query,
    unreadOnly: unreadOnly === "0" ? 0 : unreadOnly === "1" ? 1 : unreadOnly,
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Paramètres de notifications invalides." });
    return;
  }
  const reference = await chargerReferentiel();
  const user = req.user!;
  const asOf = new Date();
  const visible = and(
    eq(notificationsTable.recipientId, user.id),
    isNull(conventionsTable.deletedAt),
    filtrePerimetre(user, reference),
  );
  const filter = and(visible, parsed.data.unreadOnly === 1 ? isNull(notificationsTable.readAt) : undefined);
  const [items, [total], [unread]] = await Promise.all([
    db.select({ notification: notificationsTable, conventionName: conventionsTable.nomConvention })
      .from(notificationsTable).innerJoin(conventionsTable, eq(conventionsTable.id, notificationsTable.conventionId))
      .where(filter).orderBy(desc(notificationsTable.updatedAt), desc(notificationsTable.id))
      .limit(parsed.data.limit ?? 20).offset(parsed.data.offset ?? 0),
    db.select({ value: count() }).from(notificationsTable)
      .innerJoin(conventionsTable, eq(conventionsTable.id, notificationsTable.conventionId)).where(filter),
    db.select({ value: count() }).from(notificationsTable)
      .innerJoin(conventionsTable, eq(conventionsTable.id, notificationsTable.conventionId))
      .where(and(visible, isNull(notificationsTable.readAt))),
  ]);
  res.json({
    items: items.map(({ notification: item, conventionName }) => ({
      id: item.id, conventionId: item.conventionId, conventionName,
      actorUsername: item.actorUsername, kind: item.kind,
      changedFields: item.changedFields, eventCount: item.eventCount,
      summary: resumeNotification(item.kind, item.changedFields, item.eventCount),
      createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
      readAt: item.readAt?.toISOString() ?? null,
    })),
    total: total?.value ?? 0, unreadCount: unread?.value ?? 0, asOf: asOf.toISOString(),
  });
});

async function marquerLecture(req: Request, res: Response, all: boolean): Promise<void> {
  // Do not let the generated date coercion turn null/numbers into valid instants.
  const rawObservedAt: unknown = req.body?.observedAt;
  if (typeof rawObservedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(rawObservedAt)) {
    res.status(400).json({ error: "Date de lecture invalide." });
    return;
  }
  const body = (all ? ReadAllNotificationsBody : ReadNotificationBody).safeParse(req.body);
  const params = all ? null : ReadNotificationParams.safeParse(req.params);
  if (!body.success || (params && !params.success)) {
    res.status(400).json({ error: "Paramètres de lecture invalides." });
    return;
  }
  const observedAt = new Date(body.data.observedAt);
  if (!Number.isFinite(observedAt.getTime()) || observedAt.getTime() > Date.now() + 1000) {
    res.status(400).json({ error: "Date de lecture invalide." });
    return;
  }
  const reference = await chargerReferentiel();
  const user = req.user!;
  const id = params?.success ? params.data.id : undefined;
  const visible = db.select({ id: conventionsTable.id }).from(conventionsTable).where(and(
    isNull(conventionsTable.deletedAt), filtrePerimetre(user, reference),
  ));
  const owned = and(
    eq(notificationsTable.recipientId, user.id),
    inArray(notificationsTable.conventionId, visible),
    id === undefined ? undefined : eq(notificationsTable.id, id),
  );
  const exists = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(741025, ${user.id})`);
    if (!all) {
      const [item] = await tx.select({ id: notificationsTable.id }).from(notificationsTable).where(owned).limit(1);
      if (!item) return false;
    }
    await tx.update(notificationsTable).set({ readAt: new Date() }).where(and(
      owned, isNull(notificationsTable.readAt), lte(notificationsTable.updatedAt, observedAt),
    ));
    return true;
  });
  if (!exists) {
    res.status(404).json({ error: "Notification introuvable." });
    return;
  }
  res.sendStatus(204);
}

router.patch("/notifications/read-all", (req, res) => marquerLecture(req, res, true));
router.patch("/notifications/:id/read", (req, res) => marquerLecture(req, res, false));
export default router;
