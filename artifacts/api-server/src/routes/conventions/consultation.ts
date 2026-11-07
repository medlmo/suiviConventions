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
import { conditionsVisibles } from "../../lib/convention-access";
import { colonnesConvention, versApi } from "../../lib/conventions-mapper";
import { chargerReferentiel } from "../../lib/reference-data";
import { valide } from "./commun";
import { construireFiltres, construireTri } from "./requetes";

// Routers distincts pour conserver l'ordre des URL fixes avant /:id.
export const listeRouter: IRouter = Router();
export const optionsFiltresRouter: IRouter = Router();
export const detailRouter: IRouter = Router();

listeRouter.get("/conventions", async (req, res): Promise<void> => {
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
  const reference = await chargerReferentiel();
  const where = conditionsVisibles(req.user!, reference, construireFiltres(filtres));

  const [lignes, [total]] = await Promise.all([
    db
      .select(colonnesConvention)
      .from(conventionsTable)
      .where(where)
      .orderBy(...construireTri(tri, ordre))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ valeur: count() }).from(conventionsTable).where(where),
  ]);

  const nombreTotal = total?.valeur ?? 0;

  res.json(
    valide(ListConventionsResponse, {
      items: lignes.map(versApi),
      total: nombreTotal,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(nombreTotal / pageSize)),
    }),
  );
});

optionsFiltresRouter.get("/conventions/options-filtres", async (req, res): Promise<void> => {
  const reference = await chargerReferentiel();
  async function valeursDistinctes(colonne: AnyPgColumn) {
    const lignes = await db
      .selectDistinct({ valeur: colonne })
      .from(conventionsTable)
      .where(and(conditionsVisibles(req.user!, reference), isNotNull(colonne), sql`btrim(${colonne}) <> ''`))
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
      .where(conditionsVisibles(req.user!, reference)),
  ]);
  const partenaires = [...new Set(lignesPartenaires.flatMap((ligne) => ligne.valeurs ?? []).filter((nom) => nom.trim() !== ""))]
    .sort((a, b) => a.localeCompare(b, "fr"));

  res.json(
    valide(GetOptionsFiltresResponse, {
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

detailRouter.get("/conventions/:id", async (req, res): Promise<void> => {
  const params = GetConventionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Identifiant de convention invalide." });
    return;
  }

  const reference = await chargerReferentiel();
  const [ligne] = await db
    .select(colonnesConvention)
    .from(conventionsTable)
    .where(and(
      eq(conventionsTable.id, params.data.id),
      conditionsVisibles(req.user!, reference),
    ));

  if (!ligne) {
    res.status(404).json({ error: "Convention introuvable." });
    return;
  }

  res.json(valide(GetConventionResponse, versApi(ligne)));
});
