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
import { organisation as organisationHistorique } from "@workspace/organisation";
import {
  construireReferentiel, directionConnue, maitriseOuvrageConnue, type ReferenceData,
} from "./reference-data-domain";

export {
  divisionDeDirection, perimetreChefService, serviceDansDivision, serviceDansRattachement, servicesDeDivision,
} from "./organisation-access";
export { construireReferentiel, directionConnue, maitriseOuvrageConnue } from "./reference-data-domain";
export type { ReferenceData } from "./reference-data-domain";

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
      partenaires: conventionsTable.partenaires,
    }).from(conventionsTable);
    const valeurs = new Set<string>();
    for (const convention of conventions) {
      for (const candidate of [
        convention.legacyMo,
        convention.legacyMoDeleguee,
        ...(convention.mo ?? []),
        ...(convention.moDeleguees ?? []),
        ...(convention.partenaires ?? []),
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
  return construireReferentiel({ directions, divisions, services, servicesDgs, maitrisesOuvrage });
}