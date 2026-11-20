import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateDocumentStructure } from "./document-structure";

export const DOCUMENT_SECURITY_POLICY = "structure-only-v1";
let validationTail = Promise.resolve();

/** Sérialise les contrôles de structure, sans déclencher d'analyse antivirus. */
export async function inspectDocument(name: string, read: () => Promise<Buffer>) {
  let release!: () => void;
  const previous = validationTail;
  validationTail = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try {
    const bytes = await read();
    const dir = await mkdtemp(join(tmpdir(), "convention-document-"));
    const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
    const path = join(dir, "document" + extension);
    try {
      await writeFile(path, bytes, { mode: 0o600 });
      await validateDocumentStructure(path, extension, bytes);
      return {
        securityPolicy: DOCUMENT_SECURITY_POLICY,
        securityHash: createHash("sha256").update(bytes).digest("hex"),
        securityCheckedAt: new Date().toISOString(),
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  } finally {
    release();
  }
}
