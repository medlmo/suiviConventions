import type { conventionsTable, HistoriqueDocument } from "@workspace/db";

type LigneConvention = typeof conventionsTable.$inferSelect;

/** Attribue un numéro stable aux anciens avenants qui n'en avaient pas encore. */
export function assignAmendmentNumbers(documents: HistoriqueDocument[]): HistoriqueDocument[] {
  let nextNumber = documents.reduce((maximum, document) =>
    document.type === "avenant" &&
    Number.isSafeInteger(document.numeroAvenant) &&
    (document.numeroAvenant ?? 0) > maximum
       ? document.numeroAvenant!
       : maximum, 0) + 1;

  return documents.map(document => {
    if (document.type !== "avenant") return document;
    if (Number.isSafeInteger(document.numeroAvenant) && (document.numeroAvenant ?? 0) > 0) return document;
    return { ...document, numeroAvenant: nextNumber++ };
  });
}

/** Les références anciennes restent consultables sans inventer une date d'ajout. */
export function getConventionDocuments(
  ligne: Pick<LigneConvention, "documents" | "pv" | "documentConvention" | "datePvComite">,
): HistoriqueDocument[] {
  const documents = [...(ligne.documents ?? [])];
  for (const [champ, type, name] of [
    ["documentConvention", "convention", "Convention enregistrée précédemment"],
    ["pv", "pv", "PV enregistré précédemment"],
  ] as const) {
    const objectPath = ligne[champ];
    if (objectPath) {
      const existing = documents.find(document => document.objectPath === objectPath);
      const datePvComite = champ === "pv" ? ligne.datePvComite : null;
      if (existing) {
        if (type === "pv" && !existing.datePvComite && datePvComite) {
          existing.datePvComite = datePvComite;
        }
      } else {
        documents.push({
          objectPath,
          type,
          name,
          addedAt: null,
          ...(datePvComite ? { datePvComite } : {}),
        });
      }
    }
  }
  return assignAmendmentNumbers(documents);
}
