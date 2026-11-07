import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, conventionsTable, conventionAuditTable } from "@workspace/db";
import { CreateConventionBody, CreateConventionResponse } from "@workspace/api-zod";
import { affectationsValides, peutEcrire } from "../../lib/convention-access";
import { notifierChangementConvention } from "../../lib/notifications";
import { colonnesConvention, versApi, versColonnes } from "../../lib/conventions-mapper";
import { calculerEcheance } from "../../lib/echeances";
import { preparerHistoriqueDocuments } from "../../lib/document-history";
import { recordRequestFailure } from "../../lib/http-logging";
import { chargerReferentiel, chargerReferentielDepuis, perimetreChefService } from "../../lib/reference-data";
import { documentVerifie, snapshot, valide } from "./commun";
import {
  contributionDepasseEnveloppe,
  ERREUR_CONTRIBUTION,
  ERREUR_DOCUMENT,
  listeMoValide,
  listeTerritoiresValide,
  nomCommune,
  nomProvinceOuPrefecture,
  normaliserCorps,
  valeurMoValide,
} from "./validation";

const router: IRouter = Router();

router.post("/conventions", async (req, res): Promise<void> => {
  if (!peutEcrire(req.user!)) {
    res.status(403).json({ error: "Ce rôle ne peut pas modifier les conventions." });
    return;
  }
  const nettoye = normaliserCorps(req.body);
  if (!nettoye.ok) {
    res.status(400).json({ error: nettoye.erreur });
    return;
  }

  const parsed = CreateConventionBody.safeParse(nettoye.valeur);
  if (!parsed.success) {
    recordRequestFailure(res, undefined, {
      event: "convention.create.rejected", operation: "convention.create",
      status: 400, errorCode: "SCHEMA_VALIDATION_FAILED",
    });
    res.status(400).json({ error: "Données de convention invalides." });
    return;
  }
  if (contributionDepasseEnveloppe(parsed.data.enveloppeBudgetaire, parsed.data.contributionRegion)) {
    res.status(400).json({ error: ERREUR_CONTRIBUTION });
    return;
  }
  const documents = await preparerHistoriqueDocuments(null, parsed.data, documentVerifie);
  if (!documents) {
    res.status(400).json({ error: ERREUR_DOCUMENT });
    return;
  }

  const user = req.user!;
  await chargerReferentiel();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(741024, 1)`);
    const reference = await chargerReferentielDepuis(tx);
    const valeurs = versColonnes(parsed.data);
    valeurs.documents = documents;
    for (const document of parsed.data.documentsAjoutes ?? []) {
      if (document.type === "pv") valeurs.pv = document.objectPath;
      if (document.type === "convention") valeurs.documentConvention = document.objectPath;
    }
    const echeance = calculerEcheance({
      nature: valeurs.nature as string | null | undefined,
      dateVisa: valeurs.dateVisa as string | null | undefined,
      dernierComite: valeurs.dernierComite as string | null | undefined,
      frequenceReunions: valeurs.frequenceReunions as string | null | undefined,
    });
    if (echeance) valeurs.prochaineEcheance = echeance.date;
    if (
      !listeMoValide(parsed.data.maitriseOuvrage, reference) ||
      !listeMoValide(parsed.data.maitriseOuvrageDeleguee, reference) ||
      !listeMoValide(parsed.data.partenaires, reference) ||
      !listeTerritoiresValide(parsed.data.provincesPrefectures, reference, nomProvinceOuPrefecture) ||
      !listeTerritoiresValide(parsed.data.communes, reference, nomCommune) ||
      !valeurMoValide(parsed.data.porteurProjet, reference)
    ) {
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
      const scope = perimetreChefService(reference, user);
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
    if (!affectationsValides(rattachement, responsable, user, reference)) {
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
      after: snapshot(created),
    });
    await notifierChangementConvention(tx, user, null, created, reference);
    const [line] = await tx.select(colonnesConvention)
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
  res.status(201).json(valide(CreateConventionResponse, versApi(result.line)));
});

export default router;
