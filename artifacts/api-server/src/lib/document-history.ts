import type { conventionsTable, HistoriqueDocument } from "@workspace/db";
import { documentsConvention } from "./conventions-mapper";
import type { VerifiedDocument } from "./objectStorage";
import { normaliserDatePv } from "./pv-date";

type Ligne = typeof conventionsTable.$inferSelect;
type Ajout = {
  objectPath: string;
  type: HistoriqueDocument["type"];
  datePvComite?: string | Date | null;
};
type Corps = { documentConvention?: string | null; pv?: string | null; documentsAjoutes?: Ajout[]; documentsRetires?: string[] };

/** Les retraits explicites ne peuvent viser que les documents de cette fiche. */
export async function preparerHistoriqueDocuments(
  current: Ligne | null,
  corps: Corps,
  verifier: (path: string) => Promise<VerifiedDocument | null>,
): Promise<HistoriqueDocument[] | null> {
  const existants = current ? documentsConvention(current) : [];
  const retires = new Set(corps.documentsRetires ?? []);
  if ([...retires].some(path => !existants.some(document => document.objectPath === path))) return null;
  const documents = existants.filter(document => !retires.has(document.objectPath));
  const ajouts: Ajout[] = [...(corps.documentsAjoutes ?? [])];
  for (const [champ, type] of [["documentConvention", "convention"], ["pv", "pv"]] as const) {
    const objectPath = corps[champ];
    if (objectPath && objectPath !== current?.[champ]) ajouts.push({ objectPath, type });
  }
  for (const ajout of ajouts) {
    if (retires.has(ajout.objectPath)) return null;
    const datePvFournie = ajout.datePvComite != null && ajout.datePvComite !== "";
    const resultatDatePv = normaliserDatePv(ajout.datePvComite);
    if (!resultatDatePv.ok) return null;
    const datePvComite = resultatDatePv.date;
    if (ajout.type !== "pv" && datePvComite) return null;
    const existant = documents.find(document => document.objectPath === ajout.objectPath);
    if (existant) {
      if (existant.type !== ajout.type) return null;
      continue;
    }
    const document = await verifier(ajout.objectPath);
    if (!document) return null;
    documents.push({
      objectPath: document.objectPath,
      name: document.name,
      type: ajout.type,
      addedAt: new Date().toISOString(),
      ...(datePvComite ? { datePvComite } : {}),
    });
  }
  return documents;
}
