import type { conventionsTable, HistoriqueDocument } from "@workspace/db";
import { assignAmendmentNumbers, getConventionDocuments } from "./document-history-mapper";
import type { VerifiedDocument } from "./objectStorage";
import { normalizeCommitteeMinutesDate } from "./pv-date";

type Ligne = typeof conventionsTable.$inferSelect;
type Ajout = {
  objectPath: string;
  type: HistoriqueDocument["type"];
  datePvComite?: string | Date | null;
};
type Corps = { documentConvention?: string | null; pv?: string | null; documentsAjoutes?: Ajout[]; documentsRetires?: string[] };

/** Les retraits explicites ne peuvent viser que les documents de cette fiche. */
export async function prepareDocumentHistory(
  current: Ligne | null,
  corps: Corps,
  verifyDocument: (path: string) => Promise<VerifiedDocument | null>,
): Promise<HistoriqueDocument[] | null> {
  const existingDocuments = current ? getConventionDocuments(current) : [];
  const removedPaths = new Set(corps.documentsRetires ?? []);
  if ([...removedPaths].some(path => !existingDocuments.some(document => document.objectPath === path))) return null;
  const documents = existingDocuments.filter(document => !removedPaths.has(document.objectPath));
  const additions: Ajout[] = [...(corps.documentsAjoutes ?? [])];
  for (const [champ, type] of [["documentConvention", "convention"], ["pv", "pv"]] as const) {
    const objectPath = corps[champ];
    if (objectPath && objectPath !== current?.[champ]) additions.push({ objectPath, type });
  }
  for (const addition of additions) {
    if (removedPaths.has(addition.objectPath)) return null;
    const minutesDateResult = normalizeCommitteeMinutesDate(addition.datePvComite);
    if (!minutesDateResult.ok) return null;
    const committeeMinutesDate = minutesDateResult.date;
    if (addition.type !== "pv" && committeeMinutesDate) return null;
    const existingDocument = documents.find(document => document.objectPath === addition.objectPath);
    if (existingDocument) {
      if (existingDocument.type !== addition.type) return null;
      continue;
    }
    const document = await verifyDocument(addition.objectPath);
    if (!document) return null;
    documents.push({
      objectPath: document.objectPath,
      name: document.name,
      type: addition.type,
      addedAt: new Date().toISOString(),
      ...(committeeMinutesDate ? { datePvComite: committeeMinutesDate } : {}),
    });
  }
  return assignAmendmentNumbers(documents);
}
