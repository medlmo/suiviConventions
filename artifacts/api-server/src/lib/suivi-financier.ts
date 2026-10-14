import type { SuiviFinancier } from "@workspace/db";

const objet = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const anneeValide = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 1900 && value <= 2200;

/** Validate raw JSON before generated numeric coercions can turn blank amounts into zero. */
export function erreurSuiviFinancier(value: unknown): string | null {
  if (!objet(value) || !Array.isArray(value.annees) || !Array.isArray(value.lignes)) {
    return "Le suivi financier doit contenir une liste d'années et de partenaires.";
  }
  const { annees, lignes } = value;
  if (annees.length > 301 || annees.some(annee => !anneeValide(annee)) ||
      new Set(annees).size !== annees.length) {
    return "Les années du suivi financier doivent être uniques, entre 1900 et 2200.";
  }
  if (lignes.length > 500) return "Le suivi financier ne peut pas dépasser 500 partenaires.";
  const partenaires = new Set<string>();
  for (const ligne of lignes) {
    if (!objet(ligne) || typeof ligne.partenaire !== "string" || !ligne.partenaire.trim() ||
        ligne.partenaire !== ligne.partenaire.trim() || !Array.isArray(ligne.contributions)) {
      return "Chaque ligne financière doit désigner un partenaire et ses contributions.";
    }
    if (partenaires.has(ligne.partenaire)) return "Un partenaire ne peut figurer qu'une seule fois dans le suivi financier.";
    partenaires.add(ligne.partenaire);
    if (ligne.contributions.length > 301) return "Trop de contributions pour un partenaire.";
    const presentes = new Set<number>();
    for (const contribution of ligne.contributions) {
      if (!objet(contribution) || !anneeValide(contribution.annee) ||
          !annees.includes(contribution.annee) || presentes.has(contribution.annee)) {
        return "Chaque contribution doit correspondre à une année du tableau, sans doublon.";
      }
      presentes.add(contribution.annee);
      const montant = contribution.montant;
      if (typeof montant !== "number" || !Number.isFinite(montant) || montant < 0 ||
          montant > 9999999999999.99 || Number(montant.toFixed(2)) !== montant) {
        return "Les contributions doivent être des montants positifs ou nuls en MAD, avec deux décimales maximum.";
      }
    }
  }
  return null;
}

export function erreurPartenairesFinanciers(suivi: SuiviFinancier, partenaires: string[]): string | null {
  return suivi.lignes.some(ligne => !partenaires.includes(ligne.partenaire))
    ? "Un partenaire du suivi financier ne figure plus dans la convention. Rétablissez-le ou retirez explicitement sa ligne financière avant d'enregistrer."
    : null;
}
