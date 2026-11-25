import { asc, eq, sql } from "drizzle-orm";
import {
  db,
  conventionsTable,
  directionsTable,
  divisionsTable,
  maitrisesOuvrageTable,
  servicesTable,
  servicesDgsTable,
  secteursTable,
} from "@workspace/db";
import { organisation as organisationHistorique } from "@workspace/organisation";
import { DEFAULT_SECTEURS } from "./secteur-options";
import {
  buildReferenceData, isKnownDirectorate, isKnownProjectOwner, type ReferenceData,
} from "./reference-data-domain";

export {
  divisionBelongsToDirectorate, getServiceScope, serviceBelongsToDivision, serviceBelongsToScope, listDivisionServices,
} from "./organisation-access";
export { buildReferenceData, isKnownDirectorate, isKnownProjectOwner } from "./reference-data-domain";
export type { ReferenceData } from "./reference-data-domain";

type ReferenceExecutor = Pick<typeof db, "select">;

let referenceDataInitialized = false;

async function initializeReferenceData(): Promise<void> {
  if (referenceDataInitialized) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(741024, 1)`);
    const [existingDgsService] = await tx.select({ id: servicesDgsTable.id }).from(servicesDgsTable).limit(1);
    if (!existingDgsService) {
      await tx.insert(servicesDgsTable).values([
        { nom: "Service Coopération" },
        { nom: "Service Juridique" },
      ]);
    }
    await tx.insert(secteursTable)
      .values(DEFAULT_SECTEURS.map((nom) => ({ nom })))
      .onConflictDoNothing({ target: secteursTable.nom });
    const conventionsExistantes = await tx.select({ secteur: conventionsTable.secteur }).from(conventionsTable);
    const secteursHistoriques = [...new Set(conventionsExistantes
      .map(({ secteur }) => secteur?.trim())
      .filter((secteur): secteur is string => !!secteur))];
    if (secteursHistoriques.length) {
      await tx.insert(secteursTable)
        .values(secteursHistoriques.map((nom) => ({ nom })))
        .onConflictDoNothing({ target: secteursTable.nom });
    }
    const [alreadyInitialized] = await tx.select({ id: directionsTable.id }).from(directionsTable).limit(1);
    if (alreadyInitialized) return;

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
      partenaires: conventionsTable.partenaires,
    }).from(conventionsTable);
    const values = new Set<string>();
    for (const convention of conventions) {
      for (const candidate of [
        convention.legacyMo,
        convention.legacyMoDeleguee,
        ...(convention.mo ?? []),
        ...(convention.moDeleguees ?? []),
        ...(convention.partenaires ?? []),
      ]) {
        const name = candidate?.trim();
        if (name) values.add(name);
      }
    }
    for (const name of values) {
      await tx.insert(maitrisesOuvrageTable)
        .values({ nom: name })
        .onConflictDoNothing({ target: maitrisesOuvrageTable.nom });
    }
  });
  referenceDataInitialized = true;
}

export async function loadReferenceData(): Promise<ReferenceData> {
  await initializeReferenceData();
  return loadReferenceDataFrom(db);
}

export async function loadReferenceDataFrom(executor: ReferenceExecutor): Promise<ReferenceData> {
  const directions = await executor.select().from(directionsTable).orderBy(asc(directionsTable.id));
  const divisions = await executor.select().from(divisionsTable).orderBy(asc(divisionsTable.id));
  const services = await executor.select().from(servicesTable).orderBy(asc(servicesTable.id));
  const servicesDgs = await executor.select().from(servicesDgsTable).orderBy(asc(servicesDgsTable.id));
  const maitrisesOuvrage = await executor.select().from(maitrisesOuvrageTable).orderBy(asc(maitrisesOuvrageTable.id));
  const secteurs = await executor.select().from(secteursTable).orderBy(asc(secteursTable.id));
  return buildReferenceData({ directions, divisions, services, servicesDgs, maitrisesOuvrage, secteurs });
}