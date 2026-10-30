import { index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./auth";
import { conventionsTable } from "./conventions";

export const notificationsTable = pgTable("convention_notifications", {
  id: serial("id").primaryKey(),
  recipientId: integer("recipient_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  conventionId: integer("convention_id").notNull().references(() => conventionsTable.id, { onDelete: "cascade" }),
  actorId: integer("actor_id").references(() => usersTable.id, { onDelete: "set null" }),
  actorUsername: text("actor_username").notNull(),
  kind: text("kind").$type<"creation" | "important" | "minor">().notNull(),
  changedFields: jsonb("changed_fields").$type<string[]>().notNull().default([]),
  eventCount: integer("event_count").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp("read_at", { withTimezone: true }),
}, (table) => [
  index("convention_notifications_recipient_date_idx").on(table.recipientId, table.updatedAt, table.id),
  index("convention_notifications_group_idx").on(table.recipientId, table.conventionId, table.actorId),
]);

export type ConventionNotification = typeof notificationsTable.$inferSelect;
