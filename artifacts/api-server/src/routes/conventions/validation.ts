import { erreurSuiviFinancier } from "../../lib/suivi-financier";
import { erreurAvancementPhysique } from "../../lib/avancement-physique";
import { erreurSituationVersements } from "../../lib/situation-versements";
import { normaliserDatePv } from "../../lib/pv-date";
import { maitriseOuvrageConnue, type ReferenceData } from "../../lib/reference-data";

const CHAMPS_DATE_CORPS = [
  "session",
  "dateVisa",
  "prochainComite",
  "dernierComite",
  "prochaineEcheance",
] as const;

const CHAMPS_MONTANT_CORPS = ["enveloppeBudgetaire", "contributionRegion"] as const;
export const ERREUR_CONTRIBUTION = "La contribution de la Région (MAD) ne peut pas dépasser l'enveloppe budgétaire (MAD).";
export const ERREUR_DOCUMENT = "Les champs Convention et PV doivent contenir un PDF ou un document Word de 10 Mo maximum.";

export function contributionDepasseEnveloppe(
  enveloppe: number | string | null | undefined,
  contribution: number | string | null | undefined,
): boolean {
  return enveloppe != null && contribution != null && Number(contribution) > Number(enveloppe);
}

const JOUR_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Contrôle strict des dates et des montants avant la validation de contrat.
 *
 * Les schémas générés utilisent `z.coerce.date()` et `z.coerce.number()`, qui
 * acceptent beaucoup trop : « 2025-02-30 » deviendrait le 2 mars, un
 * horodatage avec fuseau pourrait basculer d'un jour, et un champ montant vidé
 * par l'utilisateur serait enregistré comme 0 au lieu d'être effacé. Sur des
 * dates de comité qui pilotent toutes les alertes, une correction silencieuse
 * est pire qu'un refus.
 */
export function normaliserCorps(corps: unknown): { ok: true; valeur: Record<string, unknown> } | { ok: false; erreur: string } {
  if (typeof corps !== "object" || corps === null || Array.isArray(corps)) {
    return { ok: false, erreur: "Le corps de la requête doit être un objet." };
  }

  const valeur: Record<string, unknown> = { ...(corps as Record<string, unknown>) };
  if ("situationVersements" in valeur) {
    const erreur = erreurSituationVersements(valeur.situationVersements);
    if (erreur) return { ok: false, erreur };
  }
  if ("avancementPhysiqueHistorique" in valeur) {
    return { ok: false, erreur: "L'historique de l'avancement physique ne peut pas être remplacé. Ajoutez un nouveau constat." };
  }
  if ("avancementPhysiqueAjoute" in valeur) {
    const erreur = erreurAvancementPhysique(valeur.avancementPhysiqueAjoute);
    if (erreur) return { ok: false, erreur };
  }
  if ("suiviFinancier" in valeur) {
    const erreur = erreurSuiviFinancier(valeur.suiviFinancier);
    if (erreur) return { ok: false, erreur };
  }

  for (const champ of CHAMPS_DATE_CORPS) {
    if (!(champ in valeur)) continue;
    const brut = valeur[champ];
    if (brut === null || brut === undefined || brut === "") {
      valeur[champ] = null;
      continue;
    }
    if (typeof brut !== "string" || !JOUR_ISO.test(brut)) {
      return { ok: false, erreur: `Le champ « ${champ} » doit être une date au format AAAA-MM-JJ.` };
    }
    const [annee, mois, jour] = brut.split("-").map(Number);
    const controle = new Date(Date.UTC(annee!, mois! - 1, jour!));
    if (
      controle.getUTCFullYear() !== annee ||
      controle.getUTCMonth() !== mois! - 1 ||
      controle.getUTCDate() !== jour
    ) {
      return { ok: false, erreur: `Le champ « ${champ} » ne correspond pas à une date réelle du calendrier.` };
    }
  }

  if (Array.isArray(valeur.documentsAjoutes)) {
    for (const document of valeur.documentsAjoutes) {
      if (typeof document !== "object" || document === null || Array.isArray(document)) continue;
      const ajout = document as Record<string, unknown>;
      const resultatDatePv = normaliserDatePv(ajout.datePvComite);
      if (!resultatDatePv.ok) {
        const erreur = typeof ajout.datePvComite === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(ajout.datePvComite)
          ? "La date d’un PV doit correspondre à un jour réel du calendrier."
          : "La date du PV doit être au format AAAA-MM-JJ.";
        return { ok: false, erreur };
      }
      ajout.datePvComite = resultatDatePv.date;
      if (resultatDatePv.date && ajout.type !== "pv") {
        return { ok: false, erreur: "La date du PV ne peut être définie que pour un document de type PV." };
      }
    }
  }

  for (const champ of CHAMPS_MONTANT_CORPS) {
    if (!(champ in valeur)) continue;
    const brut = valeur[champ];
    if (brut === null || brut === undefined || brut === "") {
      valeur[champ] = null;
      continue;
    }
    const nombre = typeof brut === "number" ? brut : Number(brut);
    if (!Number.isFinite(nombre) || nombre < 0) {
      return { ok: false, erreur: `Le champ « ${champ} » doit être un montant positif.` };
    }
    valeur[champ] = nombre;
  }

  return { ok: true, valeur };
}

export function listeMoValide(
  valeurs: string[] | null | undefined,
  reference: ReferenceData,
  historique: string[] = [],
): boolean {
  return valeurs == null || valeurs.every((valeur) => {
    const nom = valeur.trim();
    return !nom || maitriseOuvrageConnue(reference, nom) || historique.includes(nom);
  });
}

function normaliserNomTerritoire(nom: string): string {
  return nom
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’‘`]/g, "'")
    .toLocaleLowerCase("fr")
    .trim();
}

export function nomProvinceOuPrefecture(nom: string): boolean {
  return /^(?:province\s+de\s+|prefecture\s+(?:de\s+|d'))/.test(normaliserNomTerritoire(nom));
}

export function nomCommune(nom: string): boolean {
  return /^commune\s+(?:de\s+|d')/.test(normaliserNomTerritoire(nom));
}

export function listeTerritoiresValide(
  valeurs: string[] | null | undefined,
  reference: ReferenceData,
  estValide: (nom: string) => boolean,
  historique: string[] = [],
): boolean {
  return valeurs == null || valeurs.every((valeur) => {
    const nom = valeur.trim();
    return !nom ||
      historique.includes(nom) ||
      (maitriseOuvrageConnue(reference, nom) && estValide(nom));
  });
}

export function valeurMoValide(
  valeur: string | null | undefined,
  reference: ReferenceData,
  historique: string | null | undefined = null,
): boolean {
  const nom = valeur?.trim();
  return !nom || maitriseOuvrageConnue(reference, nom) || nom === historique;
}
