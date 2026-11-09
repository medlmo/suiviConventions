import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  directionsTable,
  divisionsTable,
  maitrisesOuvrageTable,
  servicesDgsTable,
  servicesTable,
} from "@workspace/db";
import { adminRequired } from "../../lib/auth";
import { chargerReferentiel } from "../../lib/reference-data";
import { postgresErrorCode } from "../../lib/database-errors";
import { isReferenceDataKind, renommerEntreeReferentiel } from "../../lib/reference-data-rename";
import {
  CreateReferenceDataEntryBody,
  CreateReferenceDataEntryResponse,
  GetReferenceDataResponse,
  RenameReferenceDataEntryBody,
  RenameReferenceDataEntryResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/reference-data", async (_req, res): Promise<void> => {
  res.json(GetReferenceDataResponse.parse(await chargerReferentiel()));
});

router.post("/admin/reference-data/:kind", adminRequired, async (req, res): Promise<void> => {
  const params = CreateReferenceDataEntryBody.safeParse(req.body);
  const kind = Array.isArray(req.params.kind) ? req.params.kind[0] : req.params.kind;
  if (
    !params.success ||
    Object.keys(req.body as Record<string, unknown>).some((key) => !["nom", "parentId"].includes(key)) ||
    typeof kind !== "string" ||
    !isReferenceDataKind(kind)
  ) {
    res.status(400).json({
      error: params.success ? "Type de référentiel invalide." : "Données de référentiel invalides.",
    });
    return;
  }
  const { nom: brut, parentId } = params.data;
  const nom = brut.trim();
  if (!nom || nom.length > 255) {
    res.status(400).json({ error: "Le nom doit contenir entre 1 et 255 caractères." });
    return;
  }
  if ((kind === "divisions" || kind === "services") !== (parentId !== undefined)) {
    res.status(400).json({ error: "Un parentId est requis uniquement pour les divisions et services." });
    return;
  }

  await chargerReferentiel();
  try {
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(741024, 1)`);
      if (kind === "directions") {
        await tx.insert(directionsTable).values({ nom });
      } else if (kind === "divisions") {
        const [parent] = await tx.select({ id: directionsTable.id }).from(directionsTable)
          .where(eq(directionsTable.id, parentId!));
        if (!parent) return "bad-parent" as const;
        await tx.insert(divisionsTable).values({ directionId: parent.id, nom });
      } else if (kind === "services") {
        const [parent] = await tx.select({ id: divisionsTable.id }).from(divisionsTable)
          .where(eq(divisionsTable.id, parentId!));
        if (!parent) return "bad-parent" as const;
        await tx.insert(servicesTable).values({ divisionId: parent.id, nom });
      } else if (kind === "services-dgs") {
        await tx.insert(servicesDgsTable).values({ nom });
      } else {
        await tx.insert(maitrisesOuvrageTable).values({ nom });
      }
      return "created" as const;
    });
    if (result === "bad-parent") {
      res.status(400).json({ error: "Parent introuvable ou de type incompatible." });
      return;
    }
    res.json(CreateReferenceDataEntryResponse.parse(await chargerReferentiel()));
  } catch (error) {
    if (postgresErrorCode(error) === "23505") {
      res.status(409).json({ error: "Une entrée portant ce nom existe déjà dans cette catégorie." });
      return;
    }
    throw error;
  }
});

router.patch("/admin/reference-data/:kind/:id", adminRequired, async (req, res): Promise<void> => {
  const params = RenameReferenceDataEntryBody.safeParse(req.body);
  const kind = Array.isArray(req.params.kind) ? req.params.kind[0] : req.params.kind;
  const id = idFrom(req.params.id);
  if (
    !params.success ||
    Object.keys(req.body as Record<string, unknown>).some((key) => key !== "nom") ||
    !id ||
    typeof kind !== "string" ||
    !isReferenceDataKind(kind)
  ) {
    res.status(400).json({ error: "Paramètres de référentiel invalides." });
    return;
  }
  const nom = params.data.nom.trim();
  if (!nom || nom.length > 255) {
    res.status(400).json({ error: "Le nom doit contenir entre 1 et 255 caractères." });
    return;
  }

  await chargerReferentiel();
  try {
    const outcome = await renommerEntreeReferentiel(kind, id, nom);
    if (!outcome) {
      res.status(404).json({ error: "Entrée de référentiel introuvable." });
      return;
    }
    res.json(RenameReferenceDataEntryResponse.parse(await chargerReferentiel()));
  } catch (error) {
    if (postgresErrorCode(error) === "23505") {
      res.status(409).json({ error: "Une entrée portant ce nom existe déjà dans cette catégorie." });
      return;
    }
    throw error;
  }
});

function idFrom(raw: string | string[] | undefined): number | undefined {
  const number = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

export default router;
