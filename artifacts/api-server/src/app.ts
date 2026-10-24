import express, { type ErrorRequestHandler, type Express } from "express";
import router from "./routes";
import { csrfOriginGuard } from "./lib/auth";
import { DocumentSecurityError } from "./lib/document-security-errors";
import { httpLogging, recordRequestFailure } from "./lib/http-logging";

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

app.use(httpLogging);
app.use("/api", csrfOriginGuard);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// The default Express error handler prints Drizzle's query parameters, which
// can include password hashes. Log only safe metadata and send a generic reply.
const handleApiError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof DocumentSecurityError && !res.headersSent) {
    recordRequestFailure(res, error, {
      event: "document.security.blocked", operation: "document.security",
      status: error.status, errorCode: error.code,
    });
    res.status(error.status).json({ error: error.message, code: error.code, securityStatus: error.securityStatus });
    return;
  }
  const details = error !== null && typeof error === "object"
    ? error as { status?: unknown; statusCode?: unknown }
    : undefined;
  const status = [details?.status, details?.statusCode].find(
    (value): value is number =>
      typeof value === "number" && Number.isInteger(value) && value >= 400 && value <= 599,
  ) ?? 500;

  recordRequestFailure(res, error, {
    event: status >= 500 ? "api.request.failed" : "api.request.rejected",
    operation: "http.request", status,
    errorCode: status >= 500 ? "INTERNAL_ERROR" : "REQUEST_REJECTED",
  });
  if (res.headersSent) {
    // Close without Express logging a second stack or raw SQL parameters.
    res.destroy();
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
