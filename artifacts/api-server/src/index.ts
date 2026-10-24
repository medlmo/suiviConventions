import app from "./app";
import { logger } from "./lib/logger";
import { bootstrapAdmin, nettoyerSessionsExpirees } from "./lib/auth";
import { prepareDocumentAntivirus } from "./lib/document-antivirus";
import { safeErrorFields } from "./lib/error-logging";

const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

function fatalStartup(error: unknown, event: string, operation: string): void {
  logger.fatal({ event, operation, errorCode: "STARTUP_FAILED", ...safeErrorFields(error) }, "Server cannot start");
  logger.flush(() => process.exit(1));
}

async function start(): Promise<void> {
  const port = Number(process.env["PORT"]);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new RangeError("A valid PORT is required.");
  }
  await bootstrapAdmin();
  app.listen(port, (err) => {
    if (err) {
      fatalStartup(err, "server.listen.failed", "server.listen");
      return;
    }

    logger.info({ event: "server.started", operation: "server.listen", port }, "Server listening");
    void prepareDocumentAntivirus();
    const antivirusTimer = setInterval(() => void prepareDocumentAntivirus(), 12 * 60 * 60 * 1000);
    antivirusTimer.unref();

    const nettoyer = async (): Promise<void> => {
      try {
        const count = await nettoyerSessionsExpirees();
        if (count > 0) {
          logger.info({ event: "sessions.cleanup.completed", operation: "sessions.cleanup", count }, "Expired sessions cleaned");
        }
      } catch (cleanupError) {
        logger.error({
          event: "sessions.cleanup.failed", operation: "sessions.cleanup",
          errorCode: "SESSION_CLEANUP_FAILED", ...safeErrorFields(cleanupError),
        }, "Failed to clean expired sessions");
      }
    };

    void nettoyer();
    const cleanupTimer = setInterval(() => void nettoyer(), SESSION_CLEANUP_INTERVAL_MS);
    cleanupTimer.unref();
  });
}

start().catch((err: unknown) => {
  fatalStartup(err, "server.initialization.failed", "server.initialize");
});
