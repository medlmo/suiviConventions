import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const usersTable = pgTable(
  "app_users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull(),
    direction: text("direction"),
    division: text("division"),
    service: text("service"),
    active: boolean("active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("app_users_role_idx").on(table.role)],
);

export const sessionsTable = pgTable(
  "app_sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("app_sessions_user_idx").on(table.userId), index("app_sessions_expires_idx").on(table.expiresAt)],
);

export const conventionAuditTable = pgTable(
  "convention_audit",
  {
    id: serial("id").primaryKey(),
    conventionId: integer("convention_id").notNull(),
    action: text("action").notNull(),
    actorUsername: text("actor_username").notNull(),
    before: jsonb("before").$type<Record<string, unknown> | null>(),
    after: jsonb("after").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("convention_audit_convention_idx").on(table.conventionId),
    index("convention_audit_created_idx").on(table.createdAt),
  ],
);

export type AppUser = typeof usersTable.$inferSelect;
export type Session = typeof sessionsTable.$inferSelect;
export type ConventionAudit = typeof conventionAuditTable.$inferSelect;