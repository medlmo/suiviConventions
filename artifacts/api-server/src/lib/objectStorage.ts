import { randomUUID } from "node:crypto";
import { File, Storage } from "@google-cloud/storage";
import { inspectDocument, DOCUMENT_SECURITY_POLICY } from "./document-security";
import { documentRejected } from "./document-security-errors";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const DOCUMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const OBJECT_PATH_PATTERN = /^\/objects\/(?:uploads|documents)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOCUMENT_PATH_PATTERN = /^\/objects\/documents\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Fichier introuvable.");
    this.name = "ObjectNotFoundError";
  }
}

export class InvalidDocumentError extends Error {
  constructor(message = "Le fichier doit être un PDF ou un document Word de 10 Mo maximum.") {
    super(message);
    this.name = "InvalidDocumentError";
  }
}

export interface VerifiedDocument {
  objectPath: string;
  name: string;
  contentType: string;
  size: number;
  generation: string;
}

export function normaliserNomDocument(nomBrut: string): string | null {
  const nom = nomBrut.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!nom || nom.length > 255 || nom === "." || nom === "..") return null;
  return nom;
}

export function typeDocumentPourNom(nom: string): string | null {
  const extension = nom.slice(nom.lastIndexOf(".")).toLowerCase();
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? null;
}

function signatureValide(nom: string, prefixe: Buffer): boolean {
  const extension = nom.slice(nom.lastIndexOf(".")).toLowerCase();
  if (extension === ".pdf") return prefixe.subarray(0, 5).toString("ascii") === "%PDF-";
  if (extension === ".doc") {
    return prefixe.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  }
  if (extension === ".docx") {
    return prefixe.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  }
  return false;
}

export class ObjectStorageService {
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) throw new Error("PRIVATE_OBJECT_DIR n'est pas configuré.");
    const normalized = dir.replace(/\/+$/u, "");
    const publicDirs = (process.env.PUBLIC_OBJECT_SEARCH_PATHS ?? "").split(",").map(p => p.trim().replace(/\/+$/u, "")).filter(Boolean);
    if (publicDirs.some(p => normalized === p || normalized.startsWith(p + "/") || p.startsWith(normalized + "/"))) {
      throw new Error("Les répertoires de documents privés et d'objets publics doivent être séparés.");
    }
    return dir;
  }

  async getObjectEntityFile(objectPath: string, generation?: string): Promise<File> {
    if (!OBJECT_PATH_PATTERN.test(objectPath)) throw new ObjectNotFoundError();
    const relativePath = objectPath.slice("/objects/".length);
    let privateDir = this.getPrivateObjectDir();
    if (!privateDir.endsWith("/")) privateDir = `${privateDir}/`;
    const { bucketName, objectName } = parseObjectPath(`${privateDir}${relativePath}`);
    const file = objectStorageClient.bucket(bucketName).file(objectName, generation ? { generation } : undefined);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  async finalizeUploadedDocument(bytes: Buffer, rawName: string): Promise<VerifiedDocument> {
    const name = normaliserNomDocument(rawName);
    if (!name || name !== rawName) throw new InvalidDocumentError();
    const expectedContentType = typeDocumentPourNom(name);
    if (!expectedContentType) throw new InvalidDocumentError();
    validateUploadBytes(name, bytes);
    // Aucun objet n'est créé avant les contrôles de structure et l'antivirus.
    const security = await inspectDocument(name, async () => bytes);
    const size = bytes.length;
    const objectId = randomUUID();
    const { bucketName, objectName } = parseObjectPath(
      `${this.getPrivateObjectDir()}/documents/${objectId}`,
    );
    const destination = objectStorageClient.bucket(bucketName).file(objectName);
    let generation: string;
    try {
      await destination.save(bytes, {
        resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: {
          contentType: expectedContentType,
          metadata: { ...security, originalName: name, documentVerified: "false", securityStatus: "clean" },
        },
      });
      const [metadata] = await destination.getMetadata();
      generation = String(metadata.generation);
      if (Number(metadata.size) !== size || metadata.contentType !== expectedContentType) {
        throw new InvalidDocumentError();
      }
      const finalFile = objectStorageClient.bucket(bucketName).file(objectName, { generation });
      await finalFile.setMetadata({
        metadata: { ...security, documentVerified: "true", securityStatus: "clean", securityGeneration: generation, originalName: name },
      });
    } catch (error) {
      // Ne pas laisser de copie incomplète après un échec de stockage.
      await destination.delete({ ignoreNotFound: true });
      throw error;
    }
    return {
      objectPath: `/objects/documents/${objectId}`,
      name,
      contentType: expectedContentType,
      size,
      generation,
    };
  }

  async getVerifiedDocumentInfo(objectPath: string): Promise<VerifiedDocument | null> {
    if (!DOCUMENT_PATH_PATTERN.test(objectPath)) return null;
    let file: File;
    try {
      file = await this.getObjectEntityFile(objectPath);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return null;
      throw error;
    }

    const [metadata] = await file.getMetadata();
    const name = metadata.metadata?.originalName;
    const contentType = metadata.contentType;
    const size = Number(metadata.size);
    if (
      metadata.metadata?.documentVerified !== "true" ||
      typeof name !== "string" ||
      typeDocumentPourNom(name) !== contentType ||
      !Number.isSafeInteger(size) ||
      size < 1 ||
      size > DOCUMENT_MAX_SIZE_BYTES
    ) {
      return null;
    }
    const generation = String(metadata.generation);
    const flags = metadata.metadata ?? {};
    if (flags.securityStatus === "rejected") throw documentRejected();
    if (flags.securityStatus === "clean" && (
      flags.securityPolicy !== DOCUMENT_SECURITY_POLICY ||
      flags.securityGeneration !== generation ||
      typeof flags.securityHash !== "string" ||
      !/^[0-9a-f]{64}$/u.test(flags.securityHash)
    )) return null;
    return { objectPath, name, contentType, size, generation };
  }
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const pathParts = path.split("/");
  if (pathParts.length < 3 || !pathParts[1] || !pathParts.slice(2).join("/")) {
    throw new Error("Chemin de stockage invalide.");
  }
  return {
    bucketName: pathParts[1]!,
    objectName: pathParts.slice(2).join("/"),
  };
}

export function validateUploadBytes(name: string, bytes: Buffer): void {
  if (bytes.length < 1 || bytes.length > DOCUMENT_MAX_SIZE_BYTES || !signatureValide(name, bytes)) {
    throw new InvalidDocumentError();
  }
}