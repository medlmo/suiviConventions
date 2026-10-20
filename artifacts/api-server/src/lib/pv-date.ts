export type DatePvNormalisee =
  | { ok: true; date: string | null }
  | { ok: false };

/** Accepte une date absente; normalise et vérifie strictement toute date fournie. */
export function normaliserDatePv(valeur: unknown): DatePvNormalisee {
  if (valeur === null || valeur === undefined || valeur === "") {
    return { ok: true, date: null };
  }

  if (valeur instanceof Date) {
    return Number.isNaN(valeur.getTime())
      ? { ok: false }
      : { ok: true, date: valeur.toISOString().slice(0, 10) };
  }

  if (typeof valeur !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valeur)) {
    return { ok: false };
  }

  const [annee, mois, jour] = valeur.split("-").map(Number);
  const date = new Date(Date.UTC(annee!, mois! - 1, jour!));
  return date.getUTCFullYear() === annee &&
    date.getUTCMonth() === mois! - 1 &&
    date.getUTCDate() === jour
    ? { ok: true, date: valeur }
    : { ok: false };
}
