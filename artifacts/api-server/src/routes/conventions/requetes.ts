import { and, asc, desc, eq, or, sql, type SQL } from "drizzle-orm";
import { conventionsTable } from "@workspace/db";
import { niveauAlerteSql, rangUrgenceSql } from "../../lib/alertes";
import { echapperJokersLike, normaliserPourRecherche } from "../../lib/conventions-mapper";

interface FiltresListe {
  q?: string;
  alerte?: string;
  statutConvention?: string;
  rattachement?: string;
  partenaires?: string[];
  responsableProjet?: string;
  nature?: string;
  natureFonds?: string;
  decision?: string;
}

export function construireFiltres(filtres: FiltresListe): SQL | undefined {
  const conditions: SQL[] = [];

  if (filtres.q && filtres.q.trim() !== "") {
    const terme = `%${echapperJokersLike(filtres.q.trim())}%`;
    const motif = normaliserPourRecherche(terme);
    const champsRecherchables = [
      conventionsTable.nomConvention,
      conventionsTable.objetConventionFr,
      conventionsTable.responsableProjet,
      conventionsTable.porteurProjet,
      sql`CASE WHEN ${conventionsTable.maitrisesOuvrage} IS NULL THEN COALESCE(${conventionsTable.maitriseOuvrage}, '') ELSE '' END`,
      sql`CASE WHEN ${conventionsTable.maitrisesOuvrageDeleguees} IS NULL THEN COALESCE(${conventionsTable.maitriseOuvrageDeleguee}, '') ELSE '' END`,
      sql`array_to_string(${conventionsTable.maitrisesOuvrage}, ' ')`,
      sql`array_to_string(${conventionsTable.maitrisesOuvrageDeleguees}, ' ')`,
      sql`array_to_string(${conventionsTable.partenaires}, ' ')`,
      sql`array_to_string(${conventionsTable.provincesPrefectures}, ' ')`,
      sql`array_to_string(${conventionsTable.communes}, ' ')`,
    ];

    const recherche = or(
      ...champsRecherchables.map(
        (champ) =>
          sql`${normaliserPourRecherche(sql`COALESCE(${champ}, '')`)} LIKE ${motif}`,
      ),
    );
    if (recherche) conditions.push(recherche);
  }

  if (filtres.alerte) {
    conditions.push(sql`${niveauAlerteSql} = ${filtres.alerte}`);
  }
  if (filtres.statutConvention) {
    conditions.push(eq(conventionsTable.statutConvention, filtres.statutConvention));
  }
  if (filtres.rattachement) {
    conditions.push(eq(conventionsTable.rattachement, filtres.rattachement));
  }
  if (filtres.partenaires?.length) {
    const valeurs = sql.join(filtres.partenaires.map((partenaire) => sql`${partenaire}`), sql`, `);
    conditions.push(sql`${conventionsTable.partenaires} && ARRAY[${valeurs}]::text[]`);
  }
  if (filtres.responsableProjet) {
    conditions.push(eq(conventionsTable.responsableProjet, filtres.responsableProjet));
  }
  if (filtres.nature) {
    conditions.push(eq(conventionsTable.nature, filtres.nature));
  }
  if (filtres.natureFonds) {
    conditions.push(eq(conventionsTable.natureFonds, filtres.natureFonds));
  }
  if (filtres.decision) {
    conditions.push(eq(conventionsTable.decision, filtres.decision));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function construireTri(tri: string, ordre: string): SQL[] {
  const sens = ordre === "desc" ? desc : asc;

  switch (tri) {
    case "nomConvention":
      return [sens(conventionsTable.nomConvention)];
    case "prochaineEcheance":
      return [
        sql`${conventionsTable.prochaineEcheance} IS NULL`,
        sens(conventionsTable.prochaineEcheance),
      ];
    case "dernierComite":
      return [
        sql`${conventionsTable.dernierComite} IS NULL`,
        sens(conventionsTable.dernierComite),
      ];
    case "responsableProjet":
      return [
        sql`${conventionsTable.responsableProjet} IS NULL`,
        sens(conventionsTable.responsableProjet),
      ];
    case "statutConvention":
      return [
        sql`${conventionsTable.statutConvention} IS NULL`,
        sens(conventionsTable.statutConvention),
      ];
    case "urgence":
    default:
      // Les retards les plus anciens en tête, puis les échéances les plus proches.
      return ordre === "desc"
        ? [desc(rangUrgenceSql), desc(conventionsTable.prochaineEcheance)]
        : [asc(rangUrgenceSql), asc(conventionsTable.prochaineEcheance)];
  }
}
