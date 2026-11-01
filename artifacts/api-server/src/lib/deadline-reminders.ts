import { and, eq, gte, isNull, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { conventionsTable, db, notificationsTable } from "@workspace/db";
import type { SessionUser } from "./auth";
import { filtrePerimetre } from "./convention-access";
import type { ReferenceData } from "./reference-data";

const CLOSED_STATUSES = ["Arrivée à terme", "Résiliée"];

function conventionOuverte() {
  return or(
    isNull(conventionsTable.statutConvention),
    notInArray(conventionsTable.statutConvention, CLOSED_STATUSES),
  );
}

/** The database connection uses Casablanca time; keep date arithmetic calendar-only. */
const joursRestants = sql<number>`(${conventionsTable.prochaineEcheance} - CURRENT_DATE)::int`;

/**
 * Materialize reminders when the signed-in chief's notification feed is refreshed.
 * No in-memory timer: this also works after an Autoscale sleep or on multiple instances.
 * Catch up only the current window (J-14 to J-8, then J-7 to J-1), not both at once.
 */
export async function genererRappelsEcheance(user: SessionUser, reference: ReferenceData): Promise<void> {
  if (user.role !== "chef_service") return;

  await db.transaction(async (tx) => {
    // Same recipient lock as read-all and change notifications.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(741025, ${user.id})`);
    const upcoming = await tx.select({
      id: conventionsTable.id,
      deadlineDate: conventionsTable.prochaineEcheance,
      daysLeft: joursRestants.mapWith(Number),
    }).from(conventionsTable).where(and(
      isNull(conventionsTable.deletedAt),
      filtrePerimetre(user, reference),
      conventionOuverte(),
      gte(joursRestants, 1),
      lte(joursRestants, 14),
    ));
    if (upcoming.length === 0) return;

    const now = new Date();
    await tx.insert(notificationsTable).values(upcoming.map((convention) => ({
      recipientId: user.id,
      conventionId: convention.id,
      actorId: null,
      actorUsername: "Système",
      kind: "deadline" as const,
      deadlineDate: convention.deadlineDate,
      reminderDays: convention.daysLeft <= 7 ? 7 : 14,
      changedFields: [],
      createdAt: now,
      updatedAt: now,
    }))).onConflictDoNothing({
      target: [
        notificationsTable.recipientId, notificationsTable.conventionId,
        notificationsTable.deadlineDate, notificationsTable.reminderDays,
      ],
    });
  });
}

/** Do not show obsolete dates or reminders for a convention that has since closed. */
export function rappelEcheanceVisible(user: SessionUser) {
  return user.role === "chef_service"
    ? or(ne(notificationsTable.kind, "deadline"), and(
        eq(notificationsTable.deadlineDate, conventionsTable.prochaineEcheance),
        conventionOuverte(),
      ))
    : ne(notificationsTable.kind, "deadline");
}

export function resumeRappelEcheance(deadlineDate: string | null, reminderDays: number | null): string {
  if (!deadlineDate || !/^\d{4}-\d{2}-\d{2}$/.test(deadlineDate) ||
      (reminderDays !== 7 && reminderDays !== 14)) {
    throw new Error("Invalid deadline reminder metadata");
  }
  const [year, month, day] = deadlineDate.split("-");
  const interval = reminderDays === 14 ? "deux semaines" : "une semaine";
  return `Prochaine échéance le ${day}/${month}/${year} : rappel ${interval} avant (J−${reminderDays}).`;
}
