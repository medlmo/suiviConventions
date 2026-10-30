import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db, notificationsTable, usersTable, type Convention } from "@workspace/db";
import type { SessionUser } from "./auth";
import type { ReferenceData } from "./reference-data";
import { changementsNotification, estDestinataire } from "./notifications-domain";
export { changementsNotification, estDestinataire, resumeNotification } from "./notifications-domain";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const GROUP_WINDOW_MS = 10 * 60 * 1000;

/** Persisted in the convention's transaction: never announce a failed save. */
export async function notifierChangementConvention(
  tx: Transaction, actor: SessionUser, before: Convention | null, after: Convention, reference: ReferenceData,
): Promise<void> {
  const change = changementsNotification(before, after);
  if (before && change.changedFields.length === 0) return;
  const users = await tx.select({
    id: usersTable.id, username: usersTable.username, active: usersTable.active, role: usersTable.role,
    direction: usersTable.direction, division: usersTable.division, service: usersTable.service,
  }).from(usersTable).where(eq(usersTable.active, true));
  const recipients = users.filter((user) => estDestinataire(user, actor, after, reference))
    .sort((a, b) => a.id - b.id);
  for (const recipient of recipients) {
    // Also used by read operations: concurrent corrections cannot be merged into a read item.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(741025, ${recipient.id})`);
    const now = new Date();
    if (change.kind === "minor") {
      const [pending] = await tx.select().from(notificationsTable).where(and(
        eq(notificationsTable.recipientId, recipient.id),
        eq(notificationsTable.actorId, actor.id),
        eq(notificationsTable.conventionId, after.id),
        eq(notificationsTable.kind, "minor"),
        isNull(notificationsTable.readAt),
        gte(notificationsTable.createdAt, new Date(now.getTime() - GROUP_WINDOW_MS)),
      )).limit(1);
      if (pending) {
        await tx.update(notificationsTable).set({
          changedFields: [...new Set([...pending.changedFields, ...change.changedFields])],
          eventCount: pending.eventCount + 1,
          updatedAt: now,
        }).where(eq(notificationsTable.id, pending.id));
        continue;
      }
    }
    await tx.insert(notificationsTable).values({
      recipientId: recipient.id, conventionId: after.id,
      actorId: actor.id, actorUsername: actor.username,
      kind: change.kind, changedFields: change.changedFields,
      createdAt: now, updatedAt: now,
    });
  }
}
