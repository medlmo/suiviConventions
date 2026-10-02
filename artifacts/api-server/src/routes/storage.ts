import { Router, type IRouter } from "express";
import {
  CompleteUploadBody,
  CompleteUploadResponse,
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import {
  DOCUMENT_MAX_SIZE_BYTES,
  InvalidDocumentError,
  ObjectNotFoundError,
  ObjectStorageService,
  normaliserNomDocument,
  typeDocumentPourNom,
} from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const ERREUR_FORMAT = "Choisissez un fichier PDF ou Word (.doc, .docx) de 10 Mo maximum.";

function peutTeleverser(role: string): boolean {
  return role !== "directeur" && role !== "directeur_general_services";
}

router.post("/storage/uploads/request-url", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Authentification requise." });
    return;
  }
  if (!peutTeleverser(req.user.role)) {
    res.status(403).json({ error: "Ce rôle ne peut pas modifier les conventions." });
    return;
  }

  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: ERREUR_FORMAT });
    return;
  }
  const { name, size, contentType } = parsed.data;
  const safeName = normaliserNomDocument(name);
  if (
    !safeName ||
    safeName !== name ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > DOCUMENT_MAX_SIZE_BYTES ||
    typeDocumentPourNom(safeName) !== contentType
  ) {
    res.status(400).json({ error: ERREUR_FORMAT });
    return;
  }

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json(RequestUploadUrlResponse.parse({ uploadURL, objectPath }));
  } catch (error) {
    req.log.error({ err: error }, "Préparation du téléversement impossible");
    res.status(500).json({ error: "Impossible de préparer le téléversement du document." });
  }
});

router.post("/storage/uploads/complete", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "Authentification requise." });
    return;
  }
  if (!peutTeleverser(req.user.role)) {
    res.status(403).json({ error: "Ce rôle ne peut pas modifier les conventions." });
    return;
  }

  const parsed = CompleteUploadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: ERREUR_FORMAT });
    return;
  }

  try {
    const document = await objectStorageService.finalizeUploadedDocument(
      parsed.data.objectPath,
      parsed.data.name,
    );
    res.json(CompleteUploadResponse.parse(document));
  } catch (error) {
    if (error instanceof InvalidDocumentError) {
      res.status(400).json({ error: ERREUR_FORMAT });
      return;
    }
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Fichier téléversé introuvable." });
      return;
    }
    req.log.error({ err: error }, "Validation du document téléversé impossible");
    res.status(500).json({ error: "Impossible de valider le document téléversé." });
  }
});

export default router;