import type { Request, Response } from "express";
import pinoHttp, { startTime } from "pino-http";
import { logger } from "./logger";
import { safeErrorFields } from "./error-logging";

type RequestEvent =
  | "api.request.failed" | "api.request.rejected" | "document.security.blocked"
  | "convention.create.rejected" | "convention.update.rejected"
  | "document.generate.failed" | "document.download.failed"
  | "document.upload.prepare.failed" | "document.upload.complete.failed";
type Operation =
  | "http.request" | "document.security" | "convention.create"
  | "convention.update" | "document.generate" | "document.download"
  | "document.upload.prepare" | "document.upload.complete";
type ErrorCode =
  | "INTERNAL_ERROR" | "REQUEST_REJECTED" | "SCHEMA_VALIDATION_FAILED"
  | "DOCUMENT_REJECTED" | "ANALYSIS_UNAVAILABLE" | "ANALYSIS_BUSY";

interface RequestOutcome {
  event: RequestEvent;
  operation: Operation;
  status: number;
  errorCode: ErrorCode;
  errorType?: string;
  databaseCode?: string;
  systemCode?: string;
}

// Keep diagnostic metadata off business responses. Emit it once, at finish/close.
const outcomes = new WeakMap<Response, RequestOutcome>();

export function recordRequestFailure(
  res: Response,
  error: unknown,
  context: Pick<RequestOutcome, "event" | "operation" | "status" | "errorCode">,
): void {
  // A more specific route-level context must survive the global handler.
  if (!outcomes.has(res)) {
    outcomes.set(res, { ...(error === undefined ? {} : safeErrorFields(error)), ...context });
  }
}

function isHealthCheck(req: Request): boolean {
  return req.method === "GET" && ["/api/healthz", "/api/healthz/antivirus"].includes(
    (req.originalUrl ?? "").split("?")[0],
  );
}

function statusFor(res: Response): number {
  return outcomes.get(res)?.status ?? res.statusCode;
}

function routeFor(req: Request): string {
  // Only the declared route template; never raw identifiers, document paths or query parameters.
  return typeof req.route?.path === "string" ? req.route.path : "unmatched";
}

function completionFields(req: Request, res: Response, durationMs: number, error?: Error) {
  const context = outcomes.get(res);
  const { status: failureStatus, ...diagnostics } = context ?? {};
  const status = statusFor(res);
  const interrupted = !res.writableFinished;
  return {
    event: context?.event ?? (interrupted ? "http.request.interrupted"
      : status >= 500 ? "http.request.failed"
      : status >= 400 ? "http.request.rejected" : "http.request.completed"),
    operation: context?.operation ?? "http.request",
    requestId: req.id,
    method: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(req.method)
      ? req.method : "OTHER",
    route: routeFor(req),
    status: res.statusCode,
    ...(failureStatus !== undefined && failureStatus !== res.statusCode ? { failureStatus } : {}),
    durationMs,
    slow: durationMs >= 2000,
    interrupted,
    ...(context ? diagnostics : error ? safeErrorFields(error) : {}),
    ...(!context && status >= 400
      ? { errorCode: status >= 500 ? "INTERNAL_ERROR" : "REQUEST_REJECTED" } : {}),
  };
}

export const httpLogging = pinoHttp<Request, Response>({
  logger,
  // No raw request/response objects or automatic Error stack/message in completion logs.
  quietReqLogger: true,
  quietResLogger: true,
  customLogLevel(req, res, error) {
    const status = statusFor(res);
    // Suppress only successful probes; failed probes remain visible.
    if (isHealthCheck(req) && status < 400 && res.writableFinished && !error) return "silent";
    if (status >= 500) return "error";
    if (error || !res.writableFinished || status === 429 || status === 423) return "warn";
    if (Date.now() - res[startTime] >= 2000) return "warn";
    // Expected validation/auth/not-found refusals are not server incidents.
    return "info";
  },
  customSuccessObject(req, res, value) {
    return completionFields(req, res, value.responseTime);
  },
  customErrorObject(req, res, error, value) {
    return completionFields(req, res, value.responseTime, error);
  },
  customSuccessMessage: () => "HTTP request completed",
  customErrorMessage: () => "HTTP request failed",
  serializers: {
    req: req => ({ id: req.id, method: req.method }),
    res: res => ({ statusCode: res.statusCode }),
    err: safeErrorFields,
  },
});
