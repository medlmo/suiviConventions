import nodemailer from "nodemailer";

export function creerTransportSmtp() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || port !== 465 || !user || !pass) {
    throw new Error("SMTP_CONFIGURATION_MISSING_OR_INVALID");
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: true,
    auth: { user, pass },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 60_000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  });
}

/** Do not log SMTP messages: they can contain credentials or recipient addresses. */
export function codeErreurSmtp(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
  return typeof code === "string" &&
    ["EAUTH", "ECONNECTION", "ECONNREFUSED", "ETIMEDOUT", "ESOCKET", "ETLS", "EENVELOPE", "EMESSAGE", "EDNS"].includes(code)
    ? code : "SMTP_FAILED";
}

export function configurationMail() {
  const from = process.env.MAIL_FROM;
  const publicUrl = process.env.APP_PUBLIC_URL;
  if (!from || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from) || !publicUrl) {
    throw new Error("MAIL_CONFIGURATION_MISSING_OR_INVALID");
  }
  const url = new URL(publicUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("MAIL_PUBLIC_URL_INVALID");
  }
  return { from, publicUrl: url.href.replace(/\/$/, ""), messageDomain: from.split("@")[1]! };
}
