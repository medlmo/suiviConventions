/** Drizzle wraps PostgreSQL errors and keeps the SQLSTATE on their cause. */
export function postgresErrorCode(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 4; depth++) {
    if (!current || typeof current !== "object") return undefined;
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === "string") return code;
    current = cause;
  }
  return undefined;
}
