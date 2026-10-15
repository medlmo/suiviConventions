import { randomUUID } from "node:crypto";
import type { HistoriqueAvancementPhysique } from "@workspace/db";

export function natureAvecAvancement(nature: unknown): boolean {
  return typeof nature === "string" &&
    ["infrastructure", "prestation", "prestations"].includes(nature.trim().toLowerCase());
}

/** Validate raw input before generated date/number coercions. */
export function erreurAvancementPhysique(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "L'actualisation de l'avancement physique doit contenir une date et un taux estimé.";
  }
  const { dateConstat, taux, commentaire } = value as Record<string, unknown>;
  if (typeof dateConstat !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateConstat)) {
    return "La date du constat doit être au format AAAA-MM-JJ.";
  }
  const [annee, mois, jour] = dateConstat.split("-").map(Number);
  const date = new Date(Date.UTC(annee!, mois! - 1, jour!));
  if (date.getUTCFullYear() !== annee || date.getUTCMonth() !== mois! - 1 || date.getUTCDate() !== jour) {
    return "La date du constat doit être une date réelle du calendrier.";
  }
  if (typeof taux !== "number" || !Number.isFinite(taux) || taux < 0 || taux > 100 ||
      Number(taux.toFixed(2)) !== taux) {
    return "Le taux d'avancement physique estimé doit être compris entre 0 et 100 %, avec deux décimales maximum.";
  }
  if (commentaire !== undefined && commentaire !== null &&
      (typeof commentaire !== "string" || commentaire.length > 2000)) {
    return "Le commentaire du constat doit contenir au maximum 2 000 caractères.";
  }
  return null;
}

export function creerConstatAvancement(
  ajout: { dateConstat: string | Date; taux: number; commentaire?: string | null },
  auteur: string,
): HistoriqueAvancementPhysique {
  return {
    id: randomUUID(),
    dateConstat: ajout.dateConstat instanceof Date
      ? ajout.dateConstat.toISOString().slice(0, 10) : ajout.dateConstat,
    taux: ajout.taux,
    commentaire: ajout.commentaire?.trim() || null,
    enregistreLe: new Date().toISOString(),
    auteur,
  };
}
