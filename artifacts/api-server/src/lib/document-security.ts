import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateDocumentStructure } from "./document-structure";
import { requireDocumentAntivirus, scanDocumentAntivirus } from "./document-antivirus";
import { documentAnalysisBusy } from "./document-security-errors";

export const DOCUMENT_SECURITY_POLICY = "structure-antimalware-v1";
let busy = false;

/** Une seule analyse simultanée pour borner mémoire, CPU et nombre de processus. */
export async function inspectDocument(name: string, read: () => Promise<Buffer>) {
  if (busy) throw documentAnalysisBusy();
  busy = true;
  let dir: string | undefined;
  try {
    await requireDocumentAntivirus();
    const bytes = await read();
    dir = await mkdtemp(join(tmpdir(), "convention-document-"));
    const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
    const path = join(dir, "document" + extension);
    await writeFile(path, bytes, { mode: 0o600 });
    await validateDocumentStructure(path, extension, bytes);
    const antivirus = await scanDocumentAntivirus(path);
    return {
      securityPolicy: DOCUMENT_SECURITY_POLICY,
      securityHash: createHash("sha256").update(bytes).digest("hex"),
      securityScannedAt: new Date().toISOString(),
      securityEngine: antivirus.engine,
      securitySignatureDate: antivirus.signatureDate,
    };
  } finally {
    try { if (dir) await rm(dir, { recursive: true, force: true }); }
    finally { busy = false; }
  }
}
