import { execFile } from "node:child_process";
import { DocumentSecurityError } from "./document-security-errors";

/** Aucun shell, sortie bornée, délai et arrêt forcé ; ne jamais journaliser la sortie des fichiers. */
export function runDocumentTool(command: string, args: string[], timeout = 20_000, maxBuffer = 512 * 1024):
Promise<{ code: number; stdout: Buffer }> {
  return new Promise((resolve, reject) => {
    const memoryLimit = ["clamscan", "freshclam"].includes(command) ? 1536 * 1024 * 1024 : 256 * 1024 * 1024;
    execFile("prlimit", ["--as=" + memoryLimit, "--cpu=" + Math.ceil(timeout / 1000 + 2), "--", command, ...args],
      { timeout, killSignal: "SIGKILL", maxBuffer, encoding: "buffer" },
      (error, stdout) => {
        if (!error) return resolve({ code: 0, stdout });
        if (typeof error.code === "number" && !error.killed) {
          return resolve({ code: error.code, stdout });
        }
        reject(new DocumentSecurityError(
          "Document en quarantaine : un outil de contrôle est indisponible ou a dépassé ses limites. Réessayez ultérieurement.",
          "ANALYSIS_UNAVAILABLE",
        ));
      });
  });
}
