import { date, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { conventionsTable } from "./conventions";

/** Durable delivery ledger, independent of whether the in-app reminder was read. */
export const mailRemindersTable = pgTable("committee_mail_reminders", {
  id: serial("id").primaryKey(),
  recipientId: integer("recipient_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  conventionId: integer("convention_id").notNull().references(() => conventionsTable.id, { onDelete: "cascade" }),
  deadlineDate: date("deadline_date", { mode: "string" }).notNull(),
  reminderDays: integer("reminder_days").notNull(),
  state: text("state").$type<"pending" | "sending" | "sent" | "cancelled">().notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  leaseToken: text("lease_token"),
  lastErrorCode: text("last_error_code"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("committee_mail_reminders_delivery_uq").on(
    table.recipientId, table.conventionId, table.deadlineDate, table.reminderDays,
  ),
  index("committee_mail_reminders_pending_idx").on(table.state, table.nextAttemptAt),
]);
