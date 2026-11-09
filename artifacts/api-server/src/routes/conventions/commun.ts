import { conventionsTable } from "@workspace/db";
import { ObjectStorageService, type VerifiedDocument } from "../../lib/objectStorage";

export const objectStorageService = new ObjectStorageService();

export async function documentVerifie(path: string): Promise<VerifiedDocument | null> {
  return objectStorageService.getVerifiedDocumentInfo(path);
}

/**
 * En développement et en test, vérifie une réponse contre le contrat puis
 * renvoie toujours l'objet d'origine. Le contrôle est désactivé en production
 * pour éviter son coût de parsing sur chaque réponse.
 *
 * Les schémas générés coercent les `format: date` en objets Date ; renvoyer le
 * résultat de `.parse()` transformerait « 2026-07-27 » en horodatage UTC
 * complet, avec un risque de décalage d'un jour côté client. La validation ne
 * doit donc jamais réécrire la charge utile.
 */
export function valide<T>(schema: { parse: (valeur: unknown) => unknown }, donnees: T): T {
  if (process.env.NODE_ENV !== "production") {
    schema.parse(donnees);
  }
  return donnees;
}

export function snapshot(row: typeof conventionsTable.$inferSelect): Record<string, unknown> {
  return { ...row };
}
