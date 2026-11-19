import { Router, type IRouter } from "express";
import { GetAdminMailReminderLogResponse } from "@workspace/api-zod";
import { adminRequired } from "../lib/auth";
import { getAdminMailReminderLog } from "../lib/committee-mail-dashboard";
import { getDocumentAntivirusReadiness } from "../lib/document-antivirus";
import { valide } from "./conventions/commun";
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

router.get("/admin/operations/mail-reminders", adminRequired, async (_req, res): Promise<void> => {
  const log = await getAdminMailReminderLog();
  res.setHeader("Cache-Control", "no-store");
  res.json(valide(GetAdminMailReminderLogResponse, log));
});

export default router;
