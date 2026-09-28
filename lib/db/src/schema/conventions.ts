import { date, index, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Conventions de partenariat de la Région Souss-Massa.
 *
 * Règle structurante : le statut d'alerte n'est PAS une colonne. Il est
 * recalculé à chaque lecture à partir de `prochaineEcheance` et de la date du
 * jour (voir `artifacts/api-server/src/lib/alertes.ts`). Le fichier Excel
 * d'origine stockait ce statut en dur, ce qui le figeait au dernier recalcul
 * manuel et masquait la moitié des retards réels.
 *
 * Les champs `*Note` conservent les mentions du fichier source qui ne sont pas
 * convertibles en date (« غير محدد », « لم يعقد اي اجتماع », « سيتم برمجة
 * الاجتماع بعد التوصل بتقرير »...). Ce sont des informations métier, pas du
 * bruit : les jeter reviendrait à perdre la raison pour laquelle aucune date
 * n'est fixée.
 */
export const conventionsTable = pgTable(
  "conventions",
  {
    id: serial("id").primaryKey(),

    // Identification
    nomConvention: text("nom_convention").notNull(),
    objetConventionFr: text("objet_convention_fr"),
    rattachement: text("rattachement"),
    responsableProjet: text("responsable_projet"),
    typeSession: text("type_session"),
    session: date("session", { mode: "string" }),
    dateVisa: date("date_visa", { mode: "string" }),
    statutConvention: text("statut_convention"),
    decision: text("decision"),
    competence: text("competence"),
    nature: text("nature"),

    // Comité de suivi
    presidenceComite: text("presidence_comite"),
    membresComite: text("membres_comite"),
    frequenceReunions: text("frequence_reunions"),
    dernierComite: date("dernier_comite", { mode: "string" }),
    dernierComiteNote: text("dernier_comite_note"),
    prochainComite: date("prochain_comite", { mode: "string" }),
    prochaineEcheance: date("prochaine_echeance", { mode: "string" }),
    prochaineEcheanceNote: text("prochaine_echeance_note"),
    pv: text("pv"),

    // Budget (MAD)
    enveloppeBudgetaire: numeric("enveloppe_budgetaire", { precision: 15, scale: 2 }),
    contributionRegion: numeric("contribution_region", { precision: 15, scale: 2 }),
    natureFonds: text("nature_fonds"),
    maitriseOuvrage: text("maitrise_ouvrage"),
    maitriseOuvrageDeleguee: text("maitrise_ouvrage_deleguee"),

    // Documents
    documentConvention: text("document_convention"),
    ficheTechnique: text("fiche_technique"),

    // Divers
    commentaires: text("commentaires"),
    sourceImport: text("source_import"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("conventions_prochaine_echeance_idx").on(table.prochaineEcheance),
    index("conventions_statut_idx").on(table.statutConvention),
    index("conventions_responsable_idx").on(table.responsableProjet),
    index("conventions_rattachement_idx").on(table.rattachement),
  ],
);

export const insertConventionSchema = createInsertSchema(conventionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertConvention = z.infer<typeof insertConventionSchema>;
export type Convention = typeof conventionsTable.$inferSelect;
