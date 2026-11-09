import ExcelJS from "exceljs";
import type { Writable } from "node:stream";
import { finished } from "node:stream/promises";
import { setImmediate } from "node:timers/promises";
import type { versApi } from "./conventions-mapper";

export const EXPORT_MAX_ROWS = 5_000;
const EXPORT_MAX_TEXT_BYTES = 32 * 1024 * 1024;
type ConventionExport = ReturnType<typeof versApi>;
type ColonneExport = {
  titre: string;
  extraire: (convention: ConventionExport) => unknown;
  largeurMin: number;
  largeurMax: number;
  format?: string;
  date?: boolean;
};

export class ExportExcelError extends Error {
  readonly status: number;
  constructor(message: string, status = 413) {
    super(message);
    this.name = "ExportExcelError";
    this.status = status;
  }
}

const colonnes: ColonneExport[] = [
  { titre: "Convention visée", extraire: c => c.nomConvention, largeurMin: 28, largeurMax: 55 },
  { titre: "Objet de la convention (français)", extraire: c => c.objetConventionFr, largeurMin: 32, largeurMax: 60 },
  { titre: "Rattachement", extraire: c => c.rattachement, largeurMin: 18, largeurMax: 38 },
  { titre: "Responsable du projet", extraire: c => c.responsableProjet, largeurMin: 20, largeurMax: 36 },
  { titre: "Statut de la convention", extraire: c => c.statutConvention, largeurMin: 18, largeurMax: 30 },
  { titre: "Type de la session", extraire: c => c.typeSession, largeurMin: 16, largeurMax: 28 },
  { titre: "Session", extraire: c => c.session, largeurMin: 12, largeurMax: 24 },
  { titre: "Date de visa", extraire: c => c.dateVisa, largeurMin: 12, largeurMax: 14, date: true, format: "dd/mm/yyyy" },
  { titre: "Décision", extraire: c => c.decision, largeurMin: 18, largeurMax: 40 },
  { titre: "Compétence", extraire: c => c.competence, largeurMin: 18, largeurMax: 32 },
  { titre: "Nature du projet", extraire: c => c.nature, largeurMin: 18, largeurMax: 32 },
  { titre: "Enveloppe budgétaire (MAD)", extraire: c => c.enveloppeBudgetaire, largeurMin: 20, largeurMax: 24, format: '#,##0.00 "MAD"' },
  { titre: "Contribution de la Région (MAD)", extraire: c => c.contributionRegion, largeurMin: 22, largeurMax: 26, format: '#,##0.00 "MAD"' },
  { titre: "Nature des fonds", extraire: c => c.natureFonds, largeurMin: 18, largeurMax: 30 },
  { titre: "Porteur de projet", extraire: c => c.porteurProjet, largeurMin: 20, largeurMax: 36 },
  { titre: "Maîtrise d'ouvrage", extraire: c => c.maitriseOuvrage.join("; "), largeurMin: 24, largeurMax: 48 },
  { titre: "Maîtrise d'ouvrage déléguée", extraire: c => c.maitriseOuvrageDeleguee.join("; "), largeurMin: 28, largeurMax: 48 },
  { titre: "Partenaires", extraire: c => c.partenaires.join("; "), largeurMin: 24, largeurMax: 48 },
  { titre: "Province(s) / préfecture(s)", extraire: c => c.provincesPrefectures.join("; "), largeurMin: 24, largeurMax: 42 },
  { titre: "Commune(s)", extraire: c => c.communes.join("; "), largeurMin: 20, largeurMax: 42 },
  { titre: "Présidence du comité", extraire: c => c.presidenceComite, largeurMin: 20, largeurMax: 34 },
  { titre: "Membres du comité", extraire: c => c.membresComite, largeurMin: 24, largeurMax: 52 },
  { titre: "Fréquence des réunions", extraire: c => c.frequenceReunions, largeurMin: 20, largeurMax: 36 },
  { titre: "Dernier comité", extraire: c => c.dernierComite, largeurMin: 14, largeurMax: 16, date: true, format: "dd/mm/yyyy" },
  { titre: "Dernier comité — mention", extraire: c => c.dernierComiteNote, largeurMin: 24, largeurMax: 44 },
  { titre: "Prochain comité", extraire: c => c.prochainComite, largeurMin: 14, largeurMax: 16, date: true, format: "dd/mm/yyyy" },
  { titre: "Prochaine échéance", extraire: c => c.prochaineEcheance, largeurMin: 16, largeurMax: 18, date: true, format: "dd/mm/yyyy" },
  { titre: "Prochaine échéance — mention", extraire: c => c.prochaineEcheanceNote, largeurMin: 26, largeurMax: 44 },
  { titre: "Statut d'alerte", extraire: c => c.alerte.libelle, largeurMin: 18, largeurMax: 30 },
  { titre: "Action à mener", extraire: c => c.alerte.action, largeurMin: 24, largeurMax: 48 },
  { titre: "Jours restants", extraire: c => c.alerte.joursRestants, largeurMin: 14, largeurMax: 18, format: "0" },
  { titre: "Commentaires", extraire: c => c.commentaires, largeurMin: 30, largeurMax: 60 },
];

function valeurDateExcel(valeur: unknown): unknown {
  if (typeof valeur !== "string") return valeur ?? null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  if (!match) return valeur;
  const [, annee, mois, jour] = match;
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(Number(annee), Number(mois) - 1, Number(jour));
  if (date.getUTCFullYear() !== Number(annee) || date.getUTCMonth() !== Number(mois) - 1 || date.getUTCDate() !== Number(jour)) return valeur;
  return date.getTime() / 86_400_000 + 25_569;
}

/**
 * Deux lectures par lots dans le même instantané SQL : mesure des colonnes,
 * puis écriture ligne par ligne. Aucun tableau de toutes les conventions.
 */
export async function genererExcelConventions(
  chargerLots: () => AsyncIterable<ConventionExport[]>,
  output: Writable,
  signal: AbortSignal,
): Promise<void> {
  const largeurs = colonnes.map(c => c.titre.length);
  let nombre = 0;
  let octetsTexte = 0;
  for await (const lot of chargerLots()) {
    signal.throwIfAborted();
    for (const convention of lot) {
      if (++nombre > EXPORT_MAX_ROWS) throw new ExportExcelError("L'export dépasse 5 000 conventions. Précisez les filtres.");
      colonnes.forEach((colonne, index) => {
        const valeur = colonne.extraire(convention);
        if (valeur === null || valeur === undefined) return;
        const texte = String(valeur);
        // Excel ne peut pas stocker davantage dans une cellule. Ne rien tronquer.
        if (texte.length > 32_767) throw new ExportExcelError("Un champ dépasse la capacité d'une cellule Excel. Réduisez le périmètre ou corrigez le champ concerné.");
        octetsTexte += Buffer.byteLength(texte, "utf8");
        if (octetsTexte > EXPORT_MAX_TEXT_BYTES) throw new ExportExcelError("Le volume de texte de cet export est trop important. Précisez les filtres.");
        largeurs[index] = Math.max(largeurs[index]!, colonne.date ? 10 : texte.length);
      });
    }
  }
  signal.throwIfAborted();
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream: output, useStyles: true, useSharedStrings: false,
  });
  // ExcelJS 4.x n'expose pas d'annulation publique. Archiver.abort() permet
  // d'arrêter aussi la compression en cas de déconnexion ou d'échec disque.
  const archive = (workbook as unknown as {
    zip: { abort(): void; on(event: "error", listener: (error: Error) => void): void };
  }).zip;
  let streamError: Error | undefined;
  const cancel = () => { archive.abort(); output.destroy(); };
  const fail = (error: Error) => { streamError = error; cancel(); };
  output.on("error", fail);
  archive.on("error", fail);
  signal.addEventListener("abort", cancel, { once: true });
  const completed = finished(output);
  void completed.catch(() => {}); // Observé pendant commit et dans finally.
  try {
    workbook.creator = "Suivi des conventions — Région Souss-Massa";
    workbook.subject = "Export filtré des conventions";
    const sheet = workbook.addWorksheet("Conventions", {
      views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
    });
    sheet.columns = colonnes.map((colonne, index) => ({
      header: colonne.titre, key: colonne.titre,
      width: Math.max(colonne.largeurMin, Math.min(colonne.largeurMax, largeurs[index]! + 2)),
      style: {
        ...(colonne.format ? { numFmt: colonne.format } : {}),
        alignment: { vertical: "top", wrapText: true },
      },
    }));
    const entete = sheet.getRow(1);
    entete.height = 34;
    entete.eachCell(cell => {
      cell.font = { name: "Aptos", bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17365D" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });
    entete.commit();
    let numero = 1;
    for await (const lot of chargerLots()) {
      signal.throwIfAborted();
      if (streamError) throw streamError;
      for (const convention of lot) {
        const row = sheet.addRow(colonnes.map(colonne => {
          const valeur = colonne.extraire(convention);
          return colonne.date ? valeurDateExcel(valeur) : valeur ?? null;
        }));
        numero++;
        row.eachCell(cell => {
          cell.alignment = { vertical: "top", wrapText: true };
          if (numero % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F6FA" } };
        });
        row.commit();
      }
      // Laisser le compresseur vider ses buffers entre les lots.
      await setImmediate(undefined, { signal });
    }
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: numero, column: colonnes.length } };
    sheet.commit();
    await Promise.all([workbook.commit(), completed]);
    signal.throwIfAborted();
    if (streamError) throw streamError;
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal.removeEventListener("abort", cancel);
    await completed.catch(() => {});
    output.removeListener("error", fail);
  }
}
