import type { conventionsTable, HistoriqueDocument } from "@workspace/db";
import { documentsConvention } from "./conventions-mapper";
import type { VerifiedDocument } from "./objectStorage";

type Ligne = typeof conventionsTable.$inferSelect;
type Ajout = { objectPath: string; type: HistoriqueDocument["type"] };
type Corps = { documentConvention?: string | null; pv?: string | null; documentsAjoutes?: Ajout[] };

/** Ajout seulement : aucun remplacement ni effacement de l'historique reçu du client. */
export async function preparerHistoriqueDocuments(
  current: Ligne | null,
  corps: Corps,
  verifier: (path: string) => Promise<VerifiedDocument | null>,
): Promise<HistoriqueDocument[] | null> {
  const documents = current ? documentsConvention(current) : [];
  const ajouts: Ajout[] = [...(corps.documentsAjoutes ?? [])];
  for (const [champ, type] of [["documentConvention", "convention"], ["pv", "pv"]] as const) {
    const objectPath = corps[champ];
    if (objectPath && objectPath !== current?.[champ]) ajouts.push({ objectPath, type });
  }
  for (const ajout of ajouts) {
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
    });
  }
  return documents;
}
