import { DIRECTION_GENERALE_SERVICES } from "@workspace/organisation";
import type { ReferenceData } from "./reference-data";

export function divisionDeDirection(data: ReferenceData, direction: string, division: string): boolean {
  return data.organisation.some((entry) =>
    entry.direction === direction && entry.divisions.some((item) => item.nom === division));
}

export function serviceDansDivision(data: ReferenceData, division: string, service: string): boolean {
  return data.organisation.some((entry) =>
    entry.divisions.some((item) =>
      item.nom === division && item.services.some((candidate) => candidate.nom === service)));
}

export function serviceDansRattachement(data: ReferenceData, rattachement: string, service: string): boolean {
  return rattachement === DIRECTION_GENERALE_SERVICES
    ? data.servicesDgs.some((item) => item.nom === service)
    : serviceDansDivision(data, rattachement, service);
}

export function perimetreChefService(
  data: ReferenceData,
  user: { direction?: string | null; division?: string | null; service?: string | null },
): string | null {
  if (!user.service) return null;
  if (!user.direction && !user.division) {
    return data.servicesDgs.some((item) => item.nom === user.service) ? DIRECTION_GENERALE_SERVICES : null;
  }
  return user.direction && user.division &&
    divisionDeDirection(data, user.direction, user.division) &&
    serviceDansDivision(data, user.division, user.service) ? user.division : null;
}

export function servicesDeDivision(data: ReferenceData, division: string): string[] {
  for (const direction of data.organisation) {
    const found = direction.divisions.find((item) => item.nom === division);
    if (found) return found.services.map((service) => service.nom);
  }
  return [];
}
