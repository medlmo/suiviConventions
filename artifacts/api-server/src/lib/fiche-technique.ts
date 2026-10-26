import {
  AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer,
  PageNumber, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun,
  VerticalAlign, WidthType,
} from "docx";
import logo from "./logo-crsm-word.png";
import type { ConventionApi } from "./conventions-mapper";
import { natureAvecAvancement } from "./avancement-physique";

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

function dateGenerationFr(value: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Africa/Casablanca",
  }).format(value);
}

function montant(value?: number | null): string {
  return value == null ? EMPTY : new Intl.NumberFormat("fr-MA", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value);
}

function montantCentimes(value: number): bigint {
  return BigInt(Math.round(value * 100));
}

function formaterCentimes(value: bigint): string {
  const entier = new Intl.NumberFormat("fr-MA", { maximumFractionDigits: 0 }).format(value / 100n);
  return `${entier},${String(value % 100n).padStart(2, "0")}`;
}

function celluleMontage(
  value: string,
  width: number,
  options: { fill?: string; color?: string; bold?: boolean; center?: boolean } = {},
): TableCell {
  const rtl = /[\u0600-\u06FF]/u.test(value);
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    ...(options.fill ? { shading: { fill: options.fill } } : {}),
    margins: { top: 90, bottom: 80, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({
      bidirectional: rtl,
      alignment: rtl ? AlignmentType.RIGHT : options.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { before: 0, after: 0, line: 240 },
      children: [new TextRun({
        text: value,
        font: "Arial",
        size: 18,
        bold: options.bold ?? false,
        color: options.color ?? NAVY,
        rightToLeft: rtl,
      })],
    })],
  });
}

function ligneEnteteMontage(columnSpan = 1): TableRow {
  return new TableRow({
    cantSplit: true,
    children: [new TableCell({
      columnSpan,
      shading: { fill: NAVY },
      margins: { top: 110, bottom: 90, left: 140, right: 140 },
      children: [new Paragraph({
        keepNext: true,
        spacing: { after: 0 },
        children: [new TextRun({ text: "06  MONTAGE FINANCIER (MAD)", bold: true, size: 21, color: "FFFFFF" })],
      })],
    })],
  });
}

function tableauxMontage(convention: ConventionApi): Table[] {
  const suivi = convention.suiviFinancier;
  const annees = [...new Set(suivi?.annees ?? [])].filter(Number.isInteger).sort((a, b) => b - a);
  const lignes = suivi?.lignes ?? [];
  const borders = {
    top: RULE, bottom: RULE, left: RULE, right: RULE,
    insideHorizontal: RULE, insideVertical: RULE,
  };

  if (annees.length === 0 || lignes.length === 0) {
    const message = annees.length === 0
      ? "Aucune année de contribution n'a été renseignée."
      : "Aucun partenaire n'a été ajouté au montage financier.";
    return [new Table({
      width: { size: WIDTH, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: [WIDTH],
      borders,
      rows: [
        ligneEnteteMontage(),
        new TableRow({ cantSplit: true, children: [celluleMontage(message, WIDTH, { fill: LIGHT })] }),
      ],
    })];
  }

  const tableaux: Table[] = [];
  const tailleBloc = 5;
  for (let debut = 0; debut < annees.length; debut += tailleBloc) {
    const anneesBloc = annees.slice(debut, debut + tailleBloc);
    const largeurPartenaire = 3000;
    const largeurAnnee = Math.floor((WIDTH - largeurPartenaire) / anneesBloc.length);
    const largeurs = [largeurPartenaire, ...anneesBloc.map(() => largeurAnnee)];
    largeurs[largeurs.length - 1] = WIDTH - largeurs.slice(0, -1).reduce((total, largeur) => total + largeur, 0);
    const rows: TableRow[] = [];

    if (debut === 0) rows.push(ligneEnteteMontage(anneesBloc.length + 1));
    rows.push(new TableRow({
      cantSplit: true,
      children: [
        celluleMontage("Partenaire", largeurPartenaire, { fill: LIGHT, bold: true }),
        ...anneesBloc.map((annee, index) =>
          celluleMontage(String(annee), largeurs[index + 1]!, { fill: LIGHT, bold: true, center: true })),
      ],
    }));

    for (const ligne of lignes) {
      const contributions = new Map(ligne.contributions.map(({ annee, montant }) => [annee, montant]));
      rows.push(new TableRow({
        cantSplit: true,
        children: [
          celluleMontage(ligne.partenaire, largeurPartenaire),
          ...anneesBloc.map((annee, index) => {
            const value = contributions.get(annee);
            return celluleMontage(
              value === undefined ? "—" : montant(value),
              largeurs[index + 1]!,
              { center: true },
            );
          }),
        ],
      }));
    }

    rows.push(new TableRow({
      cantSplit: true,
      children: [
        celluleMontage("Total général", largeurPartenaire, { fill: LIGHT, bold: true }),
        ...anneesBloc.map((annee, index) => {
          const montants = lignes.flatMap(ligne => {
            const value = ligne.contributions.find(contribution => contribution.annee === annee)?.montant;
            return value === undefined ? [] : [montantCentimes(value)];
          });
          const total = montants.length ? montants.reduce((sum, value) => sum + value, 0n) : null;
          return celluleMontage(
            total === null ? "—" : formaterCentimes(total),
            largeurs[index + 1]!,
            { fill: LIGHT, bold: true, center: true },
          );
        }),
      ],
    }));

    tableaux.push(new Table({
      width: { size: WIDTH, type: WidthType.DXA },
      layout: TableLayoutType.FIXED,
      columnWidths: largeurs,
      borders,
      rows,
    }));
  }
  return tableaux;
}

function tableauSituationVersements(convention: ConventionApi): Table {
  const lignes = [...(convention.situationVersements ?? [])].sort((a, b) => a.annee - b.annee);
  const largeurs = [850, 1850, 3850, 1800, 1500];
  const borders = {
    top: RULE, bottom: RULE, left: RULE, right: RULE,
    insideHorizontal: RULE, insideVertical: RULE,
  };
  const rows: TableRow[] = [
    new TableRow({
      cantSplit: true,
      children: [new TableCell({
        columnSpan: largeurs.length,
        shading: { fill: NAVY },
        margins: { top: 110, bottom: 90, left: 140, right: 140 },
        children: [new Paragraph({
          keepNext: true,
          spacing: { after: 0 },
          children: [new TextRun({
            text: "07  SITUATION DES VERSEMENTS DE LA RÉGION SOUSS MASSA (MAD)",
            bold: true,
            size: 21,
            color: "FFFFFF",
          })],
        })],
      })],
    }),
  ];

  if (lignes.length === 0) {
    rows.push(new TableRow({
      cantSplit: true,
      children: [new TableCell({
        columnSpan: largeurs.length,
        shading: { fill: LIGHT },
        margins: { top: 90, bottom: 80, left: 100, right: 100 },
        children: [texte("Aucune situation des versements n'est renseignée.", false, MUTED)],
      })],
    }));
  } else {
    rows.push(new TableRow({
      cantSplit: true,
      children: [
        celluleMontage("Année", largeurs[0]!, { fill: LIGHT, bold: true, center: true }),
        celluleMontage("Total programmé", largeurs[1]!, { fill: LIGHT, bold: true, center: true }),
        celluleMontage("Tranches de versement", largeurs[2]!, { fill: LIGHT, bold: true }),
        celluleMontage("Total versé", largeurs[3]!, { fill: LIGHT, bold: true, center: true }),
        celluleMontage("Taux de versement", largeurs[4]!, { fill: LIGHT, bold: true, center: true }),
      ],
    }));

    for (const ligne of lignes) {
      const totalCentimes = ligne.tranches.reduce(
        (total, tranche) => total + montantCentimes(tranche.montant),
        0n,
      );
      const programmeCentimes = montantCentimes(ligne.montantProgramme);
      const taux = programmeCentimes === 0n
        ? "— (programmé nul)"
        : `${(Number(totalCentimes) / Number(programmeCentimes) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
      const tranches = ligne.tranches.length > 0
        ? ligne.tranches.map(tranche =>
            texte(`${dateFr(tranche.dateVersement)} · ${montant(tranche.montant)} MAD`))
        : [texte("—", false, MUTED)];

      rows.push(new TableRow({
        cantSplit: false,
        children: [
          celluleMontage(String(ligne.annee), largeurs[0]!, { center: true, bold: true }),
          celluleMontage(montant(ligne.montantProgramme), largeurs[1]!, { center: true }),
          new TableCell({
            width: { size: largeurs[2]!, type: WidthType.DXA },
            margins: { top: 90, bottom: 80, left: 100, right: 100 },
            verticalAlign: VerticalAlign.CENTER,
            children: tranches,
          }),
          celluleMontage(formaterCentimes(totalCentimes), largeurs[3]!, { center: true, bold: true }),
          celluleMontage(taux, largeurs[4]!, { center: true }),
        ],
      }));
    }
  }

  return new Table({
    width: { size: WIDTH, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: largeurs,
    borders,
    rows,
  });
}

function dateHeureFr(value?: string | null): string {
  if (!value) return EMPTY;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY;
  return new Intl.DateTimeFormat("fr-MA", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Africa/Casablanca",
  }).format(date);
}

function tableauAvancementPhysique(convention: ConventionApi): Table[] {
  const historique = [...(convention.avancementPhysiqueHistorique ?? [])].sort((a, b) =>
    a.dateConstat !== b.dateConstat
      ? (a.dateConstat < b.dateConstat ? 1 : -1)
      : (Date.parse(b.enregistreLe) || 0) - (Date.parse(a.enregistreLe) || 0));
  const applicable = natureAvecAvancement(convention.nature);

  // Keep archived observations visible after a nature change, while not adding
  // an irrelevant empty section to conventions that never used this tracking.
  if (!applicable && historique.length === 0) return [];

  const largeurs = [1450, 1300, 3650, 1500, 1900];
  const borders = {
    top: RULE, bottom: RULE, left: RULE, right: RULE,
    insideHorizontal: RULE, insideVertical: RULE,
  };
  const rows: TableRow[] = [
    new TableRow({
      cantSplit: true,
      children: [new TableCell({
        columnSpan: largeurs.length,
        shading: { fill: NAVY },
        margins: { top: 110, bottom: 90, left: 140, right: 140 },
        children: [new Paragraph({
          keepNext: true,
          spacing: { after: 0 },
          children: [new TextRun({
            text: "08  AVANCEMENT PHYSIQUE DU PROJET",
            bold: true,
            size: 21,
            color: "FFFFFF",
          })],
        })],
      })],
    }),
  ];

  if (!applicable) {
    rows.push(new TableRow({
      cantSplit: true,
      children: [new TableCell({
        columnSpan: largeurs.length,
        shading: { fill: LIGHT },
        margins: { top: 90, bottom: 80, left: 100, right: 100 },
        children: [texte(
          "La nature actuelle du projet ne relève pas du suivi physique ; l’historique conservé est présenté ci-dessous.",
          false,
          MUTED,
        )],
      })],
    }));
  }

  if (historique.length === 0) {
    rows.push(new TableRow({
      cantSplit: true,
      children: [new TableCell({
        columnSpan: largeurs.length,
        margins: { top: 90, bottom: 80, left: 100, right: 100 },
        children: [texte("Aucun avancement physique n'a encore été constaté pour ce projet.", false, MUTED)],
      })],
    }));
  } else {
    rows.push(new TableRow({
      cantSplit: true,
      children: [
        celluleMontage("Date du constat", largeurs[0]!, { fill: LIGHT, bold: true, center: true }),
        celluleMontage("Taux estimé", largeurs[1]!, { fill: LIGHT, bold: true, center: true }),
        celluleMontage("Commentaire", largeurs[2]!, { fill: LIGHT, bold: true }),
        celluleMontage("Saisi par", largeurs[3]!, { fill: LIGHT, bold: true }),
        celluleMontage("Enregistré le", largeurs[4]!, { fill: LIGHT, bold: true, center: true }),
      ],
    }));

    for (const constat of historique) {
      rows.push(new TableRow({
        cantSplit: true,
        children: [
          celluleMontage(dateFr(constat.dateConstat), largeurs[0]!, { center: true }),
          celluleMontage(`${constat.taux.toLocaleString("fr-MA", { maximumFractionDigits: 2 })} %`, largeurs[1]!, { center: true, bold: true }),
          celluleMontage(constat.commentaire?.trim() || "—", largeurs[2]!),
          celluleMontage(constat.auteur?.trim() || EMPTY, largeurs[3]!),
          celluleMontage(dateHeureFr(constat.enregistreLe), largeurs[4]!, { center: true }),
        ],
      }));
    }
  }

  return [new Table({
    width: { size: WIDTH, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: largeurs,
    borders,
    rows,
  })];
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
  const dateGeneration = new Date();
  const header = new Header({
    children: [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 0 }, children: [new ImageRun({
      type: "png", data: Buffer.from(logo, "base64"), transformation: { width: 60, height: 81 },
      altText: { name: "Logo Région Souss-Massa", title: "Région Souss-Massa", description: "Logo officiel de la Région Souss-Massa" },
    })] })],
  });
  const footer = new Footer({ children: [new Paragraph({
    border: { top: { color: GOLD, style: BorderStyle.SINGLE, size: 6, space: 8 } },
    spacing: { before: 100 },
    alignment: AlignmentType.RIGHT,
    children: [
      new TextRun({ text: "Page ", color: MUTED, size: 17 }),
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
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({
          text: "FICHE TECHNIQUE", bold: true, size: 36, color: NAVY,
        })] }),
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 0, after: 160 },
          children: [new TextRun({
            text: `Fiche générée le ${dateGenerationFr(dateGeneration)}`,
            size: 17,
            color: MUTED,
          })],
        }),
        new Table({
          width: { size: WIDTH, type: WidthType.DXA },
          layout: TableLayoutType.FIXED, columnWidths: [2900, WIDTH - 2900],
          borders: { top: RULE, bottom: RULE, left: RULE, right: RULE, insideHorizontal: RULE, insideVertical: RULE },
          rows,
        }),
        ...tableauxMontage(convention),
        tableauSituationVersements(convention),
        ...tableauAvancementPhysique(convention),
      ],
    }],
  }));
}
