import { randomUUID } from "node:crypto";
import type { VerifiedDocument } from "./objectStorage";

// Les données provisoires ne vont jamais dans App Storage. Au plus huit
// fichiers de 10 Mio sont retenus, avec deux réservations par utilisateur.
export const UPLOAD_TTL_MS = 10 * 60 * 1000;
export interface StagedUpload {
  ownerId: number;
  name: string;
  size: number;
  contentType: string;
  expiresAt: number;
  state: "waiting" | "receiving" | "ready" | "finalizing" | "completed";
  bytes?: Buffer;
  document?: VerifiedDocument;
}
const uploads = new Map<string, StagedUpload>();

function prune(): void {
  for (const [path, upload] of uploads) {
    if (upload.expiresAt <= Date.now() &&
      upload.state !== "receiving" && upload.state !== "finalizing") uploads.delete(path);
  }
}
setInterval(prune, 30_000).unref();

export function reserveUpload(input: Pick<StagedUpload, "ownerId" | "name" | "size" | "contentType">) {
  prune();
  const active = [...uploads.values()].filter(upload => upload.state !== "completed");
  if (active.length >= 8 || active.filter(upload => upload.ownerId === input.ownerId).length >= 2) return null;
  // Conserver un résultat pour les reprises après perte de réponse, sans
  // permettre à ce cache de croître indéfiniment.
  if (uploads.size >= 128) {
    for (const [path, upload] of uploads) {
      if (upload.state === "completed") { uploads.delete(path); break; }
    }
  }
  const token = randomUUID();
  const objectPath = `/objects/uploads/${token}`;
  uploads.set(objectPath, { ...input, expiresAt: Date.now() + UPLOAD_TTL_MS, state: "waiting" });
  return { uploadURL: `/api/storage/uploads/${token}`, objectPath };
}

export function getStagedUpload(objectPath: string, ownerId: number): StagedUpload | undefined {
  const upload = uploads.get(objectPath);
  if (!upload || upload.ownerId !== ownerId || upload.expiresAt <= Date.now()) return undefined;
  return upload;
}

export function discardUpload(objectPath: string): void {
  uploads.delete(objectPath);
}
