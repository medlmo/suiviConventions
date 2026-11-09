import { eq, sql } from "drizzle-orm";
import {
  db,
  conventionsTable,
  directionsTable,
  divisionsTable,
  maitrisesOuvrageTable,
  servicesTable,
  servicesDgsTable,
  usersTable,
} from "@workspace/db";
import { DIRECTION_GENERALE_SERVICES } from "@workspace/organisation";

const REFERENCE_DATA_KINDS = [
  "directions",
  "divisions",
  "services",
  "services-dgs",
  "maitrises-ouvrage",
] as const;

export type ReferenceDataKind = (typeof REFERENCE_DATA_KINDS)[number];

export function isReferenceDataKind(kind: string): kind is ReferenceDataKind {
  return (REFERENCE_DATA_KINDS as readonly string[]).includes(kind);
}

/**
 * Renomme une entrée et synchronise les champs historiques qui la référencent.
 * Le verrou sérialise cette opération avec les modifications de conventions et
 * les mutations du référentiel.
 */
export async function renommerEntreeReferentiel(
  kind: ReferenceDataKind,
  id: number,
  nom: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(741024, 1)`);
    if (kind === "directions") {
      const [current] = await tx.select().from(directionsTable).where(eq(directionsTable.id, id)).for("update");
      if (!current) return false;
      await tx.update(directionsTable).set({ nom }).where(eq(directionsTable.id, id));
      await tx.update(usersTable).set({ direction: nom, updatedAt: new Date() })
        .where(eq(usersTable.direction, current.nom));
      await tx.update(conventionsTable).set({
        rattachement: nom,
        updatedAt: new Date(),
        version: sql`${conventionsTable.version} + 1`,
      }).where(eq(conventionsTable.rattachement, current.nom));
    } else if (kind === "divisions") {
      const [current] = await tx.select().from(divisionsTable).where(eq(divisionsTable.id, id)).for("update");
      if (!current) return false;
      await tx.update(divisionsTable).set({ nom }).where(eq(divisionsTable.id, id));
      await tx.update(usersTable).set({ division: nom, updatedAt: new Date() })
        .where(eq(usersTable.division, current.nom));
      await tx.update(conventionsTable).set({
        rattachement: nom,
        updatedAt: new Date(),
        version: sql`${conventionsTable.version} + 1`,
      })
        .where(eq(conventionsTable.rattachement, current.nom));
    } else if (kind === "services" || kind === "services-dgs") {
      const table = kind === "services" ? servicesTable : servicesDgsTable;
      const [current] = await tx.select().from(table).where(eq(table.id, id)).for("update");
      if (!current) return false;
      await tx.update(table).set({ nom }).where(eq(table.id, id));
      await tx.update(usersTable).set({ service: nom, updatedAt: new Date() })
        .where(sql`${usersTable.service} = ${current.nom} AND ${
          kind === "services-dgs"
            ? sql`${usersTable.direction} IS NULL AND ${usersTable.division} IS NULL`
            : sql`${usersTable.division} IS NOT NULL`
        }`);
      await tx.update(conventionsTable).set({
        responsableProjet: nom,
        updatedAt: new Date(),
        version: sql`${conventionsTable.version} + 1`,
      })
        .where(sql`${conventionsTable.responsableProjet} = ${current.nom} AND ${
          kind === "services-dgs"
            ? sql`${conventionsTable.rattachement} = ${DIRECTION_GENERALE_SERVICES}`
            : sql`${conventionsTable.rattachement} IS DISTINCT FROM ${DIRECTION_GENERALE_SERVICES}`
        }`);
    } else {
      const [current] = await tx.select().from(maitrisesOuvrageTable)
        .where(eq(maitrisesOuvrageTable.id, id)).for("update");
      if (!current) return false;
      await tx.update(maitrisesOuvrageTable).set({ nom }).where(eq(maitrisesOuvrageTable.id, id));
      await tx.update(conventionsTable).set({
        maitriseOuvrage: sql`CASE WHEN ${conventionsTable.maitriseOuvrage} = ${current.nom} THEN ${nom} ELSE ${conventionsTable.maitriseOuvrage} END`,
        maitriseOuvrageDeleguee: sql`CASE WHEN ${conventionsTable.maitriseOuvrageDeleguee} = ${current.nom} THEN ${nom} ELSE ${conventionsTable.maitriseOuvrageDeleguee} END`,
        porteurProjet: sql`CASE WHEN ${conventionsTable.porteurProjet} = ${current.nom} THEN ${nom} ELSE ${conventionsTable.porteurProjet} END`,
        maitrisesOuvrage: sql`CASE WHEN ${conventionsTable.maitrisesOuvrage} IS NULL THEN NULL ELSE array_replace(${conventionsTable.maitrisesOuvrage}, ${current.nom}, ${nom}) END`,
        maitrisesOuvrageDeleguees: sql`CASE WHEN ${conventionsTable.maitrisesOuvrageDeleguees} IS NULL THEN NULL ELSE array_replace(${conventionsTable.maitrisesOuvrageDeleguees}, ${current.nom}, ${nom}) END`,
        partenaires: sql`CASE WHEN ${conventionsTable.partenaires} IS NULL THEN NULL ELSE array_replace(${conventionsTable.partenaires}, ${current.nom}, ${nom}) END`,
        suiviFinancier: sql`jsonb_set(${conventionsTable.suiviFinancier}, '{lignes}',
          COALESCE((SELECT jsonb_agg(
            CASE WHEN ligne->>'partenaire' = ${current.nom}
              THEN jsonb_set(ligne, '{partenaire}', to_jsonb(${nom}::text))
              ELSE ligne END ORDER BY position)
            FROM jsonb_array_elements(${conventionsTable.suiviFinancier}->'lignes')
              WITH ORDINALITY AS elements(ligne, position)), '[]'::jsonb))`,
        provincesPrefectures: sql`CASE WHEN ${conventionsTable.provincesPrefectures} IS NULL THEN NULL ELSE array_replace(${conventionsTable.provincesPrefectures}, ${current.nom}, ${nom}) END`,
        communes: sql`CASE WHEN ${conventionsTable.communes} IS NULL THEN NULL ELSE array_replace(${conventionsTable.communes}, ${current.nom}, ${nom}) END`,
        updatedAt: new Date(),
        version: sql`${conventionsTable.version} + 1`,
      }).where(sql`
        ${conventionsTable.maitriseOuvrage} = ${current.nom}
        OR ${conventionsTable.maitriseOuvrageDeleguee} = ${current.nom}
        OR ${conventionsTable.porteurProjet} = ${current.nom}
        OR ${conventionsTable.maitrisesOuvrage} @> ARRAY[${current.nom}]::text[]
        OR ${conventionsTable.maitrisesOuvrageDeleguees} @> ARRAY[${current.nom}]::text[]
        OR ${conventionsTable.partenaires} @> ARRAY[${current.nom}]::text[]
        OR ${conventionsTable.provincesPrefectures} @> ARRAY[${current.nom}]::text[]
        OR ${conventionsTable.communes} @> ARRAY[${current.nom}]::text[]
      `);
    }
    return true;
  });
}
