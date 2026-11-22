import type { ReferenceData } from "./reference-data";
import {
  divisionBelongsToDirectorate, getServiceScope, serviceBelongsToDivision, serviceBelongsToScope, listDivisionServices,
} from "./organisation-access.ts";

type AccessUser = {
  role: string;
  direction?: string | null;
  division?: string | null;
  service?: string | null;
};

type AccessRow = {
  rattachement?: string | null;
  responsableProjet?: string | null;
};

export type ScopeFilter =
  | { type: "global" }
  | { type: "division"; rattachement: string; services: string[] }
  | { type: "service"; rattachement: string; service: string }
  | { type: "refuse" };

/** Décide le périmètre métier avant sa traduction en clause SQL. */
export function getConventionScopeFilter(user: AccessUser, reference: ReferenceData): ScopeFilter {
  if (user.role === "admin" || user.role === "directeur" || user.role === "directeur_general_services") {
    return { type: "global" };
  }
  if (user.role === "chef_division" && user.direction && user.division &&
      divisionBelongsToDirectorate(reference, user.direction, user.division)) {
    return { type: "division", rattachement: user.division, services: listDivisionServices(reference, user.division) };
  }
  if (user.role === "chef_service") {
    const scopeName = getServiceScope(reference, user);
    if (scopeName && user.service) {
      return { type: "service", rattachement: scopeName, service: user.service };
    }
  }
  return { type: "refuse" };
}

export function isConventionAccessible(row: AccessRow, user: AccessUser, reference: ReferenceData): boolean {
  const scopeFilter = getConventionScopeFilter(user, reference);
  if (scopeFilter.type === "global") return true;
  if (scopeFilter.type === "division") {
    return row.rattachement === scopeFilter.rattachement &&
      (!row.responsableProjet || serviceBelongsToDivision(reference, scopeFilter.rattachement, row.responsableProjet));
  }
  if (scopeFilter.type === "service") {
    return row.rattachement === scopeFilter.rattachement && row.responsableProjet === scopeFilter.service;
  }
  return false;
}

export function areAssignmentsValid(
  scopeName: string | null | undefined,
  projectLead: string | null | undefined,
  user: AccessUser,
  reference: ReferenceData,
): boolean {
  if (user.role === "admin") {
    return (!scopeName || !projectLead || serviceBelongsToScope(reference, scopeName, projectLead)) &&
      (!projectLead || (!!scopeName && serviceBelongsToScope(reference, scopeName, projectLead)));
  }

  const scopeFilter = getConventionScopeFilter(user, reference);
  if (scopeFilter.type === "division") {
    return scopeName === scopeFilter.rattachement &&
      (!projectLead || serviceBelongsToDivision(reference, scopeFilter.rattachement, projectLead));
  }
  if (scopeFilter.type === "service") {
    return scopeName === scopeFilter.rattachement && projectLead === scopeFilter.service;
  }
  return false;
}
