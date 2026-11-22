import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, conventionsTable, conventionAuditTable } from "@workspace/db";
import { CreateConventionBody, CreateConventionResponse } from "@workspace/api-zod";
import { areAssignmentsValid, canEditConventions } from "../../lib/convention-access";
import { notifyConventionChange } from "../../lib/notifications";
import { conventionColumns, toApiConvention, toConventionColumns } from "../../lib/conventions-mapper";
import { calculateDeadline } from "../../lib/echeances";
import { prepareDocumentHistory } from "../../lib/document-history";
import { recordRequestFailure } from "../../lib/http-logging";
import { loadReferenceData, loadReferenceDataFrom, getServiceScope } from "../../lib/reference-data";
import { verifyStoredDocument, createConventionSnapshot, assertValidApiResponse } from "./commun";
import {
  doesContributionExceedBudget,
  ERREUR_CONTRIBUTION,
  ERREUR_DOCUMENT,
  normalizeConventionPayload,
  areConventionReferencesValid,
} from "./validation";
import { applyAddedDocumentColumns } from "../../lib/convention-write-helpers";

const router: IRouter = Router();

router.post("/conventions", async (req, res): Promise<void> => {
  if (!canEditConventions(req.user!)) {
    res.status(403).json({ error: "Ce rôle ne peut pas modifier les conventions." });
    return;
  }
  const normalizedPayload = normalizeConventionPayload(req.body);
  if (!normalizedPayload.ok) {
    res.status(400).json({ error: normalizedPayload.error });
    return;
  }

  const parsed = CreateConventionBody.safeParse(normalizedPayload.value);
  if (!parsed.success) {
    recordRequestFailure(res, undefined, {
      event: "convention.create.rejected", operation: "convention.create",
      status: 400, errorCode: "SCHEMA_VALIDATION_FAILED",
    });
    res.status(400).json({ error: "Données de convention invalides." });
    return;
  }
  if (doesContributionExceedBudget(parsed.data.enveloppeBudgetaire, parsed.data.contributionRegion)) {
    res.status(400).json({ error: ERREUR_CONTRIBUTION });
    return;
  }
  const documents = await prepareDocumentHistory(null, parsed.data, verifyStoredDocument);
  if (!documents) {
    res.status(400).json({ error: ERREUR_DOCUMENT });
    return;
  }

  const user = req.user!;
  await loadReferenceData();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(741024, 1)`);
    const reference = await loadReferenceDataFrom(tx);
    const valeurs = toConventionColumns(parsed.data);
    valeurs.documents = documents;
    applyAddedDocumentColumns(valeurs, parsed.data.documentsAjoutes);
    const echeance = calculateDeadline({
      nature: valeurs.nature as string | null | undefined,
      dateVisa: valeurs.dateVisa as string | null | undefined,
      dernierComite: valeurs.dernierComite as string | null | undefined,
      frequenceReunions: valeurs.frequenceReunions as string | null | undefined,
    });
    if (echeance) valeurs.prochaineEcheance = echeance.date;
    if (!areConventionReferencesValid(parsed.data, reference)) {
      return { status: 400 as const, error: "Le porteur, les maîtrises d'ouvrage, les partenaires et les territoires doivent appartenir au référentiel adapté." };
    }
    if (typeof valeurs.nomConvention !== "string" || valeurs.nomConvention === "") {
      return { status: 400 as const, error: "Le nom de la convention est obligatoire." };
    }
    if (user.role === "chef_division") {
      if (valeurs.rattachement !== undefined && valeurs.rattachement !== user.division) {
        return { status: 403 as const, error: "La convention doit rester dans votre division." };
      }
      valeurs.rattachement = user.division;
    }
    if (user.role === "chef_service") {
      const scope = getServiceScope(reference, user);
      if (
        !scope ||
        (valeurs.rattachement !== undefined && valeurs.rattachement !== scope) ||
        (valeurs.responsableProjet !== undefined && valeurs.responsableProjet !== user.service)
      ) {
        return { status: 403 as const, error: "La convention doit rester dans votre service." };
      }
      valeurs.rattachement = scope;
      valeurs.responsableProjet = user.service;
    }
    const rattachement = valeurs.rattachement as string | null | undefined;
    const responsable = valeurs.responsableProjet as string | null | undefined;
    if (
      typeof rattachement !== "string" || !rattachement.trim() ||
      typeof responsable !== "string" || !responsable.trim()
    ) {
      return { status: 400 as const, error: "Le rattachement et le responsable du projet sont obligatoires." };
    }
    if (!areAssignmentsValid(rattachement, responsable, user, reference)) {
      return { status: 400 as const, error: "Le rattachement et le service doivent correspondre à l'organigramme officiel." };
    }
    const [created] = await tx.insert(conventionsTable)
      .values({ ...valeurs, nomConvention: valeurs.nomConvention as string })
      .returning();
    if (!created) return { status: 400 as const, error: "La convention n'a pas pu être créée." };
    await tx.insert(conventionAuditTable).values({
      conventionId: created.id,
      action: "create",
      actorUsername: user.username,
      before: null,
      after: createConventionSnapshot(created),
    });
    await notifyConventionChange(tx, user, null, created, reference);
    const [line] = await tx.select(conventionColumns)
      .from(conventionsTable)
      .where(eq(conventionsTable.id, created.id));
    return line
      ? { status: 201 as const, line }
      : { status: 400 as const, error: "La convention n'a pas pu être créée." };
  });
  if (result.status !== 201) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json(assertValidApiResponse(CreateConventionResponse, toApiConvention(result.line)));
});

export default router;
