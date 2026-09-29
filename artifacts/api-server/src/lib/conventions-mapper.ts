import { getTableColumns, sql, type SQL } from "drizzle-orm";
import { conventionsTable } from "@workspace/db";
import {
  construireAlerte,
  joursRestantsSql,
  niveauAlerteSql,
  type NiveauAlerte,
} from "./alertes";

/** Colonnes de la table + les deux valeurs recalculées à chaque lecture. */
export const colonnesConvention = {
  ...getTableColumns(conventionsTable),
  niveauAlerte: niveauAlerteSql,
  joursRestants: joursRestantsSql,
};

type LigneConvention = typeof conventionsTable.$inferSelect & {
  niveauAlerte: NiveauAlerte;
  joursRestants: number | null;
};

function nombreOuNull(valeur: string | null): number | null {
  if (valeur === null) return null;
  const nombre = Number(valeur);
  return Number.isFinite(nombre) ? nombre : null;
}

/** Ligne de base -> objet Convention du contrat OpenAPI. */
export function versApi(ligne: LigneConvention) {
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
    enveloppeBudgetaire: nombreOuNull(ligne.enveloppeBudgetaire),
    contributionRegion: nombreOuNull(ligne.contributionRegion),
    maitriseOuvrage: ligne.maitrisesOuvrage ?? (ligne.maitriseOuvrage ? [ligne.maitriseOuvrage] : []),
    maitriseOuvrageDeleguee: ligne.maitrisesOuvrageDeleguees ??
      (ligne.maitriseOuvrageDeleguee ? [ligne.maitriseOuvrageDeleguee] : []),
    prochainComite: ligne.prochainComite,
    dernierComite: ligne.dernierComite,
    dernierComiteNote: ligne.dernierComiteNote,
    pv: ligne.pv,
    decision: ligne.decision,
    competence: ligne.competence,
    nature: ligne.nature,
    documentConvention: ligne.documentConvention,
    ficheTechnique: ligne.ficheTechnique,
    statutConvention: ligne.statutConvention,
    prochaineEcheance: ligne.prochaineEcheance,
    prochaineEcheanceNote: ligne.prochaineEcheanceNote,
    natureFonds: ligne.natureFonds,
    commentaires: ligne.commentaires,
    sourceImport: ligne.sourceImport,
    alerte: construireAlerte(ligne.niveauAlerte, ligne.joursRestants),
    creeLe: ligne.createdAt.toISOString(),
    modifieLe: ligne.updatedAt.toISOString(),
  };
}

export type ConventionApi = ReturnType<typeof versApi>;

const CHAMPS_TEXTE = [
  "nomConvention",
  "objetConventionFr",
  "rattachement",
  "responsableProjet",
  "typeSession",
  "presidenceComite",
  "membresComite",
  "frequenceReunions",
  "dernierComiteNote",
  "pv",
  "decision",
  "competence",
  "nature",
  "documentConvention",
  "ficheTechnique",
  "statutConvention",
  "prochaineEcheanceNote",
  "natureFonds",
  "commentaires",
] as const;

const CHAMPS_LISTE_TEXTE = ["maitriseOuvrage", "maitriseOuvrageDeleguee"] as const;

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
>;

/**
 * Les schémas générés depuis l'OpenAPI coercent les `format: date` en objets
 * Date. Les colonnes, elles, sont des jours calendaires stockés en texte : on
 * repasse par les composantes UTC pour ne pas décaler la date d'un jour.
 */
function versJourCalendaire(valeur: string | Date | null | undefined): string | null {
  if (valeur === null || valeur === undefined || valeur === "") return null;
  if (valeur instanceof Date) {
    if (Number.isNaN(valeur.getTime())) return null;
    return valeur.toISOString().slice(0, 10);
  }
  return valeur;
}

/**
 * Corps de requête -> valeurs de colonnes.
 *
 * Seules les clés réellement présentes sont reprises, pour qu'un PATCH partiel
 * n'efface pas les champs absents. Les chaînes vides envoyées par les
 * formulaires sont ramenées à NULL : « pas de date » et « date vide » doivent
 * être la même chose en base, sinon les filtres et le calcul d'alerte divergent.
 */
export function versColonnes(corps: ChampsEcrivables): Record<string, unknown> {
  const valeurs: Record<string, unknown> = {};

  for (const champ of CHAMPS_TEXTE) {
    if (!(champ in corps)) continue;
    const brut = corps[champ];
    const nettoye = typeof brut === "string" ? brut.trim() : brut;
    valeurs[champ] = nettoye === "" ? null : (nettoye ?? null);
  }

  for (const champ of CHAMPS_LISTE_TEXTE) {
    if (!(champ in corps)) continue;
    const colonne = champ === "maitriseOuvrage" ? "maitrisesOuvrage" : "maitrisesOuvrageDeleguees";
    const brut = corps[champ];
    valeurs[colonne] = brut == null ? [] : [...new Set(brut.map((nom) => nom.trim()).filter(Boolean))];
  }

  for (const champ of CHAMPS_DATE) {
    if (!(champ in corps)) continue;
    valeurs[champ] = versJourCalendaire(corps[champ]);
  }

  for (const champ of CHAMPS_MONTANT) {
    if (!(champ in corps)) continue;
    const brut = corps[champ];
    valeurs[champ] = brut === null || brut === undefined ? null : String(brut);
  }

  return valeurs;
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

export function normaliserPourRecherche(expression: SQL | string): SQL {
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
export function echapperJokersLike(terme: string): string {
  return terme.replace(/[\\%_]/g, "\\$&");
}
