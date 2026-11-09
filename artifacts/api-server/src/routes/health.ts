import { Router, type IRouter } from "express";
import { AntivirusReadinessResponse, HealthCheckResponse } from "@workspace/api-zod";
import { getDocumentAntivirusReadiness } from "../lib/document-antivirus";
import { checkDatabaseReadiness } from "../lib/operations-monitor";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Liveness and readiness are separate: a temporary database outage must not
// make the process appear dead and trigger an unnecessary restart.
router.get("/readyz", async (_req, res): Promise<void> => {
  const database = await checkDatabaseReadiness();
  const ready = database.status === "ready";
  res.setHeader("Cache-Control", "no-store");
  if (!ready) res.setHeader("Retry-After", "10");
  res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "unavailable" });
});

router.get("/healthz/antivirus", async (_req, res): Promise<void> => {
  const { ready } = await getDocumentAntivirusReadiness();
  const readiness = AntivirusReadinessResponse.parse({ ready });
  res.setHeader("Cache-Control", "no-store");
  if (!readiness.ready) res.setHeader("Retry-After", "60");
  res.status(readiness.ready ? 200 : 503).json(readiness);
});

export default router;
