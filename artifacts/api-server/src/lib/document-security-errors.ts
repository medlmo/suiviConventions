export class DocumentSecurityError extends Error {
  readonly code: "DOCUMENT_REJECTED" | "ANALYSIS_UNAVAILABLE" | "ANALYSIS_BUSY";
  readonly status: number;

  constructor(
    message: string,
    code: "DOCUMENT_REJECTED" | "ANALYSIS_UNAVAILABLE" | "ANALYSIS_BUSY",
    status = code === "DOCUMENT_REJECTED" ? 423 : 503,
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "DocumentSecurityError";
  }
  get securityStatus(): "rejected" | "quarantined" {
    return this.code === "DOCUMENT_REJECTED" ? "rejected" : "quarantined";
  }
}

export function documentAnalysisBusy(): DocumentSecurityError {
  return new DocumentSecurityError(
    "Document en quarantaine : une autre analyse est en cours. Réessayez dans quelques instants.",
    "ANALYSIS_BUSY",
  );
}

export function documentRejected(): DocumentSecurityError {
  return new DocumentSecurityError(
    "Document refusé : structure invalide, contenu dangereux, macros ou protection empêchant son analyse. Le fichier n'est pas disponible.",
    "DOCUMENT_REJECTED",
  );
}
