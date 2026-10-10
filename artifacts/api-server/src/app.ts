import express, { type ErrorRequestHandler, type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { csrfOriginGuard } from "./lib/auth";
import { postgresErrorCode } from "./lib/database-errors";

const app: Express = express();
app.set("trust proxy", 1);

// Les réponses dépendent de la date du jour (le niveau d'alerte est recalculé
// à chaque requête) : elles ne doivent jamais être servies depuis le cache du
// navigateur. L'ETag d'Express permettait en plus des réponses 304, que le
// client HTTP traite comme un échec puisque `response.ok` y est faux.
app.set("etag", false);
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use("/api", csrfOriginGuard);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// The default Express error handler prints Drizzle's query parameters, which
// can include password hashes. Log only safe metadata and send a generic reply.
const handleApiError: ErrorRequestHandler = (error: unknown, req, res, next) => {
  const details = error !== null && typeof error === "object"
    ? error as { status?: unknown; statusCode?: unknown }
    : undefined;
  const status = [details?.status, details?.statusCode].find(
    (value): value is number =>
      typeof value === "number" && Number.isInteger(value) && value >= 400 && value <= 599,
  ) ?? 500;

  req.log.error(
    { status, errorType: error instanceof Error ? error.name : typeof error, databaseCode: postgresErrorCode(error) },
    "API request failed",
  );
  if (res.headersSent) {
    // Let Express close the response, without logging raw SQL parameters.
    next(Object.assign(new Error("Erreur lors du traitement de la réponse."), { status }));
    return;
  }
  res.status(status).json({
    error: status >= 500
      ? "Une erreur serveur est survenue. Veuillez réessayer."
      : "La requête n’a pas pu être traitée.",
  });
};
app.use(handleApiError);

export default app;
