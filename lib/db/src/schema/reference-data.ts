import { createInsertSchema } from "drizzle-zod";
import { index, integer, pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const directionsTable = pgTable(
  "reference_directions",
  {
    id: serial("id").primaryKey(),
    nom: text("nom").notNull(),
  },
  (table) => [uniqueIndex("reference_directions_nom_uq").on(table.nom)],
);

export const divisionsTable = pgTable(
  "reference_divisions",
  {
    id: serial("id").primaryKey(),
    directionId: integer("direction_id").notNull().references(() => directionsTable.id),
    nom: text("nom").notNull(),
  },
  (table) => [
    uniqueIndex("reference_divisions_nom_uq").on(table.nom),
    index("reference_divisions_direction_idx").on(table.directionId),
  ],
);

export const servicesTable = pgTable(
  "reference_services",
  {
    id: serial("id").primaryKey(),
    divisionId: integer("division_id").notNull().references(() => divisionsTable.id),
    nom: text("nom").notNull(),
  },
  (table) => [
    uniqueIndex("reference_services_nom_uq").on(table.nom),
    index("reference_services_division_idx").on(table.divisionId),
  ],
);

// Ces services dépendent de la DGS elle-même, pas d'une division.
export const servicesDgsTable = pgTable(
  "reference_services_dgs",
  { id: serial("id").primaryKey(), nom: text("nom").notNull() },
  (table) => [uniqueIndex("reference_services_dgs_nom_uq").on(table.nom)],
);

export const maitrisesOuvrageTable = pgTable(
  "reference_maitrises_ouvrage",
  {
    id: serial("id").primaryKey(),
    nom: text("nom").notNull(),
  },
  (table) => [uniqueIndex("reference_maitrises_ouvrage_nom_uq").on(table.nom)],
);

export const insertReferenceDirectionSchema = createInsertSchema(directionsTable).omit({ id: true });
export const insertReferenceDivisionSchema = createInsertSchema(divisionsTable).omit({ id: true });
export const insertReferenceServiceSchema = createInsertSchema(servicesTable).omit({ id: true });
export const insertReferenceServiceDgsSchema = createInsertSchema(servicesDgsTable).omit({ id: true });
export const insertMaitriseOuvrageSchema = createInsertSchema(maitrisesOuvrageTable).omit({ id: true });

export type ReferenceDirection = typeof directionsTable.$inferSelect;
export type ReferenceDivision = typeof divisionsTable.$inferSelect;
export type ReferenceService = typeof servicesTable.$inferSelect;
export type ReferenceServiceDgs = typeof servicesDgsTable.$inferSelect;
export type MaitriseOuvrage = typeof maitrisesOuvrageTable.$inferSelect;
export type InsertReferenceDirection = z.infer<typeof insertReferenceDirectionSchema>;
export type InsertReferenceDivision = z.infer<typeof insertReferenceDivisionSchema>;
export type InsertReferenceService = z.infer<typeof insertReferenceServiceSchema>;
export type InsertReferenceServiceDgs = z.infer<typeof insertReferenceServiceDgsSchema>;
export type InsertMaitriseOuvrage = z.infer<typeof insertMaitriseOuvrageSchema>;