import { Router, type IRouter } from "express";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, conventionsTable, conventionAuditTable } from "@workspace/db";
import { UpdateConventionBody, UpdateConventionParams, UpdateConventionResponse } from "@workspace/api-zod";
import { accessible, affectationsValides, peutEcrire } from "../../lib/convention-access";
import { notifierChangementConvention } from "../../lib/notifications";
import { colonnesConvention, versApi, versColonnes } from "../../lib/conventions-mapper";
import { calculerEcheance } from "../../lib/echeances";
import { preparerHistoriqueDocuments } from "../../lib/document-history";
import { erreurPartenairesFinanciers } from "../../lib/suivi-financier";
import { creerConstatAvancement, natureAvecAvancement } from "../../lib/avancement-physique";
import { recordRequestFailure } from "../../lib/http-logging";
import { chargerReferentiel, chargerReferentielDepuis } from "../../lib/reference-data";
import { documentVerifie, snapshot, valide } from "./commun";
import {
  contributionDepasseEnveloppe,
  ERREUR_CONTRIBUTION,
  listeMoValide,
  listeTerritoiresValide,
  nomCommune,
  nomProvinceOuPrefecture,
  normaliserCorps,
  valeurMoValide,
} from "./validation";

const router: IRouter = Router();

router.patch("/conventions/:id", async (req, res): Promise<void> => {
  if (!peutEcrire(req.user!)) {
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
  await chargerReferentiel();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(741024, 1)`);
    const reference = await chargerReferentielDepuis(tx);
    const [current] = await tx.select().from(conventionsTable)
      .where(and(eq(conventionsTable.id, params.data.id), isNull(conventionsTable.deletedAt)))
      .for("update");
    if (!current || !accessible(current, user, reference)) return { status: 404 as const };
    if (current.version !== parsed.data.version) return { status: 409 as const };
    const sessionFinale = Object.hasOwn(valeurs, "session") ? valeurs.session : current.session;
    if (typeof sessionFinale !== "string" || !sessionFinale) {
      return { status: 400 as const, error: "La date de session est obligatoire." };
    }
    if (parsed.data.avancementPhysiqueAjoute) {
      const natureFinale = Object.hasOwn(valeurs, "nature") ? valeurs.nature : current.nature;
      if (!natureAvecAvancement(natureFinale)) {
        return { status: 400 as const, error: "L'avancement physique est réservé aux projets de nature Infrastructure ou Prestations." };
      }
      valeurs.avancementPhysiqueHistorique = [
        ...(current.avancementPhysiqueHistorique ?? []),
        creerConstatAvancement(parsed.data.avancementPhysiqueAjoute, user.username),
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
    if (
      !listeMoValide(parsed.data.maitriseOuvrage, reference, anciennesMo) ||
      !listeMoValide(parsed.data.maitriseOuvrageDeleguee, reference, anciennesMoDeleguees) ||
      !listeMoValide(parsed.data.partenaires, reference, anciensPartenaires) ||
      !listeTerritoiresValide(
        parsed.data.provincesPrefectures,
        reference,
        nomProvinceOuPrefecture,
        anciennesProvincesPrefectures,
      ) ||
      !listeTerritoiresValide(parsed.data.communes, reference, nomCommune, anciennesCommunes) ||
      !valeurMoValide(parsed.data.porteurProjet, reference, current.porteurProjet)
    ) {
      return { status: 400 as const, error: "Le porteur, les maîtrises d'ouvrage, les partenaires et les territoires doivent appartenir au référentiel adapté." };
    }

    const documents = await preparerHistoriqueDocuments(current, parsed.data, documentVerifie);
    if (!documents) return { status: 400 as const, error: "Ajout ou retrait de document invalide. Seuls les documents de cette fiche peuvent être retirés et les nouveaux fichiers doivent être vérifiés." };
    valeurs.documents = documents;
    // Garder les anciens champs compatibles avec les exports et anciens clients.
    for (const document of parsed.data.documentsAjoutes ?? []) {
      if (document.type === "pv") valeurs.pv = document.objectPath;
      if (document.type === "convention") valeurs.documentConvention = document.objectPath;
    }
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
        !affectationsValides(rattachementFinal, responsableFinal, user, reference)) ||
      (user.role !== "admin" && !affectationsValides(rattachementFinal, responsableFinal, user, reference))
    ) {
      return { status: 403 as const };
    }
    const valeurFinale = (champ: "nature" | "dateVisa" | "dernierComite" | "frequenceReunions") =>
      Object.hasOwn(valeurs, champ) ? valeurs[champ] as string | null : current[champ];
    const echeanceAvant = calculerEcheance(current);
    const echeance = calculerEcheance({
      nature: valeurFinale("nature"),
      dateVisa: valeurFinale("dateVisa"),
      dernierComite: valeurFinale("dernierComite"),
      frequenceReunions: valeurFinale("frequenceReunions"),
    });
    const champsDeterminants = valeurFinale("dernierComite")
      ? (["dernierComite", "frequenceReunions"] as const)
      : (["dernierComite", "nature", "dateVisa"] as const);
    const sourcesChangees = champsDeterminants
      .some((champ) => Object.hasOwn(valeurs, champ) && valeurs[champ] !== current[champ]);
    if (
      echeance &&
      (sourcesChangees || !current.prochaineEcheance || current.prochaineEcheance === echeance.date)
    ) {
      // Une ancienne date manuelle différente du calcul est conservée tant que
      // ni la date de base, ni la fréquence, ni la nature n'ont changé.
      valeurs.prochaineEcheance = echeance.date;
    } else if (
      echeanceAvant &&
      current.prochaineEcheance === echeanceAvant.date &&
      !Object.hasOwn(valeurs, "prochaineEcheance") &&
      sourcesChangees
    ) {
      // Si l'ancien calcul n'est plus possible, ne pas laisser une ancienne
      // échéance automatique passer pour une date saisie manuellement.
      valeurs.prochaineEcheance = null;
    }
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
