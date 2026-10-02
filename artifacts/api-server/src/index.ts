import app from "./app";
import { logger } from "./lib/logger";
import { bootstrapAdmin, nettoyerSessionsExpirees } from "./lib/auth";

const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function start(): Promise<void> {
  await bootstrapAdmin();
  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");

    const nettoyer = async (): Promise<void> => {
      try {
        const count = await nettoyerSessionsExpirees();
        if (count > 0) {
          logger.info({ count }, "Expired sessions cleaned");
        }
      } catch (cleanupError) {
        logger.error({ err: cleanupError }, "Failed to clean expired sessions");
      }
    };

    void nettoyer();
    const cleanupTimer = setInterval(() => void nettoyer(), SESSION_CLEANUP_INTERVAL_MS);
    cleanupTimer.unref();
  });
}

start().catch((err: unknown) => {
  logger.error({ err }, "Server initialization failed");
  process.exit(1);
});
