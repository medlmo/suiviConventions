import { DIRECTION_GENERALE_SERVICES } from "@workspace/organisation";
import type { ReferenceData } from "./reference-data-domain";

export function divisionBelongsToDirectorate(data: ReferenceData, directorate: string, division: string): boolean {
  return data.organisation.some((entry) =>
    entry.direction === directorate && entry.divisions.some((item) => item.nom === division));
}

export function serviceBelongsToDivision(data: ReferenceData, division: string, service: string): boolean {
  return data.organisation.some((entry) =>
    entry.divisions.some((item) =>
      item.nom === division && item.services.some((candidate) => candidate.nom === service)));
}

export function serviceBelongsToScope(data: ReferenceData, scope: string, service: string): boolean {
  return scope === DIRECTION_GENERALE_SERVICES
    ? data.servicesDgs.some((item) => item.nom === service)
    : serviceBelongsToDivision(data, scope, service);
}

export function getServiceScope(
  data: ReferenceData,
  user: { direction?: string | null; division?: string | null; service?: string | null },
): string | null {
  if (!user.service) return null;
  if (!user.direction && !user.division) {
    return data.servicesDgs.some((item) => item.nom === user.service) ? DIRECTION_GENERALE_SERVICES : null;
  }
  return user.direction && user.division &&
    divisionBelongsToDirectorate(data, user.direction, user.division) &&
    serviceBelongsToDivision(data, user.division, user.service) ? user.division : null;
}

export function listDivisionServices(data: ReferenceData, division: string): string[] {
  for (const direction of data.organisation) {
    const found = direction.divisions.find((item) => item.nom === division);
    if (found) return found.services.map((service) => service.nom);
  }
  return [];
}
