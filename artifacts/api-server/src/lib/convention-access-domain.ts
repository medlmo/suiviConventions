import type { ReferenceData } from "./reference-data";
import {
  divisionDeDirection, perimetreChefService, serviceDansDivision, serviceDansRattachement, servicesDeDivision,
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

export type FiltrePerimetre =
  | { type: "global" }
  | { type: "division"; rattachement: string; services: string[] }
  | { type: "service"; rattachement: string; service: string }
  | { type: "refuse" };

/** Décide le périmètre métier avant sa traduction en clause SQL. */
export function filtrePerimetre(user: AccessUser, reference: ReferenceData): FiltrePerimetre {
  if (user.role === "admin" || user.role === "directeur" || user.role === "directeur_general_services") {
    return { type: "global" };
  }
  if (user.role === "chef_division" && user.direction && user.division &&
      divisionDeDirection(reference, user.direction, user.division)) {
    return { type: "division", rattachement: user.division, services: servicesDeDivision(reference, user.division) };
  }
  if (user.role === "chef_service") {
    const rattachement = perimetreChefService(reference, user);
    if (rattachement && user.service) {
      return { type: "service", rattachement, service: user.service };
    }
  }
  return { type: "refuse" };
}

export function accessible(row: AccessRow, user: AccessUser, reference: ReferenceData): boolean {
  const filtre = filtrePerimetre(user, reference);
  if (filtre.type === "global") return true;
  if (filtre.type === "division") {
    return row.rattachement === filtre.rattachement &&
      (!row.responsableProjet || serviceDansDivision(reference, filtre.rattachement, row.responsableProjet));
  }
  if (filtre.type === "service") {
    return row.rattachement === filtre.rattachement && row.responsableProjet === filtre.service;
  }
  return false;
}

export function affectationsValides(
  rattachement: string | null | undefined,
  responsableProjet: string | null | undefined,
  user: AccessUser,
  reference: ReferenceData,
): boolean {
  if (user.role === "admin") {
    return (!rattachement || !responsableProjet || serviceDansRattachement(reference, rattachement, responsableProjet)) &&
      (!responsableProjet || (!!rattachement && serviceDansRattachement(reference, rattachement, responsableProjet)));
  }

  const filtre = filtrePerimetre(user, reference);
  if (filtre.type === "division") {
    return rattachement === filtre.rattachement &&
      (!responsableProjet || serviceDansDivision(reference, filtre.rattachement, responsableProjet));
  }
  if (filtre.type === "service") {
    return rattachement === filtre.rattachement && responsableProjet === filtre.service;
  }
  return false;
}
