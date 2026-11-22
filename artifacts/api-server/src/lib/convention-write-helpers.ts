import type { Convention } from "@workspace/db";
import { calculateDeadline } from "./echeances";

type ChampsEcheanceConvention = Pick<
  Convention,
  "nature" | "dateVisa" | "dernierComite" | "frequenceReunions" | "prochaineEcheance"
>;

type DocumentAjoute = {
  type: string;
  objectPath: string;
};

/** Maintient les anciennes colonnes scalaires à jour pour les clients et exports existants. */
export function applyAddedDocumentColumns(
  valeurs: Record<string, unknown>,
  documents: readonly DocumentAjoute[] | undefined,
): void {
  for (const document of documents ?? []) {
    if (document.type === "pv") valeurs.pv = document.objectPath;
    if (document.type === "convention") valeurs.documentConvention = document.objectPath;
  }
}

/** Recalcule l'échéance seulement selon les mêmes règles que la route PATCH historique. */
export function applyDeadlineOnUpdate(
  current: ChampsEcheanceConvention,
  valeurs: Record<string, unknown>,
): void {
  const valeurFinale = (champ: "nature" | "dateVisa" | "dernierComite" | "frequenceReunions") =>
    Object.hasOwn(valeurs, champ) ? valeurs[champ] as string | null : current[champ];
  const previousDeadline = calculateDeadline(current);
  const deadline = calculateDeadline({
    nature: valeurFinale("nature"),
    dateVisa: valeurFinale("dateVisa"),
    dernierComite: valeurFinale("dernierComite"),
    frequenceReunions: valeurFinale("frequenceReunions"),
  });
  const champsDeterminants = valeurFinale("dernierComite")
    ? (["dernierComite", "frequenceReunions"] as const)
    : (["dernierComite", "nature", "dateVisa"] as const);
  const sourcesChangees = champsDeterminants
    .some((champ) => Object.hasOwn(valeurs, champ) && valeurs[champ] !== current[champ]);

  if (
    deadline &&
    (sourcesChangees || !current.prochaineEcheance || current.prochaineEcheance === deadline.date)
  ) {
    // Une ancienne date manuelle différente du calcul est conservée tant que
    // ni la date de base, ni la fréquence, ni la nature n'ont changé.
    valeurs.prochaineEcheance = deadline.date;
  } else if (
    previousDeadline &&
    current.prochaineEcheance === previousDeadline.date &&
    !Object.hasOwn(valeurs, "prochaineEcheance") &&
    sourcesChangees
  ) {
    // Si l'ancien calcul n'est plus possible, ne pas laisser une ancienne
    // échéance automatique passer pour une date saisie manuellement.
    valeurs.prochaineEcheance = null;
  }
}
