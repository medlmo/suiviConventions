export interface ReferenceData {
  organisation: {
    id: number;
    direction: string;
    divisions: { id: number; nom: string; services: { id: number; nom: string }[] }[];
  }[];
  maitrisesOuvrage: { id: number; nom: string }[];
  servicesDgs: { id: number; nom: string }[];
}

export type LignesReferentiel = {
  directions: { id: number; nom: string }[];
  divisions: { id: number; directionId: number; nom: string }[];
  services: { id: number; divisionId: number; nom: string }[];
  servicesDgs: { id: number; nom: string }[];
  maitrisesOuvrage: { id: number; nom: string }[];
};

export function construireReferentiel(lignes: LignesReferentiel): ReferenceData {
  const { directions, divisions, services, servicesDgs, maitrisesOuvrage } = lignes;
  return {
    organisation: directions.map((direction) => ({
      id: direction.id,
      direction: direction.nom,
      divisions: divisions.filter((division) => division.directionId === direction.id).map((division) => ({
        id: division.id,
        nom: division.nom,
        services: services.filter((service) => service.divisionId === division.id)
          .map(({ id, nom }) => ({ id, nom })),
      })),
    })),
    maitrisesOuvrage: maitrisesOuvrage.map(({ id, nom }) => ({ id, nom })),
    servicesDgs: servicesDgs.map(({ id, nom }) => ({ id, nom })),
  };
}

export function directionConnue(data: ReferenceData, direction: string): boolean {
  return data.organisation.some((entry) => entry.direction === direction);
}

export function maitriseOuvrageConnue(data: ReferenceData, nom: string): boolean {
  return data.maitrisesOuvrage.some((entry) => entry.nom === nom);
}
