type DeadlineInput = {
  nature?: string | null;
  dateVisa?: string | null;
  dernierComite?: string | null;
  frequenceReunions?: string | null;
};

export type CalculatedDeadline = {
  date: string;
  source: "visa" | "dernier-comite";
  mois: number;
};

function addMonths(date: string | null | undefined, monthsToAdd: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date ?? "");
  if (!match) return null;
  const [, anneeBrute, moisBrut, jourBrut] = match;
  const year = Number(anneeBrute);
  const month = Number(moisBrut);
  const day = Number(jourBrut);
  const origin = new Date(Date.UTC(year, month - 1, day));
  if (
    year < 100 ||
    origin.getUTCFullYear() !== year ||
    origin.getUTCMonth() !== month - 1 ||
    origin.getUTCDate() !== day
  ) return null;

  // Un mois calendaire conserve le jour quand il existe, sinon le dernier jour
  // du mois cible (31 janvier + 3 mois = 30 avril).
  const target = new Date(Date.UTC(year, month - 1 + monthsToAdd, 1));
  if (Number.isNaN(target.getTime()) || target.getUTCFullYear() > 9999) return null;
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

function frequencyInMonths(value: string | null | undefined): number | null {
  const match = /^(\d+)(?:\s*mois)?$/i.exec(value?.trim() ?? "");
  const months = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(months) && months > 0 ? months : null;
}

/** Une échéance dépassée ne décale jamais la base de calcul vers aujourd'hui. */
export function calculateDeadline(input: DeadlineInput): CalculatedDeadline | null {
  if (input.dernierComite) {
    const months = frequencyInMonths(input.frequenceReunions);
    const date = months === null ? null : addMonths(input.dernierComite, months);
    return date && months !== null ? { date, source: "dernier-comite", mois: months } : null;
  }

  const nature = input.nature?.trim().toLocaleLowerCase("fr");
  const months = nature === "infrastructure" ? 3
    : ["subvention", "subventions", "prestation", "prestations"].includes(nature ?? "") ? 3
    : null;
  const date = months === null ? null : addMonths(input.dateVisa, months);
  return date && months !== null ? { date, source: "visa", mois: months } : null;
}