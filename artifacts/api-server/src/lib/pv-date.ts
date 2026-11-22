export type NormalizedCommitteeMinutesDate =
  | { ok: true; date: string | null }
  | { ok: false };

/** Accepte une date absente; normalise et vérifie strictement toute date fournie. */
export function normalizeCommitteeMinutesDate(value: unknown): NormalizedCommitteeMinutesDate {
  if (value === null || value === undefined || value === "") {
    return { ok: true, date: null };
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? { ok: false }
      : { ok: true, date: value.toISOString().slice(0, 10) };
  }

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { ok: false };
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
    ? { ok: true, date: value }
    : { ok: false };
}
