import { Router, type IRouter } from "express";
import { adminRequired } from "../lib/auth";
import { getDocumentAntivirusReadiness } from "../lib/document-antivirus";
import {
  checkDatabaseReadiness,
  getOperationsSnapshot,
  recordAntivirusReadiness,
} from "../lib/operations-monitor";

const router: IRouter = Router();

router.get("/admin/operations", adminRequired, async (_req, res): Promise<void> => {
  const antivirusProbe = (async () => {
    const started = performance.now();
    const result = await getDocumentAntivirusReadiness().catch(() => ({ ready: false }));
    return { result, latencyMs: Math.round(performance.now() - started) };
  })();
  const [, antivirus] = await Promise.all([
    checkDatabaseReadiness(),
    antivirusProbe,
  ]);
  const antivirusLatencyMs = antivirus.latencyMs;
  // Expose only a readiness boolean and timing, never local paths or scanner details.
  const antivirusStatus = {
    status: antivirus.result.ready ? "ready" as const : "unavailable" as const,
    checkedAt: new Date().toISOString(),
    latencyMs: antivirusLatencyMs,
  };
  recordAntivirusReadiness(antivirus.result.ready, antivirusLatencyMs);
  res.setHeader("Cache-Control", "no-store");
  res.json(getOperationsSnapshot(antivirusStatus));
});

export default router;
