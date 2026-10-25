import { Router, type IRouter } from "express";
import { AntivirusReadinessResponse, HealthCheckResponse } from "@workspace/api-zod";
import { getDocumentAntivirusReadiness } from "../lib/document-antivirus";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/healthz/antivirus", async (_req, res): Promise<void> => {
  const { ready } = await getDocumentAntivirusReadiness();
  const readiness = AntivirusReadinessResponse.parse({ ready });
  res.setHeader("Cache-Control", "no-store");
  if (!readiness.ready) res.setHeader("Retry-After", "60");
  res.status(readiness.ready ? 200 : 503).json(readiness);
});

export default router;
