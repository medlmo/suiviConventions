import { execFile } from "node:child_process";
import { DocumentSecurityError } from "./document-security-errors.ts";

/** Aucun shell, sortie bornée, délai et arrêt forcé ; ne jamais journaliser la sortie des fichiers. */
export function runDocumentTool(command: string, args: string[], timeout = 20_000, maxBuffer = 512 * 1024):
Promise<{ code: number; stdout: Buffer; stderr: Buffer }> {
  return new Promise((resolve, reject) => {
    execFile("prlimit", ["--as=" + 256 * 1024 * 1024, "--cpu=" + Math.ceil(timeout / 1000 + 2), "--", command, ...args],
      { timeout, killSignal: "SIGKILL", maxBuffer, encoding: "buffer" },
      (error, stdout, stderr) => {
        if (!error) return resolve({ code: 0, stdout, stderr });
        if (typeof error.code === "number" && !error.killed) {
          return resolve({ code: error.code, stdout, stderr });
        }
        reject(new DocumentSecurityError(
          "Le contrôle de structure est temporairement indisponible. Réessayez ultérieurement.",
          "DOCUMENT_CHECK_UNAVAILABLE",
        ));
      });
  });
}
