import { pool } from "@workspace/db";
import { getMailConfiguration, createSmtpTransport, getSmtpErrorCode } from "./lib/smtp-mail";
import { sendCommitteeReminders } from "./lib/committee-mail-reminders";
import { logger } from "./lib/logger";

try {
  const testArgIndex = process.argv.indexOf("--send-test");
  if (testArgIndex >= 0) {
    const recipient = process.argv[testArgIndex + 1] === "--"
      ? process.argv[testArgIndex + 2]
      : process.argv[testArgIndex + 1];
    if (!recipient || recipient.length > 254 || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(recipient)) {
      throw new Error("TEST_RECIPIENT_INVALID");
    }
    const config = getMailConfiguration();
    const result = await createSmtpTransport().sendMail({
      from: { name: "Suivi des conventions — Région Souss Massa", address: config.from },
      to: recipient,
      subject: "Test e-mail — Suivi des conventions",
      text: "Ceci est un e-mail de test de la configuration SMTP. Aucun rappel réel ni aucune modification de convention n'est associé à ce message.",
      html: "<div lang=\"fr\" style=\"font-family:Arial,sans-serif;line-height:1.6;color:#122b49\"><h2>Test des notifications par e-mail</h2><p>La configuration SMTP a accepté cet e-mail de test.</p><p>Aucun rappel réel ni aucune modification de convention n'est associé à ce message.</p><p>Suivi des conventions — Région Souss Massa</p></div>",
      messageId: `<smtp-test-${Date.now()}@${config.messageDomain}>`,
    });
    if (!result.accepted?.length) throw new Error("SMTP_TEST_RECIPIENT_NOT_ACCEPTED");
    logger.info({ event: "smtp.test.accepted", operation: "smtp.test" }, "SMTP accepted one test email; no reminder or delivery record was created");
  } else if (process.argv.includes("--run-dev-test")) {
    if (process.env.NODE_ENV !== "development" || process.env.MAIL_DEV_ENABLED !== "true") {
      logger.info({ event: "mail.dev_test.skipped", operation: "mail.reminders", reason: "dev_test_disabled" }, "Development reminder test is not enabled");
    } else {
      const result = await sendCommitteeReminders();
      if (result.failed > 0) process.exitCode = 1;
    }
  } else if (process.argv.includes("--verify")) {
    await createSmtpTransport().verify();
    logger.info({ event: "smtp.verify.success", operation: "smtp.verify" }, "SMTP TLS and authentication verified; no email sent");
  } else if (process.argv.includes("--preview")) {
    const result = await sendCommitteeReminders({ dryRun: true });
    logger.info({ event: "mail.reminders.preview", operation: "mail.reminders.preview", ...result }, "Read-only reminder preview; no email sent and no delivery record written");
  } else {
    if (process.env.NODE_ENV !== "production") {
      logger.info({ event: "mail.reminders.skipped", operation: "mail.reminders", reason: "non_production" }, "Committee email reminders are disabled outside production");
    } else if (process.env.MAIL_ENABLED !== "true") {
      logger.info({ event: "mail.reminders.skipped", operation: "mail.reminders", reason: "mail_disabled" }, "Committee email reminders are not enabled");
    } else {
      const result = await sendCommitteeReminders();
      if (result.failed > 0) process.exitCode = 1;
    }
  }
} catch (error) {
  logger.error({ event: "smtp.command.failed", operation: "smtp.command", errorCode: getSmtpErrorCode(error) }, "SMTP command failed; no sensitive details logged");
  process.exitCode = 1;
} finally {
  await pool.end();
}
