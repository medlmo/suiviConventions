import pino from "pino";
import { safeErrorFields } from "./error-logging";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  base: { service: "conventions-api" },
  timestamp: pino.stdTimeFunctions.isoTime,
  level: process.env.LOG_LEVEL ?? "info",
  serializers: { err: safeErrorFields, error: safeErrorFields },
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
