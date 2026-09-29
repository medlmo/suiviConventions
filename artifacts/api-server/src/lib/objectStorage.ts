import { randomUUID } from "node:crypto";
import { File, Storage } from "@google-cloud/storage";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const DOCUMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const OBJECT_PATH_PATTERN = /^\/objects\/(?:uploads|documents)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPLOAD_PATH_PATTERN = /^\/objects\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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

async function lirePrefixe(fichier: File): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const morceaux: Buffer[] = [];
    const flux = fichier.createReadStream({ start: 0, end: 7 });
    flux.on("data", (morceau: Buffer | string) => {
      morceaux.push(Buffer.isBuffer(morceau) ? morceau : Buffer.from(morceau));
    });
    flux.on("end", () => resolve(Buffer.concat(morceaux)));
    flux.on("error", reject);
  });
}

export class ObjectStorageService {
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) throw new Error("PRIVATE_OBJECT_DIR n'est pas configuré.");
    return dir;
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const fullPath = `${this.getPrivateObjectDir()}/uploads/${randomUUID()}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    return signObjectURL({ bucketName, objectName, method: "PUT", ttlSec: 900 });
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) return rawPath;
    const rawObjectPath = new URL(rawPath).pathname;
    let privateDir = this.getPrivateObjectDir();
    if (!privateDir.endsWith("/")) privateDir = `${privateDir}/`;
    if (!rawObjectPath.startsWith(privateDir)) return rawObjectPath;
    return `/objects/${rawObjectPath.slice(privateDir.length)}`;
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!OBJECT_PATH_PATTERN.test(objectPath)) throw new ObjectNotFoundError();
    const relativePath = objectPath.slice("/objects/".length);
    let privateDir = this.getPrivateObjectDir();
    if (!privateDir.endsWith("/")) privateDir = `${privateDir}/`;
    const { bucketName, objectName } = parseObjectPath(`${privateDir}${relativePath}`);
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }

  async finalizeUploadedDocument(uploadPath: string, rawName: string): Promise<VerifiedDocument> {
    if (!UPLOAD_PATH_PATTERN.test(uploadPath)) throw new InvalidDocumentError();
    const name = normaliserNomDocument(rawName);
    if (!name || name !== rawName) throw new InvalidDocumentError();
    const expectedContentType = typeDocumentPourNom(name);
    if (!expectedContentType) throw new InvalidDocumentError();

    const source = await this.getObjectEntityFile(uploadPath);
    let finalFile: File | undefined;

    try {
      const [sourceMetadata] = await source.getMetadata();
      const size = Number(sourceMetadata.size);
      if (
        !Number.isSafeInteger(size) ||
        size < 1 ||
        size > DOCUMENT_MAX_SIZE_BYTES ||
        sourceMetadata.contentType !== expectedContentType ||
        !signatureValide(name, await lirePrefixe(source))
      ) {
        throw new InvalidDocumentError();
      }

      const objectId = randomUUID();
      const { bucketName, objectName } = parseObjectPath(
        `${this.getPrivateObjectDir()}/documents/${objectId}`,
      );
      finalFile = objectStorageClient.bucket(bucketName).file(objectName);
      await source.copy(finalFile);

      const [copiedMetadata] = await finalFile.getMetadata();
      const copiedSize = Number(copiedMetadata.size);
      if (
        copiedSize !== size ||
        copiedMetadata.contentType !== expectedContentType ||
        !signatureValide(name, await lirePrefixe(finalFile))
      ) {
        throw new InvalidDocumentError();
      }

      await finalFile.setMetadata({
        contentType: expectedContentType,
        metadata: {
          documentVerified: "true",
          originalName: name,
        },
      });

      await source.delete().catch(() => undefined);
      return {
        objectPath: `/objects/documents/${objectId}`,
        name,
        contentType: expectedContentType,
        size,
      };
    } catch (error) {
      if (finalFile) await finalFile.delete().catch(() => undefined);
      await source.delete().catch(() => undefined);
      throw error;
    }
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
    return { objectPath, name, contentType, size };
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

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Échec de création de l'URL de téléversement (${response.status}).`);
  }
  const payload = await response.json() as { signed_url?: unknown };
  if (typeof payload.signed_url !== "string") {
    throw new Error("Le service de stockage n'a pas retourné d'URL valide.");
  }
  return payload.signed_url;
}