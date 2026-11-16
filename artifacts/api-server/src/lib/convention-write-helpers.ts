import type { Convention } from "@workspace/db";
import { calculerEcheance } from "./echeances";

type ChampsEcheanceConvention = Pick<
  Convention,
  "nature" | "dateVisa" | "dernierComite" | "frequenceReunions" | "prochaineEcheance"
>;

type DocumentAjoute = {
  type: string;
  objectPath: string;
};

/** Maintient les anciennes colonnes scalaires à jour pour les clients et exports existants. */
export function appliquerColonnesDocumentsAjoutes(
  valeurs: Record<string, unknown>,
  documents: readonly DocumentAjoute[] | undefined,
): void {
  for (const document of documents ?? []) {
    if (document.type === "pv") valeurs.pv = document.objectPath;
    if (document.type === "convention") valeurs.documentConvention = document.objectPath;
  }
}

/** Recalcule l'échéance seulement selon les mêmes règles que la route PATCH historique. */
export function appliquerEcheanceModification(
  current: ChampsEcheanceConvention,
  valeurs: Record<string, unknown>,
): void {
  const valeurFinale = (champ: "nature" | "dateVisa" | "dernierComite" | "frequenceReunions") =>
    Object.hasOwn(valeurs, champ) ? valeurs[champ] as string | null : current[champ];
  const echeanceAvant = calculerEcheance(current);
  const echeance = calculerEcheance({
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
    echeance &&
    (sourcesChangees || !current.prochaineEcheance || current.prochaineEcheance === echeance.date)
  ) {
    // Une ancienne date manuelle différente du calcul est conservée tant que
    // ni la date de base, ni la fréquence, ni la nature n'ont changé.
    valeurs.prochaineEcheance = echeance.date;
  } else if (
    echeanceAvant &&
    current.prochaineEcheance === echeanceAvant.date &&
    !Object.hasOwn(valeurs, "prochaineEcheance") &&
    sourcesChangees
  ) {
    // Si l'ancien calcul n'est plus possible, ne pas laisser une ancienne
    // échéance automatique passer pour une date saisie manuellement.
    valeurs.prochaineEcheance = null;
  }
}
