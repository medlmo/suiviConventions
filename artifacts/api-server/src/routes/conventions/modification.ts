import { Router, type IRouter } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, conventionsTable, conventionAuditTable } from "@workspace/db";
import { UpdateConventionBody, UpdateConventionParams, UpdateConventionResponse } from "@workspace/api-zod";
import { isConventionAccessible, areAssignmentsValid, canEditConventions } from "../../lib/convention-access";
import { notifierChangementConvention } from "../../lib/notifications";
import { colonnesConvention, versApi, versColonnes } from "../../lib/conventions-mapper";
import { appliquerColonnesDocumentsAjoutes, appliquerEcheanceModification } from "../../lib/convention-write-helpers";
import { preparerHistoriqueDocuments } from "../../lib/document-history";
import { erreurPartenairesFinanciers } from "../../lib/suivi-financier";
import { createPhysicalProgressRecord, supportsPhysicalProgress } from "../../lib/avancement-physique";
import { recordRequestFailure } from "../../lib/http-logging";
import { loadReferenceData, loadReferenceDataFrom } from "../../lib/reference-data";
import { documentVerifie, snapshot, valide } from "./commun";
import {
  contributionDepasseEnveloppe,
  ERREUR_CONTRIBUTION,
  normaliserCorps,
  referencesConventionValides,
} from "./validation";

const router: IRouter = Router();

router.patch("/conventions/:id", async (req, res): Promise<void> => {
  if (!canEditConventions(req.user!)) {
    res.status(403).json({ error: "Ce rôle ne peut pas modifier les conventions." });
    return;
  }
  const params = UpdateConventionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Identifiant de convention invalide." });
    return;
  }

  const nettoye = normaliserCorps(req.body);
  if (!nettoye.ok) {
    res.status(400).json({ error: nettoye.erreur });
    return;
  }

  const parsed = UpdateConventionBody.safeParse(nettoye.valeur);
  if (!parsed.success) {
    recordRequestFailure(res, undefined, {
      event: "convention.update.rejected", operation: "convention.update",
      status: 400, errorCode: "SCHEMA_VALIDATION_FAILED",
    });
    res.status(400).json({ error: "Données de convention invalides." });
    return;
  }

  const valeurs = versColonnes(parsed.data);
  if ("nomConvention" in valeurs && !valeurs.nomConvention) {
    res.status(400).json({ error: "Le nom de la convention est obligatoire." });
    return;
  }

  const user = req.user!;
  await loadReferenceData();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(741024, 1)`);
    const reference = await loadReferenceDataFrom(tx);
    const [current] = await tx.select().from(conventionsTable)
      .where(and(eq(conventionsTable.id, params.data.id), isNull(conventionsTable.deletedAt)))
      .for("update");
    if (!current || !isConventionAccessible(current, user, reference)) return { status: 404 as const };
    if (current.version !== parsed.data.version) return { status: 409 as const };
    const sessionFinale = Object.hasOwn(valeurs, "session") ? valeurs.session : current.session;
    if (typeof sessionFinale !== "string" || !sessionFinale) {
      return { status: 400 as const, error: "La date de session est obligatoire." };
    }
    if (parsed.data.avancementPhysiqueAjoute) {
      const natureFinale = Object.hasOwn(valeurs, "nature") ? valeurs.nature : current.nature;
      if (!supportsPhysicalProgress(natureFinale)) {
        return { status: 400 as const, error: "L'avancement physique est réservé aux projets de nature Infrastructure ou Prestations." };
      }
      valeurs.avancementPhysiqueHistorique = [
        ...(current.avancementPhysiqueHistorique ?? []),
        createPhysicalProgressRecord(parsed.data.avancementPhysiqueAjoute, user.username),
      ];
    }

    const anciennesMo = current.maitrisesOuvrage ?? (current.maitriseOuvrage ? [current.maitriseOuvrage] : []);
    const anciennesMoDeleguees = current.maitrisesOuvrageDeleguees ??
      (current.maitriseOuvrageDeleguee ? [current.maitriseOuvrageDeleguee] : []);
    const anciensPartenaires = current.partenaires ?? [];
    const erreurFinanciere = erreurPartenairesFinanciers(
      parsed.data.suiviFinancier ?? current.suiviFinancier,
      (valeurs.partenaires as string[] | undefined) ?? anciensPartenaires,
    );
    if (erreurFinanciere) return { status: 400 as const, error: erreurFinanciere };
    const anciennesProvincesPrefectures = current.provincesPrefectures ?? [];
    const anciennesCommunes = current.communes ?? [];
    if (!referencesConventionValides(parsed.data, reference, {
      maitriseOuvrage: anciennesMo,
      maitriseOuvrageDeleguee: anciennesMoDeleguees,
      partenaires: anciensPartenaires,
      provincesPrefectures: anciennesProvincesPrefectures,
      communes: anciennesCommunes,
      porteurProjet: current.porteurProjet,
    })) {
      return { status: 400 as const, error: "Le porteur, les maîtrises d'ouvrage, les partenaires et les territoires doivent appartenir au référentiel adapté." };
    }

    const documents = await preparerHistoriqueDocuments(current, parsed.data, documentVerifie);
    if (!documents) return { status: 400 as const, error: "Ajout ou retrait de document invalide. Seuls les documents de cette fiche peuvent être retirés et les nouveaux fichiers doivent être vérifiés." };
    valeurs.documents = documents;
    // Garder les anciens champs compatibles avec les exports et anciens clients.
    appliquerColonnesDocumentsAjoutes(valeurs, parsed.data.documentsAjoutes);
    // Ne pas ressusciter un document retiré via les anciennes colonnes scalaires.
    for (const [champ, type] of [["documentConvention", "convention"], ["pv", "pv"]] as const) {
      const cheminFinal = Object.hasOwn(valeurs, champ) ? valeurs[champ] : current[champ];
      if (typeof cheminFinal === "string" && parsed.data.documentsRetires?.includes(cheminFinal)) {
        valeurs[champ] = [...documents].reverse().find(document => document.type === type)?.objectPath ?? null;
      }
    }

    const enveloppeFinale = Object.hasOwn(parsed.data, "enveloppeBudgetaire")
      ? parsed.data.enveloppeBudgetaire : current.enveloppeBudgetaire;
    const contributionFinale = Object.hasOwn(parsed.data, "contributionRegion")
      ? parsed.data.contributionRegion : current.contributionRegion;
    if (contributionDepasseEnveloppe(enveloppeFinale, contributionFinale)) {
      return { status: 400 as const };
    }

    const rattachementFinal = (
      Object.hasOwn(valeurs, "rattachement") ? valeurs.rattachement : current.rattachement
    ) as string | null;
    const responsableFinal = (
      Object.hasOwn(valeurs, "responsableProjet") ? valeurs.responsableProjet : current.responsableProjet
    ) as string | null;
    if (
      (user.role === "admin" && ("rattachement" in valeurs || "responsableProjet" in valeurs) &&
        !areAssignmentsValid(rattachementFinal, responsableFinal, user, reference)) ||
      (user.role !== "admin" && !areAssignmentsValid(rattachementFinal, responsableFinal, user, reference))
    ) {
      return { status: 403 as const };
    }
    appliquerEcheanceModification(current, valeurs);
    const [updated] = await tx.update(conventionsTable)
      .set({ ...valeurs, version: current.version + 1, updatedAt: new Date() })
      .where(and(
        eq(conventionsTable.id, params.data.id),
        eq(conventionsTable.version, parsed.data.version),
        isNull(conventionsTable.deletedAt),
      ))
      .returning();
    if (!updated) return { status: 409 as const };
    await tx.insert(conventionAuditTable).values({
      conventionId: updated.id,
      action: "update",
      actorUsername: user.username,
      before: snapshot(current),
      after: snapshot(updated),
    });
    await notifierChangementConvention(tx, user, current, updated, reference);
    const [line] = await tx.select(colonnesConvention).from(conventionsTable)
      .where(eq(conventionsTable.id, updated.id));
    return line ? { status: 200 as const, line } : { status: 404 as const };
  });
  if (result.status === 404) {
    res.status(404).json({ error: "Convention introuvable." });
    return;
  }
  if (result.status === 403) {
    res.status(403).json({ error: "Affectation non autorisée pour votre périmètre." });
    return;
  }
  if (result.status === 400) {
    res.status(400).json({ error: result.error ?? ERREUR_CONTRIBUTION });
    return;
  }
  if (result.status === 409) {
    res.status(409).json({ error: "La convention a été modifiée entre-temps. Rechargez-la avant de réessayer." });
    return;
  }
  res.json(valide(UpdateConventionResponse, versApi(result.line)));
});

export default router;
