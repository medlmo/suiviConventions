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
    const { annee, montantProgramme, montantVerse, dateDernierVersement } = ligne;
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
    if (dateDernierVersement !== null) {
      if (typeof dateDernierVersement !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateDernierVersement)) {
        return "La date du dernier versement doit être une date réelle au format AAAA-MM-JJ, ou null.";
      }
      const [a, m, j] = dateDernierVersement.split("-").map(Number);
      const d = new Date(Date.UTC(a!, m! - 1, j!));
      if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m! - 1 || d.getUTCDate() !== j) {
        return "La date du dernier versement doit être une date réelle du calendrier.";
      }
    }
    if ((montantVerse > 0 && dateDernierVersement === null) ||
        (montantVerse === 0 && dateDernierVersement !== null)) {
      return "Renseignez la date du dernier versement si un montant a été versé, et laissez-la vide si le montant versé est nul.";
    }
  }
  return null;
}
