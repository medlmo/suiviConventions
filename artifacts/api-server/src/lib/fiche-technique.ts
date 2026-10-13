import {
  AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer,
  PageNumber, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun,
  VerticalAlign, WidthType,
} from "docx";
import logo from "../../../conventions/public/logo-crsm.png";
import type { ConventionApi } from "./conventions-mapper";

const NAVY = "17365D";
const GOLD = "C38B37";
const LIGHT = "F3F6FA";
const MUTED = "64748B";
const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const RULE = { style: BorderStyle.SINGLE, size: 4, color: "DFE5ED" };
const WIDTH = 9800;
const EMPTY = "Non renseigné";

function dateFr(value?: string | null): string {
  if (!value) return EMPTY;
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function montant(value?: number | null): string {
  return value == null ? EMPTY : new Intl.NumberFormat("fr-MA", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}

function texte(value: string, bold = false, color = NAVY): Paragraph {
  const rtl = /[\u0600-\u06FF]/u.test(value);
  return new Paragraph({
    bidirectional: rtl,
    alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
    spacing: { before: 0, after: 60, line: 260 },
    children: [new TextRun({
      text: value, font: "Arial", size: 20, bold, color, rightToLeft: rtl,
    })],
  });
}

function ligne(label: string, value: string | string[] | null | undefined, bold = false): TableRow {
  const values = Array.isArray(value) ? value.filter(Boolean) : value?.trim() ? [value] : [];
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 2900, type: WidthType.DXA }, shading: { fill: LIGHT },
        margins: { top: 100, bottom: 90, left: 140, right: 140 },
        verticalAlign: VerticalAlign.CENTER, children: [texte(label, true)],
      }),
      new TableCell({
        width: { size: WIDTH - 2900, type: WidthType.DXA },
        margins: { top: 100, bottom: 90, left: 180, right: 180 },
        children: values.length
          ? values.flatMap(item => item.split(/\r?\n/u).map(part => texte(part || " ", bold)))
          : [texte(EMPTY, false, MUTED)],
      }),
    ],
  });
}

function rubrique(label: string): TableRow {
  return new TableRow({
    cantSplit: true,
    children: [new TableCell({
      columnSpan: 2, shading: { fill: NAVY },
      margins: { top: 100, bottom: 80, left: 140, right: 140 },
      children: [new Paragraph({
        keepNext: true, spacing: { after: 40 },
        children: [new TextRun({ text: label, bold: true, size: 21, color: "FFFFFF" })],
      })],
    })],
  });
}

/** Génération à la demande : ni données inventées, ni fichier sauvegardé dans la fiche. */
export async function genererFicheTechnique(convention: ConventionApi): Promise<Buffer> {
  const header = new Header({
    children: [new Table({
      width: { size: WIDTH, type: WidthType.DXA },
      columnWidths: [1400, WIDTH - 1400], layout: TableLayoutType.FIXED,
      borders: { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE },
      rows: [new TableRow({ children: [
        new TableCell({
          width: { size: 1400, type: WidthType.DXA },
          children: [new Paragraph({ children: [new ImageRun({
            type: "png", data: Buffer.from(logo, "base64"), transformation: { width: 60, height: 84 },
            altText: { name: "Logo Région Souss-Massa", title: "Région Souss-Massa", description: "Logo officiel de la Région Souss-Massa" },
          })] })],
        }),
        new TableCell({
          width: { size: WIDTH - 1400, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
          children: [
            new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "RÉGION SOUSS-MASSA", bold: true, size: 26, color: NAVY })] }),
            new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Conseil régional", size: 22, color: NAVY })] }),
            new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Suivi des conventions de partenariat", size: 19, color: MUTED })] }),
          ],
        }),
      ] })],
    }), new Paragraph({ spacing: { after: 0 } })],
  });
  const footer = new Footer({ children: [new Paragraph({
    border: { top: { color: GOLD, style: BorderStyle.SINGLE, size: 6, space: 8 } },
    spacing: { before: 100 },
    alignment: AlignmentType.RIGHT,
    children: [
      new TextRun({ text: `Région Souss-Massa • Convention n° ${convention.id}   |   Page `, color: MUTED, size: 17 }),
      new TextRun({ children: [PageNumber.CURRENT], color: MUTED, size: 17 }),
      new TextRun({ text: " / ", color: MUTED, size: 17 }),
      new TextRun({ children: [PageNumber.TOTAL_PAGES], color: MUTED, size: 17 }),
    ],
  })] });
  const rows = [
    rubrique("01  OBJET DE LA CONVENTION"),
    ligne("Objet de la convention (arabe)", convention.nomConvention),
    ligne("Objet de la convention (français)", convention.objetConventionFr),
    rubrique("02  IDENTIFICATION"),
    ligne("Session", [
      dateFr(convention.session),
      ...(convention.typeSession ? [`Session ${convention.typeSession.toLocaleLowerCase("fr")}`] : []),
    ]),
    ligne("Nature du projet", convention.nature),
    ligne("Compétence", convention.competence),
    ligne("Date de Visa", dateFr(convention.dateVisa)),
    rubrique("03  LOCALISATION"),
    ligne("Province(s) / préfecture(s)", convention.provincesPrefectures),
    ligne("Commune(s)", convention.communes),
    rubrique("04  PARTIES PRENANTES"),
    ligne("Partenaires", convention.partenaires),
    ligne("Porteur du projet", convention.porteurProjet),
    ligne("Maîtrise d'ouvrage", convention.maitriseOuvrage),
    ligne("Maîtrise d'ouvrage déléguée", convention.maitriseOuvrageDeleguee),
    rubrique("05  FINANCEMENT"),
    ligne("Enveloppe budgétaire (MAD)", montant(convention.enveloppeBudgetaire), true),
    ligne("Contribution de la Région (MAD)", montant(convention.contributionRegion), true),
  ];
  return Packer.toBuffer(new Document({
    creator: "Région Souss-Massa", title: `Fiche technique — Convention ${convention.id}`,
    description: "Fiche technique de convention de partenariat",
    styles: { default: { document: { run: { font: "Arial", size: 20, color: NAVY, language: { value: "fr-MA", bidirectional: "ar-MA" } } } } },
    sections: [{
      properties: { page: { size: { width: 11906, height: 16838 },
        margin: { top: 1900, bottom: 1000, left: 1050, right: 1050, header: 320, footer: 450 } } },
      headers: { default: header }, footers: { default: footer },
      children: [
        new Paragraph({ spacing: { after: 120 }, children: [new TextRun({
          text: "FICHE TECHNIQUE", bold: true, size: 36, color: NAVY,
        })] }),
        new Paragraph({
          border: { bottom: { color: GOLD, style: BorderStyle.SINGLE, size: 12, space: 8 } },
          spacing: { after: 220 },
          children: [new TextRun({ text: `Convention n° ${convention.id}  •  Éditée le ${new Date().toLocaleDateString("fr-FR", { timeZone: "Africa/Casablanca" })}`, color: MUTED, size: 19 })],
        }),
        new Table({
          width: { size: WIDTH, type: WidthType.DXA },
          layout: TableLayoutType.FIXED, columnWidths: [2900, WIDTH - 2900],
          borders: { top: RULE, bottom: RULE, left: RULE, right: RULE, insideHorizontal: RULE, insideVertical: RULE },
          rows,
        }),
        new Paragraph({ spacing: { before: 140 }, children: [new TextRun({
          text: "Fiche générée à partir des informations enregistrées dans l’application. Les données manquantes sont signalées « Non renseigné ».",
          color: MUTED, size: 17, italics: true,
        })] }),
      ],
    }],
  }));
}
