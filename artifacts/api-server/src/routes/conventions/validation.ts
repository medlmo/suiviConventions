import { getFinancialTrackingValidationError } from "../../lib/suivi-financier";
import { getPhysicalProgressValidationError } from "../../lib/avancement-physique";
import { getPaymentSituationValidationError } from "../../lib/situation-versements";
import { normalizeCommitteeMinutesDate } from "../../lib/pv-date";
import { isKnownProjectOwner, type ReferenceData } from "../../lib/reference-data";

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

export function doesContributionExceedBudget(
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
export function normalizeConventionPayload(
  payload: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return { ok: false, error: "Le corps de la requête doit être un objet." };
  }

  const value: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  if ("situationVersements" in value) {
    const error = getPaymentSituationValidationError(value.situationVersements);
    if (error) return { ok: false, error };
  }
  if ("avancementPhysiqueHistorique" in value) {
    return { ok: false, error: "L'historique de l'avancement physique ne peut pas être remplacé. Ajoutez un nouveau constat." };
  }
  if ("avancementPhysiqueAjoute" in value) {
    const error = getPhysicalProgressValidationError(value.avancementPhysiqueAjoute);
    if (error) return { ok: false, error };
  }
  if ("suiviFinancier" in value) {
    const error = getFinancialTrackingValidationError(value.suiviFinancier);
    if (error) return { ok: false, error };
  }

  for (const field of CHAMPS_DATE_CORPS) {
    if (!(field in value)) continue;
    const rawValue = value[field];
    if (rawValue === null || rawValue === undefined || rawValue === "") {
      value[field] = null;
      continue;
    }
    if (typeof rawValue !== "string" || !JOUR_ISO.test(rawValue)) {
      return { ok: false, error: `Le champ « ${field} » doit être une date au format AAAA-MM-JJ.` };
    }
    const [year, month, day] = rawValue.split("-").map(Number);
    const parsedDate = new Date(Date.UTC(year!, month! - 1, day!));
    if (
      parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() !== month! - 1 ||
      parsedDate.getUTCDate() !== day
    ) {
      return { ok: false, error: `Le champ « ${field} » ne correspond pas à une date réelle du calendrier.` };
    }
  }

  if (Array.isArray(value.documentsAjoutes)) {
    for (const document of value.documentsAjoutes) {
      if (typeof document !== "object" || document === null || Array.isArray(document)) continue;
      const addition = document as Record<string, unknown>;
      const dateResult = normalizeCommitteeMinutesDate(addition.datePvComite);
      if (!dateResult.ok) {
        const error = typeof addition.datePvComite === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(addition.datePvComite)
          ? "La date d’un PV doit correspondre à un jour réel du calendrier."
          : "La date du PV doit être au format AAAA-MM-JJ.";
        return { ok: false, error };
      }
      addition.datePvComite = dateResult.date;
      if (dateResult.date && addition.type !== "pv") {
        return { ok: false, error: "La date du PV ne peut être définie que pour un document de type PV." };
      }
    }
  }

  for (const field of CHAMPS_MONTANT_CORPS) {
    if (!(field in value)) continue;
    const rawValue = value[field];
    if (rawValue === null || rawValue === undefined || rawValue === "") {
      value[field] = null;
      continue;
    }
    const amount = typeof rawValue === "number" ? rawValue : Number(rawValue);
    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, error: `Le champ « ${field} » doit être un montant positif.` };
    }
    value[field] = amount;
  }

  return { ok: true, value };
}

export function isValidProjectOwnerList(
  valeurs: string[] | null | undefined,
  reference: ReferenceData,
  historique: string[] = [],
): boolean {
  return valeurs == null || valeurs.every((valeur) => {
    const nom = valeur.trim();
    return !nom || isKnownProjectOwner(reference, nom) || historique.includes(nom);
  });
}

function normalizeTerritoryName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[’‘`]/g, "'")
    .toLocaleLowerCase("fr")
    .trim();
}

export function isProvinceOrPrefecture(name: string): boolean {
  return /^(?:province\s+de\s+|prefecture\s+(?:de\s+|d'))/.test(normalizeTerritoryName(name));
}

export function isCommuneName(name: string): boolean {
  return /^commune\s+(?:de\s+|d')/.test(normalizeTerritoryName(name));
}

export function areTerritoriesValid(
  valeurs: string[] | null | undefined,
  reference: ReferenceData,
  isValid: (name: string) => boolean,
  historique: string[] = [],
): boolean {
  return valeurs == null || valeurs.every((valeur) => {
    const nom = valeur.trim();
    return !nom ||
      historique.includes(nom) ||
      (isKnownProjectOwner(reference, nom) && isValid(nom));
  });
}

export function isProjectOwnerValueValid(
  valeur: string | null | undefined,
  reference: ReferenceData,
  historique: string | null | undefined = null,
): boolean {
  const nom = valeur?.trim();
  return !nom || isKnownProjectOwner(reference, nom) || nom === historique;
}

export interface ConventionReferenceValues {
  maitriseOuvrage?: string[] | null;
  maitriseOuvrageDeleguee?: string[] | null;
  partenaires?: string[] | null;
  provincesPrefectures?: string[] | null;
  communes?: string[] | null;
  porteurProjet?: string | null;
}

export interface ConventionReferenceHistory {
  maitriseOuvrage?: string[];
  maitriseOuvrageDeleguee?: string[];
  partenaires?: string[];
  provincesPrefectures?: string[];
  communes?: string[];
  porteurProjet?: string | null;
}

/** Applique les mêmes contrôles de référentiel à la création et à la modification. */
export function areConventionReferencesValid(
  values: ConventionReferenceValues,
  reference: ReferenceData,
  history: ConventionReferenceHistory = {},
): boolean {
  return (
    isValidProjectOwnerList(values.maitriseOuvrage, reference, history.maitriseOuvrage) &&
    isValidProjectOwnerList(values.maitriseOuvrageDeleguee, reference, history.maitriseOuvrageDeleguee) &&
    isValidProjectOwnerList(values.partenaires, reference, history.partenaires) &&
    areTerritoriesValid(
      values.provincesPrefectures,
      reference,
      isProvinceOrPrefecture,
      history.provincesPrefectures,
    ) &&
    areTerritoriesValid(
      values.communes,
      reference,
      isCommuneName,
      history.communes,
    ) &&
    isProjectOwnerValueValid(values.porteurProjet, reference, history.porteurProjet)
  );
}
