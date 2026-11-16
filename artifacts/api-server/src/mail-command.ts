import { pool } from "@workspace/db";
import { creerTransportSmtp, codeErreurSmtp } from "./lib/smtp-mail";
import { envoyerRappelsComite } from "./lib/committee-mail-reminders";
import { logger } from "./lib/logger";

try {
  if (process.argv.includes("--verify")) {
    await creerTransportSmtp().verify();
    logger.info({ event: "smtp.verify.success", operation: "smtp.verify" }, "SMTP TLS and authentication verified; no email sent");
  } else if (process.argv.includes("--preview")) {
    const result = await envoyerRappelsComite({ dryRun: true });
    logger.info({ event: "mail.reminders.preview", operation: "mail.reminders.preview", ...result }, "Read-only reminder preview; no email sent and no delivery record written");
  } else {
    if (process.env.NODE_ENV !== "production") {
      logger.info({ event: "mail.reminders.skipped", operation: "mail.reminders", reason: "non_production" }, "Committee email reminders are disabled outside production");
    } else if (process.env.MAIL_ENABLED !== "true") {
      logger.info({ event: "mail.reminders.skipped", operation: "mail.reminders", reason: "mail_disabled" }, "Committee email reminders are not enabled");
    } else {
      const result = await envoyerRappelsComite();
      if (result.failed > 0) process.exitCode = 1;
    }
  }
} catch (error) {
  logger.error({ event: "smtp.command.failed", operation: "smtp.command", errorCode: codeErreurSmtp(error) }, "SMTP command failed; no sensitive details logged");
  process.exitCode = 1;
} finally {
  await pool.end();
}
