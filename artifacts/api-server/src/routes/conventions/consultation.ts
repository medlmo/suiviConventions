import { Router, type IRouter } from "express";
import { and, asc, count, eq, isNotNull, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db, conventionsTable } from "@workspace/db";
import {
  GetConventionParams,
  GetConventionResponse,
  GetOptionsFiltresResponse,
  ListConventionsQueryParams,
  ListConventionsResponse,
} from "@workspace/api-zod";
import { buildVisibleConventionConditions } from "../../lib/convention-access";
import { conventionColumns, toApiConvention } from "../../lib/conventions-mapper";
import { loadReferenceData } from "../../lib/reference-data";
import { assertValidApiResponse } from "./commun";
import { buildConventionFilters, buildConventionSort } from "./requetes";

// Routers distincts pour conserver l'ordre des URL fixes avant /:id.
export const conventionListRouter: IRouter = Router();
export const conventionFilterOptionsRouter: IRouter = Router();
export const conventionDetailRouter: IRouter = Router();

conventionListRouter.get("/conventions", async (req, res): Promise<void> => {
  const partenaires = req.query.partenaires;
  const query = ListConventionsQueryParams.safeParse({
    ...req.query,
    partenaires: partenaires === undefined ? undefined : Array.isArray(partenaires) ? partenaires : [partenaires],
  });
  if (!query.success) {
    res.status(400).json({ error: "Paramètres de recherche invalides." });
    return;
  }

  const { page = 1, pageSize = 25, tri = "urgence", ordre = "asc", ...filtres } = query.data;
  const reference = await loadReferenceData();
  const where = buildVisibleConventionConditions(req.user!, reference, buildConventionFilters(filtres));

  const [lignes, [total]] = await Promise.all([
    db
      .select(conventionColumns)
      .from(conventionsTable)
      .where(where)
      .orderBy(...buildConventionSort(tri, ordre))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ valeur: count() }).from(conventionsTable).where(where),
  ]);

  const nombreTotal = total?.valeur ?? 0;

  res.json(
    assertValidApiResponse(ListConventionsResponse, {
      items: lignes.map(toApiConvention),
      total: nombreTotal,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(nombreTotal / pageSize)),
    }),
  );
});

conventionFilterOptionsRouter.get("/conventions/options-filtres", async (req, res): Promise<void> => {
  const reference = await loadReferenceData();
  async function valeursDistinctes(colonne: AnyPgColumn) {
    const lignes = await db
      .selectDistinct({ valeur: colonne })
      .from(conventionsTable)
      .where(and(buildVisibleConventionConditions(req.user!, reference), isNotNull(colonne), sql`btrim(${colonne}) <> ''`))
      .orderBy(asc(colonne));
    return lignes
      .map((ligne) => ligne.valeur as string | null)
      .filter((valeur): valeur is string => valeur !== null);
  }

  const [rattachements, responsables, statuts, naturesProjet, naturesFonds, decisions, lignesPartenaires] = await Promise.all([
    valeursDistinctes(conventionsTable.rattachement),
    valeursDistinctes(conventionsTable.responsableProjet),
    valeursDistinctes(conventionsTable.statutConvention),
    valeursDistinctes(conventionsTable.nature),
    valeursDistinctes(conventionsTable.natureFonds),
    valeursDistinctes(conventionsTable.decision),
    db
      .select({ valeurs: conventionsTable.partenaires })
      .from(conventionsTable)
      .where(buildVisibleConventionConditions(req.user!, reference)),
  ]);
  const partenaires = [...new Set(lignesPartenaires.flatMap((ligne) => ligne.valeurs ?? []).filter((nom) => nom.trim() !== ""))]
    .sort((a, b) => a.localeCompare(b, "fr"));

  res.json(
    assertValidApiResponse(GetOptionsFiltresResponse, {
      rattachements,
      responsables,
      statuts,
      naturesProjet,
      naturesFonds,
      decisions,
      partenaires,
    }),
  );
});

conventionDetailRouter.get("/conventions/:id", async (req, res): Promise<void> => {
  const params = GetConventionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Identifiant de convention invalide." });
    return;
  }

  const reference = await loadReferenceData();
  const [ligne] = await db
    .select(conventionColumns)
    .from(conventionsTable)
    .where(and(
      eq(conventionsTable.id, params.data.id),
      buildVisibleConventionConditions(req.user!, reference),
    ));

  if (!ligne) {
    res.status(404).json({ error: "Convention introuvable." });
    return;
  }

  res.json(assertValidApiResponse(GetConventionResponse, toApiConvention(ligne)));
});
