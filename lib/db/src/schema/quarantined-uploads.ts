import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./auth";

export const quarantinedUploadsTable = pgTable(
  "quarantined_document_uploads",
  {
    id: uuid("id").primaryKey(),
    ownerId: integer("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    state: text("state").notNull(),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    documentObjectPath: text("document_object_path"),
    documentGeneration: text("document_generation"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("quarantined_uploads_owner_state_idx").on(table.ownerId, table.state),
    index("quarantined_uploads_state_retry_idx").on(table.state, table.nextAttemptAt),
    index("quarantined_uploads_expiry_idx").on(table.expiresAt),
    check(
      "quarantined_uploads_state_check",
      sql`${table.state} in ('storing', 'pending', 'scanning', 'ready', 'rejected')`,
    ),
    check("quarantined_uploads_size_check", sql`${table.size} between 1 and 10485760`),
  ],
);

export type QuarantinedUpload = typeof quarantinedUploadsTable.$inferSelect;
