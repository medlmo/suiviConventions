import { Router, type IRouter } from "express";
import { GetAdminMailReminderLogResponse } from "@workspace/api-zod";
import { adminRequired } from "../lib/auth";
import { getAdminMailReminderLog } from "../lib/committee-mail-dashboard";
import { valide } from "./conventions/commun";
import { checkDatabaseReadiness, getOperationsSnapshot } from "../lib/operations-monitor";

const router: IRouter = Router();

router.get("/admin/operations", adminRequired, async (_req, res): Promise<void> => {
  await checkDatabaseReadiness();
  res.setHeader("Cache-Control", "no-store");
  res.json(getOperationsSnapshot());
});

router.get("/admin/operations/mail-reminders", adminRequired, async (_req, res): Promise<void> => {
  const log = await getAdminMailReminderLog();
  res.setHeader("Cache-Control", "no-store");
  res.json(valide(GetAdminMailReminderLogResponse, log));
});

export default router;
