import { postgresErrorCode } from "./database-errors";

const ERROR_TYPES = new Set([
  "Error", "TypeError", "RangeError", "SyntaxError", "ReferenceError",
  "URIError", "AggregateError", "ZodError", "DocumentSecurityError",
  "ObjectNotFoundError", "InvalidDocumentError", "AbortError",
]);
const SYSTEM_CODES = new Set([
  "ENOENT", "EACCES", "EPERM", "ENOSPC", "EMFILE", "EADDRINUSE",
  "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE", "ENOTFOUND",
  "EAI_AGAIN", "ERR_STREAM_PREMATURE_CLOSE", "ERR_HTTP_HEADERS_SENT",
]);

/** Allowlist only: messages, stacks, causes, SQL, paths and tool output may contain secrets. */
export function safeErrorFields(error: unknown): {
  errorType: string;
  databaseCode?: string;
  systemCode?: string;
} {
  const name = error instanceof Error ? error.name : undefined;
  const fields: ReturnType<typeof safeErrorFields> = {
    errorType: name && ERROR_TYPES.has(name) ? name : error instanceof Error ? "Error" : "UnknownError",
  };
  const databaseCode = postgresErrorCode(error);
  if (databaseCode && /^[0-9A-Z]{5}$/.test(databaseCode) && !SYSTEM_CODES.has(databaseCode)) {
    fields.databaseCode = databaseCode;
  }
  let current = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === "string" && SYSTEM_CODES.has(code)) {
      fields.systemCode = code;
      break;
    }
    current = cause;
  }
  return fields;
}
