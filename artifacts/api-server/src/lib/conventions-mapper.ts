import { getTableColumns, sql, type SQL } from "drizzle-orm";
import { conventionsTable, type SituationVersementAnnuelle, type SuiviFinancier } from "@workspace/db";
import { getConventionDocuments } from "./document-history-mapper";
export { getConventionDocuments } from "./document-history-mapper";
import {
  buildAlert,
  joursRestantsSql,
  niveauAlerteSql,
  type NiveauAlerte,
} from "./alertes";
import { getDisplayPartnerName, PARTENAIRE_REGION } from "./situation-versements";

/** Colonnes de la table + les deux valeurs recalculées à chaque lecture. */
export const conventionColumns = {
  ...getTableColumns(conventionsTable),
  niveauAlerte: niveauAlerteSql,
  joursRestants: joursRestantsSql,
};

type LigneConvention = typeof conventionsTable.$inferSelect & {
  niveauAlerte: NiveauAlerte;
  joursRestants: number | null;
};

function toNumberOrNull(value: string | null): number | null {
  if (value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function mapPaymentsToApi(lines: SituationVersementAnnuelle[]) {
  return lines.map((line) => {
    if ("tranches" in line) {
      const tranches = line.tranches.map((installment) => ({
        montant: installment.montant,
        ...(installment.dateVersement ? { dateVersement: installment.dateVersement } : {}),
      }));
      const paidAmountCents = tranches.reduce((total, tranche) => total + Math.round(tranche.montant * 100), 0);
      const paidAmount = tranches.length > 0 ? paidAmountCents / 100 : line.montantVerse;
      return {
        annee: line.annee,
        partenaire: "partenaire" in line ? getDisplayPartnerName(line.partenaire) : PARTENAIRE_REGION,
        montantVerse: paidAmount,
        tranches,
      };
    }
    const tranches = line.montantVerse > 0
      ? [{ montant: line.montantVerse, ...(line.dateDernierVersement ? { dateVersement: line.dateDernierVersement } : {}) }]
      : [];
    return {
      annee: line.annee,
      partenaire: PARTENAIRE_REGION,
      montantVerse: line.montantVerse,
      tranches,
    };
  });
}

/** Ligne de base -> objet Convention du contrat OpenAPI. */
export function toApiConvention(ligne: LigneConvention) {
  return {
    id: ligne.id,
    version: ligne.version,
    nomConvention: ligne.nomConvention,
    objetConventionFr: ligne.objetConventionFr,
    rattachement: ligne.rattachement,
    responsableProjet: ligne.responsableProjet,
    typeSession: ligne.typeSession,
    session: ligne.session,
    dateVisa: ligne.dateVisa,
    presidenceComite: ligne.presidenceComite,
    membresComite: ligne.membresComite,
    frequenceReunions: ligne.frequenceReunions,
    enveloppeBudgetaire: toNumberOrNull(ligne.enveloppeBudgetaire),
    contributionRegion: toNumberOrNull(ligne.contributionRegion),
    porteurProjet: ligne.porteurProjet,
    maitriseOuvrage: ligne.maitrisesOuvrage ?? (ligne.maitriseOuvrage ? [ligne.maitriseOuvrage] : []),
    maitriseOuvrageDeleguee: ligne.maitrisesOuvrageDeleguees ??
      (ligne.maitriseOuvrageDeleguee ? [ligne.maitriseOuvrageDeleguee] : []),
    partenaires: ligne.partenaires ?? [],
    suiviFinancier: ligne.suiviFinancier ?? { annees: [], lignes: [] },
    situationVersements: mapPaymentsToApi(ligne.situationVersements ?? []),
    avancementPhysiqueHistorique: ligne.avancementPhysiqueHistorique ?? [],
    provincesPrefectures: ligne.provincesPrefectures ?? [],
    communes: ligne.communes ?? [],
    prochainComite: ligne.prochainComite,
    dernierComite: ligne.dernierComite,
    dernierComiteNote: ligne.dernierComiteNote,
    pv: ligne.pv,
    decision: ligne.decision,
    competence: ligne.competence,
    nature: ligne.nature,
    initiateur: ligne.initiateur,
    secteur: ligne.secteur,
    documentConvention: ligne.documentConvention,
    documents: getConventionDocuments(ligne),
    ficheTechnique: ligne.ficheTechnique,
    statutConvention: ligne.statutConvention,
    prochaineEcheance: ligne.prochaineEcheance,
    prochaineEcheanceNote: ligne.prochaineEcheanceNote,
    natureFonds: ligne.natureFonds,
    commentaires: ligne.commentaires,
    sourceImport: ligne.sourceImport,
    alerte: buildAlert(ligne.niveauAlerte, ligne.joursRestants),
    creeLe: ligne.createdAt.toISOString(),
    modifieLe: ligne.updatedAt.toISOString(),
  };
}

export type ConventionApi = ReturnType<typeof toApiConvention>;

const CHAMPS_TEXTE = [
  "nomConvention",
  "objetConventionFr",
  "rattachement",
  "responsableProjet",
  "porteurProjet",
  "typeSession",
  "presidenceComite",
  "membresComite",
  "frequenceReunions",
  "dernierComiteNote",
  "pv",
  "decision",
  "competence",
  "nature",
  "initiateur",
  "secteur",
  "documentConvention",
  "ficheTechnique",
  "statutConvention",
  "prochaineEcheanceNote",
  "natureFonds",
  "commentaires",
] as const;

const CHAMPS_LISTE_TEXTE = [
  "maitriseOuvrage",
  "maitriseOuvrageDeleguee",
  "partenaires",
  "provincesPrefectures",
  "communes",
] as const;
const COLONNES_LISTE_TEXTE = {
  maitriseOuvrage: "maitrisesOuvrage",
  maitriseOuvrageDeleguee: "maitrisesOuvrageDeleguees",
  partenaires: "partenaires",
  provincesPrefectures: "provincesPrefectures",
  communes: "communes",
} as const;

const CHAMPS_DATE = [
  "session",
  "dateVisa",
  "prochainComite",
  "dernierComite",
  "prochaineEcheance",
] as const;

const CHAMPS_MONTANT = ["enveloppeBudgetaire", "contributionRegion"] as const;

type ChampsEcrivables = Partial<
  Record<(typeof CHAMPS_TEXTE)[number], string | null> &
    Record<(typeof CHAMPS_LISTE_TEXTE)[number], string[] | null | undefined> &
    Record<(typeof CHAMPS_DATE)[number], string | Date | null> &
    Record<(typeof CHAMPS_MONTANT)[number], number | null>
> & {
  suiviFinancier?: SuiviFinancier;
  situationVersements?: {
    annee: number;
    partenaire: string;
    montantVerse: number;
    tranches: { montant: number; dateVersement?: string | Date }[];
  }[];
};

/**
 * Les schémas générés depuis l'OpenAPI coercent les `format: date` en objets
 * Date. Les colonnes, elles, sont des jours calendaires stockés en texte : on
 * repasse par les composantes UTC pour ne pas décaler la date d'un jour.
 */
function toCalendarDate(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  return value;
}

/**
 * Corps de requête -> valeurs de colonnes.
 *
 * Seules les clés réellement présentes sont reprises, pour qu'un PATCH partiel
 * n'efface pas les champs absents. Les chaînes vides envoyées par les
 * formulaires sont ramenées à NULL : « pas de date » et « date vide » doivent
 * être la même chose en base, sinon les filtres et le calcul d'alerte divergent.
 */
export function toConventionColumns(payload: ChampsEcrivables): Record<string, unknown> {
  const columns: Record<string, unknown> = {};
  if (payload.suiviFinancier !== undefined) columns.suiviFinancier = payload.suiviFinancier;
  if (payload.situationVersements !== undefined) {
    columns.situationVersements = payload.situationVersements.map(line => ({
      annee: line.annee,
      partenaire: line.partenaire,
      montantVerse: line.tranches.reduce((total, tranche) => total + Math.round(tranche.montant * 100), 0) / 100,
      tranches: line.tranches.map((tranche) => {
        const dateVersement = toCalendarDate(tranche.dateVersement);
        return { montant: tranche.montant, ...(dateVersement ? { dateVersement } : {}) };
      }),
    })).sort((a, b) => a.annee - b.annee || a.partenaire.localeCompare(b.partenaire, "fr"));
  }

  for (const champ of CHAMPS_TEXTE) {
    if (!(champ in payload)) continue;
    const rawValue = payload[champ];
    const trimmedValue = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    columns[champ] = trimmedValue === "" ? null : (trimmedValue ?? null);
  }

  for (const champ of CHAMPS_LISTE_TEXTE) {
    if (!(champ in payload)) continue;
    const colonne = COLONNES_LISTE_TEXTE[champ];
    const rawValue = payload[champ];
    columns[colonne] = rawValue == null ? [] : [...new Set(rawValue.map((name) => name.trim()).filter(Boolean))];
  }

  for (const champ of CHAMPS_DATE) {
    if (!(champ in payload)) continue;
    columns[champ] = toCalendarDate(payload[champ]);
  }

  for (const champ of CHAMPS_MONTANT) {
    if (!(champ in payload)) continue;
    const rawValue = payload[champ];
    columns[champ] = rawValue === null || rawValue === undefined ? null : String(rawValue);
  }

  return columns;
}

/**
 * Normalisation arabe pour la recherche.
 *
 * Les données viennent de deux saisies différentes qui n'emploient pas les
 * mêmes caractères : yeh farsi « ی » contre yeh arabe « ي », keheh « ک »
 * contre kaf « ك », alef hamzé « أ/إ/آ » contre alef nu « ا ». Sans
 * normalisation, chercher « اتفاقية » ne remonte que la moitié des
 * conventions — l'autre moitié est écrite « اتفاقیة ».
 *
 * La même transformation est appliquée à la colonne et au terme recherché.
 */
const ARABE_SOURCE = "یکىأإآٱةؤئ";
const ARABE_CIBLE = "يكيااااهوي";

/**
 * Caractères purement décoratifs à supprimer plutôt qu'à remplacer :
 * le tatweel « ـ » (allongement typographique) et les diacritiques (fatha,
 * kasra, shadda...). Ils changent la chaîne sans changer le mot, donc les
 * laisser ferait échouer une recherche par ailleurs correcte.
 */
const ARABE_A_SUPPRIMER =
  "\u0640\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652\u0653\u0654\u0655\u0670";

export function normalizeSearchExpression(expression: SQL | string): SQL {
  const cible =
    typeof expression === "string" ? sql`${expression}` : expression;
  return sql`translate(lower(${cible}), ${ARABE_SOURCE + ARABE_A_SUPPRIMER}, ${ARABE_CIBLE})`;
}

/**
 * Neutralise les jokers LIKE saisis par l'utilisateur.
 * Sans cela, taper « % » dans la recherche remonterait tout le fichier et
 * « _ » remplacerait n'importe quel caractère, ce qui donne des résultats
 * incompréhensibles pour l'agent qui cherche un nom précis.
 */
export function escapeLikeWildcards(term: string): string {
  return term.replace(/[\\%_]/g, "\\$&");
}
