import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db, conventionsTable } from "@workspace/db";
import { GetConventionParams } from "@workspace/api-zod";
import { conditionsVisibles } from "../../lib/convention-access";
import { colonnesConvention, documentsConvention, versApi } from "../../lib/conventions-mapper";
import { genererFicheTechnique } from "../../lib/fiche-technique";
import { recordRequestFailure } from "../../lib/http-logging";
import { chargerReferentiel } from "../../lib/reference-data";
import { documentVerifie, objectStorageService } from "./commun";

export const ficheTechniqueRouter: IRouter = Router();
export const documentsRouter: IRouter = Router();

ficheTechniqueRouter.get("/conventions/:id/fiche-technique", async (req, res): Promise<void> => {
  const params = GetConventionParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Convention introuvable." });
    return;
  }
  const reference = await chargerReferentiel();
  const [ligne] = await db.select(colonnesConvention).from(conventionsTable).where(and(
    eq(conventionsTable.id, params.data.id),
    isNull(conventionsTable.deletedAt),
    conditionsVisibles(req.user!, reference),
  ));
  if (!ligne) {
    res.status(404).json({ error: "Convention introuvable." });
    return;
  }
  try {
    const fichier = await genererFicheTechnique(versApi(ligne));
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="fiche-technique-convention-${ligne.id}.docx"`);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(fichier);
  } catch (error) {
    recordRequestFailure(res, error, {
      event: "document.generate.failed", operation: "document.generate",
      status: 500, errorCode: "INTERNAL_ERROR",
    });
    res.status(500).json({ error: "La fiche technique n'a pas pu être générée. Réessayez." });
  }
});

documentsRouter.get("/conventions/:id/documents/:field", async (req, res): Promise<void> => {
  const params = GetConventionParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Convention ou document introuvable." });
    return;
  }
  if (req.params.field !== "documentConvention" && req.params.field !== "pv") {
    res.status(404).json({ error: "Convention ou document introuvable." });
    return;
  }

  const reference = await chargerReferentiel();
  const [ligne] = await db.select().from(conventionsTable).where(and(
    eq(conventionsTable.id, params.data.id),
    isNull(conventionsTable.deletedAt),
    conditionsVisibles(req.user!, reference),
  ));
  if (!ligne) {
    res.status(404).json({ error: "Convention ou document introuvable." });
    return;
  }

  const cheminDemande = req.query.objectPath;
  if (cheminDemande !== undefined && typeof cheminDemande !== "string") {
    res.status(400).json({ error: "Chemin de document invalide." });
    return;
  }
  const chemin = typeof cheminDemande === "string"
    ? documentsConvention(ligne).find(document =>
      document.objectPath === cheminDemande &&
      (req.params.field === "pv" ? document.type === "pv" : document.type !== "pv")
    )?.objectPath
    : req.params.field === "pv" ? ligne.pv : ligne.documentConvention;
  if (!chemin) {
    res.status(404).json({ error: "Convention ou document introuvable." });
    return;
  }
  const document = await documentVerifie(chemin);
  if (!document) {
    res.status(404).json({ error: "Convention ou document introuvable." });
    return;
  }

  const fichier = await objectStorageService.getObjectEntityFile(chemin, document.generation);
  const nomAscii = document.name.replace(/[^A-Za-z0-9._-]/g, "_") || "document";
  const nomEncode = encodeURIComponent(document.name).replace(/[!'()*]/g, (caractere) =>
    `%${caractere.charCodeAt(0).toString(16).toUpperCase()}`);
  res.setHeader("Content-Type", document.contentType);
  res.setHeader("Content-Length", String(document.size));
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${nomAscii}"; filename*=UTF-8''${nomEncode}`,
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  fichier.createReadStream()
    .on("error", (error) => {
      recordRequestFailure(res, error, {
        event: "document.download.failed", operation: "document.download",
        status: 500, errorCode: "INTERNAL_ERROR",
      });
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    })
    .pipe(res);
});
