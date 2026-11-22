import { randomUUID } from "node:crypto";
import { and, eq, gte, inArray, isNotNull, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import { conventionsTable, db, mailRemindersTable, usersTable } from "@workspace/db";
import { buildScopeSqlFilter } from "./convention-access";
import { loadReferenceData } from "./reference-data";
import { getMailConfiguration, createSmtpTransport, getSmtpErrorCode } from "./smtp-mail";
import { buildCommitteeReminderContent } from "./committee-mail-content";
import { isReminderRecipient } from "./notifications-domain";
import { logger } from "./logger";

const daysRemainingSql = sql<number>`(${conventionsTable.prochaineEcheance} - CURRENT_DATE)::int`;
const reminderThresholdSql = sql<number>`CASE WHEN ${daysRemainingSql} <= 14 THEN 14 ELSE 30 END`;
const isConventionOpen = () => or(
  isNull(conventionsTable.statutConvention),
  notInArray(conventionsTable.statutConvention, ["Arrivée à terme", "Résiliée"]),
);
let executionInProgress = false;

export function isAutomaticMailSendingEnabled(): boolean {
  return (process.env.NODE_ENV === "production" && process.env.MAIL_ENABLED === "true") ||
    (process.env.NODE_ENV === "development" && process.env.MAIL_DEV_ENABLED === "true");
}

export type EligibleCommitteeReminder = {
  recipientId: number;
  recipientUsername: string;
  recipientEmail: string;
  conventionId: number;
  conventionName: string;
  deadlineDate: string;
  reminderDays: number;
  daysRemaining: number;
};

/** Lecture seule des rappels qui remplissent actuellement les critères d'envoi. */
export async function listEligibleCommitteeReminders(): Promise<EligibleCommitteeReminder[]> {
  const reference = await loadReferenceData();
  const recipients = await db.select({
    id: usersTable.id, username: usersTable.username, role: usersTable.role,
    direction: usersTable.direction, division: usersTable.division,
    service: usersTable.service, active: usersTable.active, email: usersTable.email,
  }).from(usersTable).where(and(
    eq(usersTable.active, true),
    inArray(usersTable.role, ["chef_service", "chef_division", "directeur", "directeur_general_services"]),
    isNotNull(usersTable.email),
  ));
  const eligibleReminders: EligibleCommitteeReminder[] = [];
  for (const recipient of recipients) {
    if (!recipient.email || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(recipient.email)) continue;
    const upcoming = await db.select({
      id: conventionsTable.id,
      conventionName: conventionsTable.nomConvention,
      deadline: conventionsTable.prochaineEcheance,
      daysRemaining: daysRemainingSql.mapWith(Number),
      reminderDays: reminderThresholdSql.mapWith(Number),
      rattachement: conventionsTable.rattachement,
      responsableProjet: conventionsTable.responsableProjet,
    }).from(conventionsTable).where(and(
      isNull(conventionsTable.deletedAt), buildScopeSqlFilter(recipient, reference),
      isConventionOpen(), gte(daysRemainingSql, 1), lte(daysRemainingSql, 30),
    )).then((rows) => rows.filter((row) => isReminderRecipient(recipient, row, reference)));
    for (const row of upcoming) {
      eligibleReminders.push({
        recipientId: recipient.id,
        recipientUsername: recipient.username,
        recipientEmail: recipient.email,
        conventionId: row.id,
        conventionName: row.conventionName,
        deadlineDate: row.deadline!,
        reminderDays: row.reminderDays,
        daysRemaining: row.daysRemaining,
      });
    }
  }
  return eligibleReminders;
}

/** No dependency on a login or on the read state of in-app notifications. */
export async function sendCommitteeReminders(options: { dryRun?: boolean } = {}) {
  const result = { eligible: 0, queued: 0, sent: 0, cancelled: 0, failed: 0 };
  if (
    (!options.dryRun && !isAutomaticMailSendingEnabled()) ||
    executionInProgress
  ) return result;
  executionInProgress = true;
  try {
    const config = getMailConfiguration();
    const transport = createSmtpTransport();
    const upcoming = await listEligibleCommitteeReminders();
    result.eligible = upcoming.length;
    if (options.dryRun) return result;
    if (upcoming.length > 0) {
      const inserted = await db.insert(mailRemindersTable).values(upcoming.map((row) => ({
        recipientId: row.recipientId, conventionId: row.conventionId,
        deadlineDate: row.deadlineDate, reminderDays: row.reminderDays,
      }))).onConflictDoNothing().returning({ id: mailRemindersTable.id });
      result.queued += inserted.length;
    }

    // Bound work per invocation; multiple instances claim different rows atomically.
    for (let count = 0; count < 100; count++) {
      const token = randomUUID();
      const job = await db.transaction(async (tx) => {
        const [candidate] = await tx.select().from(mailRemindersTable).where(and(
          or(
            eq(mailRemindersTable.state, "pending"),
            and(eq(mailRemindersTable.state, "sending"), lte(mailRemindersTable.leaseUntil, new Date())),
          ),
          lte(mailRemindersTable.nextAttemptAt, new Date()),
        )).orderBy(mailRemindersTable.id).limit(1).for("update", { skipLocked: true });
        if (!candidate) return null;
        await tx.update(mailRemindersTable).set({
          state: "sending", leaseToken: token,
          leaseUntil: new Date(Date.now() + 10 * 60_000), attempts: candidate.attempts + 1,
        }).where(eq(mailRemindersTable.id, candidate.id));
        return candidate;
      });
      if (!job) break;
      const owned = and(eq(mailRemindersTable.id, job.id), eq(mailRemindersTable.leaseToken, token));
      try {
        // Resolve current account, address, organisation and deadline just before sending.
        const [recipient] = await db.select().from(usersTable).where(and(
          eq(usersTable.id, job.recipientId), eq(usersTable.active, true),
          inArray(usersTable.role, ["chef_service", "chef_division", "directeur", "directeur_general_services"]),
        ));
        const currentReference = await loadReferenceData();
        const [convention] = recipient ? await db.select({
          title: conventionsTable.nomConvention, days: daysRemainingSql.mapWith(Number),
          rattachement: conventionsTable.rattachement,
          responsableProjet: conventionsTable.responsableProjet,
        }).from(conventionsTable).where(and(
          eq(conventionsTable.id, job.conventionId), isNull(conventionsTable.deletedAt),
          eq(conventionsTable.prochaineEcheance, job.deadlineDate),
          eq(reminderThresholdSql, job.reminderDays),
          buildScopeSqlFilter(recipient, currentReference), isConventionOpen(),
          gte(daysRemainingSql, 1), lte(daysRemainingSql, 30),
        )) : [];
        if (
          !recipient?.email ||
          !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(recipient.email) ||
          !convention ||
          !isReminderRecipient(recipient, convention, currentReference)
        ) {
          await db.update(mailRemindersTable).set({
            state: "cancelled", leaseUntil: null, leaseToken: null,
          }).where(owned);
          result.cancelled++;
          continue;
        }
        const message = buildCommitteeReminderContent(
          convention.title, job.deadlineDate, job.reminderDays, convention.days,
          `${config.publicUrl}/conventions/${job.conventionId}`,
        );
        const delivered = await transport.sendMail({
          from: { name: "Suivi des conventions — Région Souss Massa", address: config.from },
          to: recipient.email, ...message,
          messageId: `<committee-${job.recipientId}-${job.conventionId}-${job.deadlineDate}-${job.reminderDays}@${config.messageDomain}>`,
        });
        if (!delivered.accepted?.length) throw new Error("SMTP_RECIPIENT_NOT_ACCEPTED");
        await db.update(mailRemindersTable).set({
          state: "sent", sentAt: new Date(), leaseUntil: null, leaseToken: null, lastErrorCode: null,
        }).where(owned);
        result.sent++;
      } catch (error) {
        const errorCode = getSmtpErrorCode(error);
        await db.update(mailRemindersTable).set({
          state: "pending", leaseUntil: null, leaseToken: null, lastErrorCode: errorCode,
          nextAttemptAt: new Date(Date.now() + Math.min(24 * 60, 15 * 2 ** Math.min(job.attempts, 7)) * 60_000),
        }).where(owned);
        logger.warn({ event: "mail.reminder.failed", operation: "mail.reminder", jobId: job.id, errorCode }, "Committee reminder delivery failed");
        result.failed++;
      }
    }
    logger.info({ event: "mail.reminders.completed", operation: "mail.reminders", ...result }, "Committee email reminders processed");
    return result;
  } finally {
    executionInProgress = false;
  }
}

let nextVerificationAt = 0;
let verificationInProgress: Promise<void> | undefined;

/** Activity-triggered check, not a timer. Await SMTP work before ending the request. */
export async function checkMailReminders(): Promise<void> {
  if (!isAutomaticMailSendingEnabled()) return;
  if (verificationInProgress) return verificationInProgress;
  if (Date.now() < nextVerificationAt) return;
  nextVerificationAt = Date.now() + 60 * 60_000;
  verificationInProgress = sendCommitteeReminders()
    .then(() => undefined)
    .catch(() => {
      logger.error({
        event: "mail.reminders.failed", operation: "mail.reminders",
        errorCode: "MAIL_REMINDERS_FAILED",
      }, "Committee email reminder check failed; in-app notifications remain available");
    })
    .finally(() => { verificationInProgress = undefined; });
  return verificationInProgress;
}
