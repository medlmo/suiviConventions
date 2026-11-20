export class DocumentSecurityError extends Error {
  readonly code: "DOCUMENT_REJECTED" | "DOCUMENT_CHECK_UNAVAILABLE";
  readonly status: number;

  constructor(
    message: string,
    code: "DOCUMENT_REJECTED" | "DOCUMENT_CHECK_UNAVAILABLE",
    status = code === "DOCUMENT_REJECTED" ? 423 : 503,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "DocumentSecurityError";
  }
  get securityStatus(): "rejected" | null {
    return this.code === "DOCUMENT_REJECTED" ? "rejected" : null;
  }
}

export function documentRejected(): DocumentSecurityError {
  return new DocumentSecurityError(
    "Le fichier n’a pas passé les contrôles de structure autorisés.",
    "DOCUMENT_REJECTED",
  );
}
