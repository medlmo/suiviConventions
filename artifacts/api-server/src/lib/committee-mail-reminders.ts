import { randomUUID } from "node:crypto";
import { and, eq, gte, isNotNull, isNull, lte, notInArray, or, sql } from "drizzle-orm";
import { conventionsTable, db, mailRemindersTable, usersTable } from "@workspace/db";
import { filtrePerimetre } from "./convention-access";
import { chargerReferentiel } from "./reference-data";
import { configurationMail, creerTransportSmtp, codeErreurSmtp } from "./smtp-mail";
import { contenuRappelComite } from "./committee-mail-content";
import { logger } from "./logger";

const joursRestants = sql<number>`(${conventionsTable.prochaineEcheance} - CURRENT_DATE)::int`;
const seuilActuel = sql<number>`CASE WHEN ${joursRestants} <= 14 THEN 14 ELSE 30 END`;
const conventionOuverte = () => or(
  isNull(conventionsTable.statutConvention),
  notInArray(conventionsTable.statutConvention, ["Arrivée à terme", "Résiliée"]),
);
let executionEnCours = false;

/** No dependency on a login or on the read state of in-app notifications. */
export async function envoyerRappelsComite(options: { dryRun?: boolean } = {}) {
  const result = { eligible: 0, queued: 0, sent: 0, cancelled: 0, failed: 0 };
  if (
    (!options.dryRun && (process.env.NODE_ENV !== "production" || process.env.MAIL_ENABLED !== "true")) ||
    executionEnCours
  ) return result;
  executionEnCours = true;
  try {
    const config = configurationMail();
    const transport = creerTransportSmtp();
    const reference = await chargerReferentiel();
    const chefs = await db.select({
      id: usersTable.id, username: usersTable.username, role: usersTable.role,
      direction: usersTable.direction, division: usersTable.division,
      service: usersTable.service, active: usersTable.active, email: usersTable.email,
    }).from(usersTable).where(and(
      eq(usersTable.active, true), eq(usersTable.role, "chef_service"), isNotNull(usersTable.email),
    ));

    for (const chef of chefs) {
      if (!chef.email || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(chef.email)) continue;
      const upcoming = await db.select({
        id: conventionsTable.id, deadline: conventionsTable.prochaineEcheance,
        threshold: seuilActuel.mapWith(Number),
      }).from(conventionsTable).where(and(
        isNull(conventionsTable.deletedAt), filtrePerimetre(chef, reference),
        conventionOuverte(), gte(joursRestants, 1), lte(joursRestants, 30),
      ));
      if (!upcoming.length) continue;
      result.eligible += upcoming.length;
      if (options.dryRun) continue;
      const inserted = await db.insert(mailRemindersTable).values(upcoming.map((row) => ({
        recipientId: chef.id, conventionId: row.id, deadlineDate: row.deadline!,
        reminderDays: row.threshold,
      }))).onConflictDoNothing().returning({ id: mailRemindersTable.id });
      result.queued += inserted.length;
    }
    if (options.dryRun) return result;

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
        const [chef] = await db.select().from(usersTable).where(and(
          eq(usersTable.id, job.recipientId), eq(usersTable.active, true),
          eq(usersTable.role, "chef_service"),
        ));
        const referenceActuelle = await chargerReferentiel();
        const [convention] = chef ? await db.select({
          title: conventionsTable.nomConvention, days: joursRestants.mapWith(Number),
        }).from(conventionsTable).where(and(
          eq(conventionsTable.id, job.conventionId), isNull(conventionsTable.deletedAt),
          eq(conventionsTable.prochaineEcheance, job.deadlineDate),
          eq(seuilActuel, job.reminderDays),
          filtrePerimetre(chef, referenceActuelle), conventionOuverte(),
          gte(joursRestants, 1), lte(joursRestants, 30),
        )) : [];
        if (!chef?.email || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(chef.email) || !convention) {
          await db.update(mailRemindersTable).set({
            state: "cancelled", leaseUntil: null, leaseToken: null,
          }).where(owned);
          result.cancelled++;
          continue;
        }
        const message = contenuRappelComite(
          convention.title, job.deadlineDate, job.reminderDays, convention.days,
          `${config.publicUrl}/conventions/${job.conventionId}`,
        );
        const delivered = await transport.sendMail({
          from: { name: "Suivi des conventions — Région Souss Massa", address: config.from },
          to: chef.email, ...message,
          messageId: `<committee-${job.recipientId}-${job.conventionId}-${job.deadlineDate}-${job.reminderDays}@${config.messageDomain}>`,
        });
        if (!delivered.accepted?.length) throw new Error("SMTP_RECIPIENT_NOT_ACCEPTED");
        await db.update(mailRemindersTable).set({
          state: "sent", sentAt: new Date(), leaseUntil: null, leaseToken: null, lastErrorCode: null,
        }).where(owned);
        result.sent++;
      } catch (error) {
        const errorCode = codeErreurSmtp(error);
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
    executionEnCours = false;
  }
}

let prochaineVerification = 0;
let verificationEnCours: Promise<void> | undefined;

/** Activity-triggered check, not a timer. Await SMTP work before ending the request. */
export async function verifierRappelsMail(): Promise<void> {
  if (process.env.NODE_ENV !== "production" || process.env.MAIL_ENABLED !== "true") return;
  if (verificationEnCours) return verificationEnCours;
  if (Date.now() < prochaineVerification) return;
  prochaineVerification = Date.now() + 15 * 60_000;
  verificationEnCours = envoyerRappelsComite()
    .then(() => undefined)
    .catch(() => {
      logger.error({
        event: "mail.reminders.failed", operation: "mail.reminders",
        errorCode: "MAIL_REMINDERS_FAILED",
      }, "Committee email reminder check failed; in-app notifications remain available");
    })
    .finally(() => { verificationEnCours = undefined; });
  return verificationEnCours;
}
