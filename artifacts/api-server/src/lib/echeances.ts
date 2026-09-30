type DonneesEcheance = {
  nature?: string | null;
  dateVisa?: string | null;
  dernierComite?: string | null;
  frequenceReunions?: string | null;
};

export type EcheanceCalculee = {
  date: string;
  source: "visa" | "dernier-comite";
  mois: number;
};

function ajouterMois(date: string | null | undefined, moisAAjouter: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  if (!match) return null;
  const [, anneeBrute, moisBrut, jourBrut] = match;
  const annee = Number(anneeBrute);
  const mois = Number(moisBrut);
  const jour = Number(jourBrut);
  const origine = new Date(Date.UTC(annee, mois - 1, jour));
  if (
    annee < 100 ||
    origine.getUTCFullYear() !== annee ||
    origine.getUTCMonth() !== mois - 1 ||
    origine.getUTCDate() !== jour
  ) return null;

  // Un mois calendaire conserve le jour quand il existe, sinon le dernier jour
  // du mois cible (31 janvier + 3 mois = 30 avril).
  const cible = new Date(Date.UTC(annee, mois - 1 + moisAAjouter, 1));
  if (Number.isNaN(cible.getTime()) || cible.getUTCFullYear() > 9999) return null;
  const dernierJour = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  cible.setUTCDate(Math.min(jour, dernierJour));
  return cible.toISOString().slice(0, 10);
}

function frequenceEnMois(valeur: string | null | undefined): number | null {
  const match = /^(\d+)(?:\s*mois)?$/i.exec(valeur?.trim() ?? "");
  const mois = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(mois) && mois > 0 ? mois : null;
}

/** Une échéance dépassée ne décale jamais la base de calcul vers aujourd'hui. */
export function calculerEcheance(donnees: DonneesEcheance): EcheanceCalculee | null {
  if (donnees.dernierComite) {
    const mois = frequenceEnMois(donnees.frequenceReunions);
    const date = mois === null ? null : ajouterMois(donnees.dernierComite, mois);
    return date && mois !== null ? { date, source: "dernier-comite", mois } : null;
  }

  const nature = donnees.nature?.trim().toLocaleLowerCase("fr");
  const mois = nature === "infrastructure" ? 9
    : ["subvention", "subventions", "prestation", "prestations"].includes(nature ?? "") ? 3
    : null;
  const date = mois === null ? null : ajouterMois(donnees.dateVisa, mois);
  return date && mois !== null ? { date, source: "visa", mois } : null;
}