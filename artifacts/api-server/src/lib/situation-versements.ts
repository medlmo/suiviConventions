/** Contrôle du JSON brut avant les coercitions numériques et calendaires générées. */
export function erreurSituationVersements(value: unknown): string | null {
  if (!Array.isArray(value) || value.length > 301) {
    return "La situation des versements doit contenir au maximum 301 années.";
  }
  const annees = new Set<number>();
  for (const ligne of value) {
    if (typeof ligne !== "object" || ligne === null || Array.isArray(ligne)) {
      return "Chaque ligne de versement doit contenir une année et ses montants.";
    }
    const { annee, montantProgramme, montantVerse, tranches } = ligne;
    if (typeof annee !== "number" || !Number.isInteger(annee) || annee < 1900 || annee > 2200 || annees.has(annee)) {
      return "Les années de la situation des versements doivent être uniques, entre 1900 et 2200.";
    }
    annees.add(annee);
    for (const montant of [montantProgramme, montantVerse]) {
      if (typeof montant !== "number" || !Number.isFinite(montant) || montant < 0 ||
          montant > 9999999999999.99 || Number(montant.toFixed(2)) !== montant) {
        return "Les montants programmés et versés sont requis en MAD, positifs ou nuls, avec deux décimales maximum.";
      }
    }
    if (!Array.isArray(tranches) || tranches.length > 100) {
      return "Chaque année peut contenir au maximum 100 tranches de versement.";
    }
    let totalCentimes = 0;
    for (const tranche of tranches) {
      if (typeof tranche !== "object" || tranche === null || Array.isArray(tranche)) {
        return "Chaque tranche doit contenir un montant et une date de versement.";
      }
      const { montant, dateVersement } = tranche;
      if (typeof montant !== "number" || !Number.isFinite(montant) || montant <= 0 ||
          montant > 9999999999999.99 || Number(montant.toFixed(2)) !== montant) {
        return "Le montant de chaque tranche doit être supérieur à zéro, en MAD, avec deux décimales maximum.";
      }
      if (typeof dateVersement !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateVersement)) {
        return "La date de versement doit être une date réelle au format AAAA-MM-JJ.";
      }
      const [a, m, j] = dateVersement.split("-").map(Number);
      const d = new Date(Date.UTC(a!, m! - 1, j!));
      if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m! - 1 || d.getUTCDate() !== j) {
        return "La date de versement doit être une date réelle du calendrier.";
      }
      if (a !== annee) return "La date de chaque tranche doit appartenir à l'année indiquée.";
      totalCentimes += Math.round(montant * 100);
    }
    if (totalCentimes > 999999999999999 || Number((totalCentimes / 100).toFixed(2)) !== montantVerse) {
      return "Le total versé doit être égal à la somme des tranches de versement.";
    }
  }
  return null;
}
