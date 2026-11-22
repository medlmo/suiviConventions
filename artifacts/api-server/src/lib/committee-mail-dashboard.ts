import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { conventionsTable, db, mailRemindersTable, usersTable } from "@workspace/db";
import {
  isAutomaticMailSendingEnabled,
  listEligibleCommitteeReminders,
} from "./committee-mail-reminders";

const HISTORY_LIMIT = 200;

function cleRappel(value: {
  recipientId: number;
  conventionId: number;
  deadlineDate: string;
  reminderDays: number;
}): string {
  return `${value.recipientId}:${value.conventionId}:${value.deadlineDate}:${value.reminderDays}`;
}

export async function getAdminMailReminderLog() {
  const [eligible, history] = await Promise.all([
    listEligibleCommitteeReminders(),
    db.select({
      id: mailRemindersTable.id,
      recipientId: mailRemindersTable.recipientId,
      recipientUsername: usersTable.username,
      recipientEmail: usersTable.email,
      conventionId: mailRemindersTable.conventionId,
      conventionName: conventionsTable.nomConvention,
      deadlineDate: mailRemindersTable.deadlineDate,
      reminderDays: mailRemindersTable.reminderDays,
      status: mailRemindersTable.state,
      attempts: mailRemindersTable.attempts,
      lastErrorCode: mailRemindersTable.lastErrorCode,
      nextAttemptAt: mailRemindersTable.nextAttemptAt,
      sentAt: mailRemindersTable.sentAt,
      createdAt: mailRemindersTable.createdAt,
      daysRemaining: sql<number>`${mailRemindersTable.deadlineDate} - CURRENT_DATE`.mapWith(Number),
    }).from(mailRemindersTable)
      .innerJoin(usersTable, eq(usersTable.id, mailRemindersTable.recipientId))
      .innerJoin(conventionsTable, eq(conventionsTable.id, mailRemindersTable.conventionId))
      .orderBy(desc(mailRemindersTable.id))
      .limit(HISTORY_LIMIT),
  ]);

  const existingKeys = new Set<string>();
  if (eligible.length) {
    const recipientIds = [...new Set(eligible.map((item) => item.recipientId))];
    const conventionIds = [...new Set(eligible.map((item) => item.conventionId))];
    const existing = await db.select({
      recipientId: mailRemindersTable.recipientId,
      conventionId: mailRemindersTable.conventionId,
      deadlineDate: mailRemindersTable.deadlineDate,
      reminderDays: mailRemindersTable.reminderDays,
    }).from(mailRemindersTable).where(and(
      inArray(mailRemindersTable.recipientId, recipientIds),
      inArray(mailRemindersTable.conventionId, conventionIds),
      gte(mailRemindersTable.deadlineDate, sql`CURRENT_DATE + 1`),
      lte(mailRemindersTable.deadlineDate, sql`CURRENT_DATE + 30`),
    ));
    for (const item of existing) existingKeys.add(cleRappel(item));
  }

  const eligibleItems = eligible
    .filter((item) => !existingKeys.has(cleRappel({
      recipientId: item.recipientId,
      conventionId: item.conventionId,
      deadlineDate: item.deadlineDate,
      reminderDays: item.reminderDays,
    })))
    .map((item) => ({
      id: null,
      recipientUsername: item.recipientUsername,
      recipientEmail: item.recipientEmail,
      conventionId: item.conventionId,
      conventionName: item.conventionName,
      deadlineDate: item.deadlineDate,
      reminderDays: item.reminderDays,
      daysRemaining: item.daysRemaining,
      status: "eligible" as const,
      attempts: 0,
      lastErrorCode: null,
      nextAttemptAt: null,
      sentAt: null,
      createdAt: null,
    }));

  const historyItems = history.map((item) => ({
    id: item.id,
    recipientUsername: item.recipientUsername,
    recipientEmail: item.recipientEmail,
    conventionId: item.conventionId,
    conventionName: item.conventionName,
    deadlineDate: item.deadlineDate,
    reminderDays: item.reminderDays,
    daysRemaining: item.daysRemaining,
    status: item.status === "pending" && item.lastErrorCode
      ? "failed" as const
      : item.status,
    attempts: item.attempts,
    lastErrorCode: item.lastErrorCode,
    nextAttemptAt: item.nextAttemptAt?.toISOString() ?? null,
    sentAt: item.sentAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
  }));

  const items = [...eligibleItems, ...historyItems];
  const summary = {
    eligible: 0, pending: 0, sending: 0, sent: 0, failed: 0, cancelled: 0,
  };
  for (const item of items) summary[item.status]++;

  return {
    generatedAt: new Date().toISOString(),
    enabled: isAutomaticMailSendingEnabled(),
    historyLimit: HISTORY_LIMIT,
    summary,
    items,
  };
}
