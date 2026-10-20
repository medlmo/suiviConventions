import type { conventionsTable, HistoriqueDocument } from "@workspace/db";

type LigneConvention = typeof conventionsTable.$inferSelect;

/** Les références anciennes restent consultables sans inventer une date d'ajout. */
export function documentsConvention(
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
  return documents;
}
