import { raw, Router, type IRouter } from "express";
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
  validateUploadBytes,
} from "../lib/objectStorage";
import { discardUpload, getStagedUpload, reserveUpload, UPLOAD_TTL_MS } from "../lib/upload-staging";
import { DocumentSecurityError } from "../lib/document-security-errors";
import { recordRequestFailure } from "../lib/http-logging";

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
    const upload = reserveUpload({ ownerId: req.user.id, name: safeName, size, contentType });
    if (!upload) {
      res.setHeader("Retry-After", "30");
      res.status(429).json({ error: "Trop de téléversements en attente. Terminez-les ou réessayez plus tard." });
      return;
    }
    res.json(RequestUploadUrlResponse.parse(upload));
  } catch (error) {
    recordRequestFailure(res, error, {
      event: "document.upload.prepare.failed", operation: "document.upload.prepare",
      status: 500, errorCode: "INTERNAL_ERROR",
    });
    res.status(500).json({ error: "Impossible de préparer le téléversement du document." });
  }
});

const readUpload = raw({ type: () => true, limit: DOCUMENT_MAX_SIZE_BYTES, inflate: false });
router.put("/storage/uploads/:token", (req, res, next): void => {
  if (!req.user) { res.status(401).json({ error: "Authentification requise." }); return; }
  if (!peutTeleverser(req.user.role)) {
    res.status(403).json({ error: "Ce rôle ne peut pas modifier les conventions." }); return;
  }
  const objectPath = `/objects/uploads/${req.params.token}`;
  const upload = getStagedUpload(objectPath, req.user.id);
  if (!upload) { res.status(404).json({ error: "Envoi introuvable ou expiré. Sélectionnez à nouveau le fichier." }); return; }
  if (upload.state !== "waiting") {
    res.status(409).json({ error: "Cet envoi a déjà été utilisé." }); return;
  }
  const declaredLength = req.get("Content-Length");
  if ((declaredLength !== undefined && Number(declaredLength) > DOCUMENT_MAX_SIZE_BYTES)) {
    discardUpload(objectPath);
    res.status(413).json({ error: ERREUR_FORMAT }); return;
  }
  if (req.get("Content-Type") !== upload.contentType ||
      (req.get("Content-Encoding") && req.get("Content-Encoding") !== "identity") ||
      (declaredLength !== undefined && Number(declaredLength) !== upload.size)) {
    discardUpload(objectPath);
    res.status(400).json({ error: ERREUR_FORMAT }); return;
  }
  upload.state = "receiving";
  // Délai absolu, y compris si le client envoie les octets au compte-gouttes.
  const timeout = setTimeout(() => {
    discardUpload(objectPath);
    req.destroy();
  }, 60_000);
  timeout.unref();
  readUpload(req, res, (error?: unknown) => {
    clearTimeout(timeout);
    if (error) { discardUpload(objectPath); next(error); return; }
    try {
      if (!Buffer.isBuffer(req.body) || req.body.length !== upload.size || upload.expiresAt <= Date.now()) {
        throw new InvalidDocumentError();
      }
      validateUploadBytes(upload.name, req.body);
      upload.bytes = req.body;
      upload.state = "ready";
      res.status(204).end();
    } catch (cause) {
      discardUpload(objectPath);
      if (cause instanceof InvalidDocumentError) { res.status(400).json({ error: ERREUR_FORMAT }); return; }
      next(cause);
    }
  });
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

  const upload = getStagedUpload(parsed.data.objectPath, req.user.id);
  if (!upload || upload.name !== parsed.data.name) {
    res.status(404).json({ error: "Envoi introuvable ou expiré. Sélectionnez à nouveau le fichier." });
    return;
  }
  if (upload.state === "completed" && upload.document) {
    res.json(CompleteUploadResponse.parse(upload.document));
    return;
  }
  if (upload.state !== "ready" || !upload.bytes) {
    res.status(409).json({ error: "Le fichier n'est pas prêt ou son analyse est déjà en cours." });
    return;
  }
  upload.state = "finalizing";
  try {
    const document = await objectStorageService.finalizeUploadedDocument(
      upload.bytes,
      upload.name,
    );
    upload.document = document;
    upload.bytes = undefined;
    upload.state = "completed";
    upload.expiresAt = Date.now() + UPLOAD_TTL_MS;
    res.json(CompleteUploadResponse.parse(document));
  } catch (error) {
    upload.state = "ready";
    if (error instanceof DocumentSecurityError) {
      if (error.code === "DOCUMENT_REJECTED") discardUpload(parsed.data.objectPath);
      recordRequestFailure(res, error, {
        event: "document.security.blocked", operation: "document.upload.complete",
        status: error.status, errorCode: error.code,
      });
      res.setHeader("Retry-After", error.code === "ANALYSIS_UNAVAILABLE" ? "60" : "5");
      res.status(error.status).json({ error: error.message, code: error.code, securityStatus: error.securityStatus });
      return;
    }
    if (error instanceof InvalidDocumentError) {
      discardUpload(parsed.data.objectPath);
      res.status(400).json({ error: ERREUR_FORMAT });
      return;
    }
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Fichier téléversé introuvable." });
      return;
    }
    recordRequestFailure(res, error, {
      event: "document.upload.complete.failed", operation: "document.upload.complete",
      status: 500, errorCode: "INTERNAL_ERROR",
    });
    res.status(500).json({ error: "Impossible de valider le document téléversé." });
  }
});

export default router;