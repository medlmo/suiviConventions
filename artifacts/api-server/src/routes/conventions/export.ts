import { Router, type IRouter } from "express";
import ExcelJS from "exceljs";
import { db, conventionsTable } from "@workspace/db";
import { ListConventionsQueryParams } from "@workspace/api-zod";
import { conditionsVisibles } from "../../lib/convention-access";
import { colonnesConvention, versApi } from "../../lib/conventions-mapper";
import { chargerReferentiel } from "../../lib/reference-data";
import { construireFiltres, construireTri } from "./requetes";

const router: IRouter = Router();

/**
 * Export Excel des données filtrées — volontairement hors contrat OpenAPI :
 * c'est un téléchargement de fichier, consommé par un lien direct et non par
 * un hook React Query. Les mêmes paramètres de filtre que la liste sont
 * acceptés, sans pagination.
 */
router.get("/conventions/export", async (req, res): Promise<void> => {
  const partenaires = req.query.partenaires;
  const query = ListConventionsQueryParams.safeParse({
    ...req.query,
    partenaires: partenaires === undefined ? undefined : Array.isArray(partenaires) ? partenaires : [partenaires],
  });
  if (!query.success) {
    res.status(400).json({ error: "Paramètres de recherche invalides." });
    return;
  }

  const { tri = "urgence", ordre = "asc", ...filtres } = query.data;
  const reference = await chargerReferentiel();

  const lignes = await db
    .select(colonnesConvention)
    .from(conventionsTable)
    .where(conditionsVisibles(req.user!, reference, construireFiltres(filtres)))
    .orderBy(...construireTri(tri, ordre));

  type ConventionExport = ReturnType<typeof versApi>;
  type ColonneExport = {
    titre: string;
    extraire: (convention: ConventionExport) => unknown;
    largeurMin: number;
    largeurMax: number;
    format?: string;
    date?: boolean;
  };
  const colonnes: ColonneExport[] = [
    { titre: "Convention visée", extraire: (c) => c.nomConvention, largeurMin: 28, largeurMax: 55 },
    { titre: "Objet de la convention (français)", extraire: (c) => c.objetConventionFr, largeurMin: 32, largeurMax: 60 },
    { titre: "Rattachement", extraire: (c) => c.rattachement, largeurMin: 18, largeurMax: 38 },
    { titre: "Responsable du projet", extraire: (c) => c.responsableProjet, largeurMin: 20, largeurMax: 36 },
    { titre: "Statut de la convention", extraire: (c) => c.statutConvention, largeurMin: 18, largeurMax: 30 },
    { titre: "Type de la session", extraire: (c) => c.typeSession, largeurMin: 16, largeurMax: 28 },
    { titre: "Session", extraire: (c) => c.session, largeurMin: 12, largeurMax: 24 },
    { titre: "Date de visa", extraire: (c) => c.dateVisa, largeurMin: 12, largeurMax: 14, date: true, format: "dd/mm/yyyy" },
    { titre: "Décision", extraire: (c) => c.decision, largeurMin: 18, largeurMax: 40 },
    { titre: "Compétence", extraire: (c) => c.competence, largeurMin: 18, largeurMax: 32 },
    { titre: "Nature du projet", extraire: (c) => c.nature, largeurMin: 18, largeurMax: 32 },
    { titre: "Enveloppe budgétaire (MAD)", extraire: (c) => c.enveloppeBudgetaire, largeurMin: 20, largeurMax: 24, format: '#,##0.00 "MAD"' },
    { titre: "Contribution de la Région (MAD)", extraire: (c) => c.contributionRegion, largeurMin: 22, largeurMax: 26, format: '#,##0.00 "MAD"' },
    { titre: "Nature des fonds", extraire: (c) => c.natureFonds, largeurMin: 18, largeurMax: 30 },
    { titre: "Porteur de projet", extraire: (c) => c.porteurProjet, largeurMin: 20, largeurMax: 36 },
    { titre: "Maîtrise d'ouvrage", extraire: (c) => c.maitriseOuvrage.join("; "), largeurMin: 24, largeurMax: 48 },
    { titre: "Maîtrise d'ouvrage déléguée", extraire: (c) => c.maitriseOuvrageDeleguee.join("; "), largeurMin: 28, largeurMax: 48 },
    { titre: "Partenaires", extraire: (c) => c.partenaires.join("; "), largeurMin: 24, largeurMax: 48 },
    { titre: "Province(s) / préfecture(s)", extraire: (c) => c.provincesPrefectures.join("; "), largeurMin: 24, largeurMax: 42 },
    { titre: "Commune(s)", extraire: (c) => c.communes.join("; "), largeurMin: 20, largeurMax: 42 },
    { titre: "Présidence du comité", extraire: (c) => c.presidenceComite, largeurMin: 20, largeurMax: 34 },
    { titre: "Membres du comité", extraire: (c) => c.membresComite, largeurMin: 24, largeurMax: 52 },
    { titre: "Fréquence des réunions", extraire: (c) => c.frequenceReunions, largeurMin: 20, largeurMax: 36 },
    { titre: "Dernier comité", extraire: (c) => c.dernierComite, largeurMin: 14, largeurMax: 16, date: true, format: "dd/mm/yyyy" },
    { titre: "Dernier comité — mention", extraire: (c) => c.dernierComiteNote, largeurMin: 24, largeurMax: 44 },
    { titre: "Prochain comité", extraire: (c) => c.prochainComite, largeurMin: 14, largeurMax: 16, date: true, format: "dd/mm/yyyy" },
    { titre: "Prochaine échéance", extraire: (c) => c.prochaineEcheance, largeurMin: 16, largeurMax: 18, date: true, format: "dd/mm/yyyy" },
    { titre: "Prochaine échéance — mention", extraire: (c) => c.prochaineEcheanceNote, largeurMin: 26, largeurMax: 44 },
    { titre: "Statut d'alerte", extraire: (c) => c.alerte.libelle, largeurMin: 18, largeurMax: 30 },
    { titre: "Action à mener", extraire: (c) => c.alerte.action, largeurMin: 24, largeurMax: 48 },
    { titre: "Jours restants", extraire: (c) => c.alerte.joursRestants, largeurMin: 14, largeurMax: 18, format: "0" },
    { titre: "Commentaires", extraire: (c) => c.commentaires, largeurMin: 30, largeurMax: 60 },
  ];

  function valeurDateExcel(valeur: unknown): unknown {
    if (typeof valeur !== "string") return valeur ?? null;
    const correspondance = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
    if (!correspondance) return valeur;
    const [, annee, mois, jour] = correspondance;
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(Number(annee), Number(mois) - 1, Number(jour));
    if (
      date.getUTCFullYear() !== Number(annee) ||
      date.getUTCMonth() !== Number(mois) - 1 ||
      date.getUTCDate() !== Number(jour)
    ) {
      return valeur;
    }
    // Excel stocke les dates comme jours depuis le 30/12/1899.
    return date.getTime() / 86_400_000 + 25_569;
  }

  const conventions = lignes.map(versApi);
  const classeur = new ExcelJS.Workbook();
  classeur.creator = "Suivi des conventions — Région Souss-Massa";
  classeur.subject = "Export filtré des conventions";
  classeur.created = new Date();

  const feuille = classeur.addWorksheet("Conventions", {
    views: [{ state: "frozen", ySplit: 1, showGridLines: false }],
  });
  feuille.columns = colonnes.map((colonne) => {
    const longueurMax = conventions.reduce((longueur, convention) => {
      const valeur = colonne.extraire(convention);
      if (valeur === null || valeur === undefined) return longueur;
      if (colonne.date && typeof valeur === "string") return Math.max(longueur, 10);
      const texte = Array.isArray(valeur) ? valeur.join("; ") : String(valeur);
      return Math.max(longueur, texte.length);
    }, colonne.titre.length);
    return {
      header: colonne.titre,
      key: colonne.titre,
      width: Math.max(colonne.largeurMin, Math.min(colonne.largeurMax, longueurMax + 2)),
      style: {
        ...(colonne.format ? { numFmt: colonne.format } : {}),
        alignment: { vertical: "top" as const, wrapText: true },
      },
    };
  });
  feuille.addRows(
    conventions.map((convention) =>
      colonnes.map((colonne) => {
        const valeur = colonne.extraire(convention);
        return colonne.date ? valeurDateExcel(valeur) : valeur ?? null;
      }),
    ),
  );

  const entete = feuille.getRow(1);
  entete.height = 34;
  entete.eachCell((cellule) => {
    cellule.font = { name: "Aptos", bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cellule.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF17365D" },
    };
    cellule.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  for (let numeroLigne = 2; numeroLigne <= feuille.rowCount; numeroLigne++) {
    const ligne = feuille.getRow(numeroLigne);
    ligne.eachCell((cellule) => {
      cellule.alignment = { vertical: "top", wrapText: true };
      if (numeroLigne % 2 === 0) {
        cellule.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF3F6FA" },
        };
      }
    });
  }
  feuille.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, feuille.rowCount), column: colonnes.length },
  };

  const horodatage = new Date().toISOString().slice(0, 10);

  const fichier = await classeur.xlsx.writeBuffer();
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="conventions-${horodatage}.xlsx"`,
  );
  res.send(Buffer.from(fichier));
});

export default router;
