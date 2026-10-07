import { asc, eq, sql } from "drizzle-orm";
import {
  db,
  conventionsTable,
  directionsTable,
  divisionsTable,
  maitrisesOuvrageTable,
  servicesTable,
  servicesDgsTable,
} from "@workspace/db";
import { DIRECTION_GENERALE_SERVICES, organisation as organisationHistorique } from "@workspace/organisation";

export interface ReferenceData {
  organisation: {
    id: number;
    direction: string;
    divisions: { id: number; nom: string; services: { id: number; nom: string }[] }[];
  }[];
  maitrisesOuvrage: { id: number; nom: string }[];
  servicesDgs: { id: number; nom: string }[];
}

type ReferenceExecutor = Pick<typeof db, "select">;

let initialisationFaite = false;

async function initialiserReferentiel(): Promise<void> {
  if (initialisationFaite) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(741024, 1)`);
    const [serviceDgsExistant] = await tx.select({ id: servicesDgsTable.id }).from(servicesDgsTable).limit(1);
    if (!serviceDgsExistant) {
      await tx.insert(servicesDgsTable).values([
        { nom: "Service Coopération" },
        { nom: "Service Juridique" },
      ]);
    }
    const [dejaInitialise] = await tx.select({ id: directionsTable.id }).from(directionsTable).limit(1);
    if (dejaInitialise) return;

    for (const direction of organisationHistorique) {
      const [parent] = await tx.insert(directionsTable)
        .values({ nom: direction.direction })
        .onConflictDoNothing({ target: directionsTable.nom })
        .returning({ id: directionsTable.id });
      const [directionLue] = parent
        ? [parent]
        : await tx.select({ id: directionsTable.id }).from(directionsTable)
          .where(eq(directionsTable.nom, direction.direction));
      if (!directionLue) continue;

      for (const division of direction.divisions) {
        const [divisionInseree] = await tx.insert(divisionsTable)
          .values({ directionId: directionLue.id, nom: division.nom })
          .onConflictDoNothing({ target: divisionsTable.nom })
          .returning({ id: divisionsTable.id });
        const [divisionLue] = divisionInseree
          ? [divisionInseree]
          : await tx.select({ id: divisionsTable.id }).from(divisionsTable)
            .where(eq(divisionsTable.nom, division.nom));
        if (!divisionLue) continue;
        for (const service of division.services) {
          await tx.insert(servicesTable)
            .values({ divisionId: divisionLue.id, nom: service })
            .onConflictDoNothing({ target: servicesTable.nom });
        }
      }
    }

    // Retain the original free-text values as selectable options while keeping
    // the legacy columns untouched for old records and deployed clients.
    const conventions = await tx.select({
      legacyMo: conventionsTable.maitriseOuvrage,
      legacyMoDeleguee: conventionsTable.maitriseOuvrageDeleguee,
      mo: conventionsTable.maitrisesOuvrage,
      moDeleguees: conventionsTable.maitrisesOuvrageDeleguees,
    }).from(conventionsTable);
    const valeurs = new Set<string>();
    for (const convention of conventions) {
      for (const candidate of [
        convention.legacyMo,
        convention.legacyMoDeleguee,
        ...(convention.mo ?? []),
        ...(convention.moDeleguees ?? []),
      ]) {
        const nom = candidate?.trim();
        if (nom) valeurs.add(nom);
      }
    }
    for (const nom of valeurs) {
      await tx.insert(maitrisesOuvrageTable)
        .values({ nom })
        .onConflictDoNothing({ target: maitrisesOuvrageTable.nom });
    }
  });
  initialisationFaite = true;
}

export async function chargerReferentiel(): Promise<ReferenceData> {
  await initialiserReferentiel();
  return chargerReferentielDepuis(db);
}

export async function chargerReferentielDepuis(executor: ReferenceExecutor): Promise<ReferenceData> {
  const directions = await executor.select().from(directionsTable).orderBy(asc(directionsTable.id));
  const divisions = await executor.select().from(divisionsTable).orderBy(asc(divisionsTable.id));
  const services = await executor.select().from(servicesTable).orderBy(asc(servicesTable.id));
  const servicesDgs = await executor.select().from(servicesDgsTable).orderBy(asc(servicesDgsTable.id));
  const maitrisesOuvrage = await executor.select().from(maitrisesOuvrageTable).orderBy(asc(maitrisesOuvrageTable.id));
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

export function divisionDeDirection(data: ReferenceData, direction: string, division: string): boolean {
  return data.organisation.some((entry) =>
    entry.direction === direction && entry.divisions.some((item) => item.nom === division));
}

export function serviceDansDivision(data: ReferenceData, division: string, service: string): boolean {
  return data.organisation.some((entry) =>
    entry.divisions.some((item) => item.nom === division && item.services.some((candidate) => candidate.nom === service)));
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

export function maitriseOuvrageConnue(data: ReferenceData, nom: string): boolean {
  return data.maitrisesOuvrage.some((entry) => entry.nom === nom);
}