/** Contrôle du JSON brut avant les coercitions numériques et calendaires générées. */
export const PARTENAIRE_REGION = "Région Souss Massa";
const PARTENAIRE_REGION_HISTORIQUE = "Région Souss-Massa";

export function estPartenaireRegion(partenaire: string): boolean {
  return partenaire === PARTENAIRE_REGION || partenaire === PARTENAIRE_REGION_HISTORIQUE;
}

export function nomPartenaireAffiche(partenaire: string): string {
  return estPartenaireRegion(partenaire) ? PARTENAIRE_REGION : partenaire;
}

export function erreurSituationVersements(value: unknown): string | null {
  if (!Array.isArray(value) || value.length > 301) {
    return "La situation des versements doit contenir au maximum 301 lignes.";
  }
  const lignes = new Set<string>();
  for (const ligne of value) {
    if (typeof ligne !== "object" || ligne === null || Array.isArray(ligne)) {
      return "Chaque ligne de versement doit contenir une année, un partenaire et ses montants.";
    }
    const { annee, partenaire, montantVerse, tranches } = ligne;
    if (typeof annee !== "number" || !Number.isInteger(annee) || annee < 1900 || annee > 2200) {
      return "Les années de la situation des versements doivent être comprises entre 1900 et 2200.";
    }
    if (typeof partenaire !== "string" || !partenaire.trim() || partenaire !== partenaire.trim()) {
      return "Chaque ligne de versement doit désigner un partenaire.";
    }
    const cle = `${annee}\u0000${partenaire}`;
    if (lignes.has(cle)) return "Un partenaire ne peut avoir qu'une ligne de versement par année.";
    lignes.add(cle);
    if (typeof montantVerse !== "number" || !Number.isFinite(montantVerse) || montantVerse < 0 ||
        montantVerse > 9999999999999.99 || Number(montantVerse.toFixed(2)) !== montantVerse) {
      return "Le montant versé doit être en MAD, positif ou nul, avec deux décimales maximum.";
    }
    if (!Array.isArray(tranches) || tranches.length > 100) {
      return "Chaque année peut contenir au maximum 100 tranches de versement.";
    }
    let totalCentimes = 0;
    for (const tranche of tranches) {
      if (typeof tranche !== "object" || tranche === null || Array.isArray(tranche)) {
        return "Chaque tranche doit contenir un montant.";
      }
      const { montant, dateVersement } = tranche;
      if (typeof montant !== "number" || !Number.isFinite(montant) || montant <= 0 ||
          montant > 9999999999999.99 || Number(montant.toFixed(2)) !== montant) {
        return "Le montant de chaque tranche doit être supérieur à zéro, en MAD, avec deux décimales maximum.";
      }
      if (dateVersement !== undefined) {
        if (typeof dateVersement !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateVersement)) {
          return "La date de versement doit être une date réelle au format AAAA-MM-JJ.";
        }
        const [a, m, j] = dateVersement.split("-").map(Number);
        const d = new Date(Date.UTC(a!, m! - 1, j!));
        if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m! - 1 || d.getUTCDate() !== j) {
          return "La date de versement doit être une date réelle du calendrier.";
        }
      }
      totalCentimes += Math.round(montant * 100);
    }
    if (totalCentimes > 999999999999999 || Number((totalCentimes / 100).toFixed(2)) !== montantVerse) {
      return "Le total versé doit être égal à la somme des tranches de versement.";
    }
  }
  return null;
}
