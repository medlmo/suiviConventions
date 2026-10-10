import { Router, type IRouter } from "express";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db, conventionsTable, conventionAuditTable } from "@workspace/db";
import type { SessionUser } from "../lib/auth";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  ObjectStorageService,
  type VerifiedDocument,
} from "../lib/objectStorage";
import {
  CreateConventionBody,
  CreateConventionResponse,
  DeleteConventionParams,
  GetAgendaQueryParams,
  GetAgendaResponse,
  GetConventionParams,
  GetConventionResponse,
  GetOptionsFiltresResponse,
  GetResumeAlertesResponse,
  ListAlertesQueryParams,
  ListAlertesResponse,
  ListConventionsQueryParams,
  ListConventionsResponse,
  UpdateConventionBody,
  UpdateConventionParams,
  UpdateConventionResponse,
} from "@workspace/api-zod";
import {
  META_ALERTES,
  NIVEAUX_ALERTE,
  niveauAlerteSql,
  rangUrgenceSql,
  type NiveauAlerte,
} from "../lib/alertes";
import {
  colonnesConvention,
  echapperJokersLike,
  normaliserPourRecherche,
  versApi,
  versColonnes,
} from "../lib/conventions-mapper";
import { calculerEcheance } from "../lib/echeances";
import {
  chargerReferentiel,
  chargerReferentielDepuis,
  divisionDeDirection,
  maitriseOuvrageConnue,
  serviceDansDivision,
  serviceDansRattachement,
  perimetreChefService,
  servicesDeDivision,
  type ReferenceData,
} from "../lib/reference-data";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const CHAMPS_DATE_CORPS = [
  "session",
  "dateVisa",
  "prochainComite",
  "dernierComite",
  "prochaineEcheance",
] as const;

const CHAMPS_MONTANT_CORPS = ["enveloppeBudgetaire", "contributionRegion"] as const;
const ERREUR_CONTRIBUTION = "La contribution de la Région (MAD) ne peut pas dépasser l'enveloppe budgétaire (MAD).";
const ERREUR_DOCUMENT = "Les champs Convention et PV doivent contenir un PDF ou un document Word de 10 Mo maximum.";
const CHAMPS_DOCUMENTS = ["documentConvention", "pv"] as const;

function contributionDepasseEnveloppe(
  enveloppe: number | string | null | undefined,
  contribution: number | string | null | undefined,
): boolean {
  return enveloppe != null && contribution != null && Number(contribution) > Number(enveloppe);
}

async function documentVerifie(path: string): Promise<VerifiedDocument | null> {
  return objectStorageService.getVerifiedDocumentInfo(path);
}

const JOUR_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Contrôle strict des dates et des montants avant la validation de contrat.
 *
 * Les schémas générés utilisent `z.coerce.date()` et `z.coerce.number()`, qui
 * acceptent beaucoup trop : « 2025-02-30 » deviendrait le 2 mars, un
 * horodatage avec fuseau pourrait basculer d'un jour, et un champ montant vidé
 * par l'utilisateur serait enregistré comme 0 au lieu d'être effacé. Sur des
 * dates de comité qui pilotent toutes les alertes, une correction silencieuse
 * est pire qu'un refus.
 */
function normaliserCorps(corps: unknown): { ok: true; valeur: Record<string, unknown> } | { ok: false; erreur: string } {
  if (typeof corps !== "object" || corps === null || Array.isArray(corps)) {
    return { ok: false, erreur: "Le corps de la requête doit être un objet." };
  }

  const valeur: Record<string, unknown> = { ...(corps as Record<string, unknown>) };

  for (const champ of CHAMPS_DATE_CORPS) {
    if (!(champ in valeur)) continue;
    const brut = valeur[champ];
    if (brut === null || brut === undefined || brut === "") {
      valeur[champ] = null;
      continue;
    }
    if (typeof brut !== "string" || !JOUR_ISO.test(brut)) {
      return { ok: false, erreur: `Le champ « ${champ} » doit être une date au format AAAA-MM-JJ.` };
    }
    const [annee, mois, jour] = brut.split("-").map(Number);
    const controle = new Date(Date.UTC(annee!, mois! - 1, jour!));
    if (
      controle.getUTCFullYear() !== annee ||
      controle.getUTCMonth() !== mois! - 1 ||
      controle.getUTCDate() !== jour
    ) {
      return { ok: false, erreur: `Le champ « ${champ} » ne correspond pas à une date réelle du calendrier.` };
    }
  }

  for (const champ of CHAMPS_MONTANT_CORPS) {
    if (!(champ in valeur)) continue;
    const brut = valeur[champ];
    if (brut === null || brut === undefined || brut === "") {
      valeur[champ] = null;
      continue;
    }
    const nombre = typeof brut === "number" ? brut : Number(brut);
    if (!Number.isFinite(nombre) || nombre < 0) {
      return { ok: false, erreur: `Le champ « ${champ} » doit être un montant positif.` };
    }
    valeur[champ] = nombre;
  }

  return { ok: true, valeur };
}

/**
 * Valide une réponse contre le contrat puis renvoie l'objet d'origine.
 *
 * Les schémas générés coercent les `format: date` en objets Date ; renvoyer le
 * résultat de `.parse()` transformerait « 2026-07-27 » en horodatage UTC
 * complet, avec un risque de décalage d'un jour côté client. On valide donc
 * la forme sans laisser la validation réécrire la charge utile.
 */
function valide<T>(schema: { parse: (valeur: unknown) => unknown }, donnees: T): T {
  schema.parse(donnees);
  return donnees;
}

interface FiltresListe {
  q?: string;
  alerte?: string;
  statutConvention?: string;
  rattachement?: string;
  responsableProjet?: string;
  natureFonds?: string;
  decision?: string;
}

function construireFiltres(filtres: FiltresListe): SQL | undefined {
  const conditions: SQL[] = [];

  if (filtres.q && filtres.q.trim() !== "") {
    const terme = `%${echapperJokersLike(filtres.q.trim())}%`;
    const motif = normaliserPourRecherche(terme);
    const champsRecherchables = [
      conventionsTable.nomConvention,
      conventionsTable.objetConventionFr,
      conventionsTable.responsableProjet,
      conventionsTable.porteurProjet,
      sql`CASE WHEN ${conventionsTable.maitrisesOuvrage} IS NULL THEN COALESCE(${conventionsTable.maitriseOuvrage}, '') ELSE '' END`,
      sql`CASE WHEN ${conventionsTable.maitrisesOuvrageDeleguees} IS NULL THEN COALESCE(${conventionsTable.maitriseOuvrageDeleguee}, '') ELSE '' END`,
      sql`array_to_string(${conventionsTable.maitrisesOuvrage}, ' ')`,
      sql`array_to_string(${conventionsTable.maitrisesOuvrageDeleguees}, ' ')`,
    ];

    const recherche = or(
      ...champsRecherchables.map(
        (champ) =>
          sql`${normaliserPourRecherche(sql`COALESCE(${champ}, '')`)} LIKE ${motif}`,
      ),
    );
    if (recherche) conditions.push(recherche);
  }

  if (filtres.alerte) {
    conditions.push(sql`${niveauAlerteSql} = ${filtres.alerte}`);
  }
  if (filtres.statutConvention) {
    conditions.push(eq(conventionsTable.statutConvention, filtres.statutConvention));
  }
  if (filtres.rattachement) {
    conditions.push(eq(conventionsTable.rattachement, filtres.rattachement));
  }
  if (filtres.responsableProjet) {
    conditions.push(eq(conventionsTable.responsableProjet, filtres.responsableProjet));
  }
  if (filtres.natureFonds) {
    conditions.push(eq(conventionsTable.natureFonds, filtres.natureFonds));
  }
  if (filtres.decision) {
    conditions.push(eq(conventionsTable.decision, filtres.decision));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function filtrePerimetre(user: SessionUser, reference: ReferenceData): SQL | undefined {
  if (user.role === "admin" || user.role === "directeur" || user.role === "directeur_general_services") {
    // Directors intentionally retain read access to every convention.
    return undefined;
  }
  if (
    user.role === "chef_division" &&
    user.direction &&
    user.division &&
    divisionDeDirection(reference, user.direction, user.division)
  ) {
    const services = servicesDeDivision(reference, user.division);
    const responsableDansPerimetre = services.length === 0
      ? isNull(conventionsTable.responsableProjet)
      : or(
        isNull(conventionsTable.responsableProjet),
        inArray(conventionsTable.responsableProjet, [...services]),
      );
    return and(
      eq(conventionsTable.rattachement, user.division),
      responsableDansPerimetre,
    );
  }
  if (
    user.role === "chef_service" &&
    perimetreChefService(reference, user)
  ) {
    return and(
      eq(conventionsTable.rattachement, perimetreChefService(reference, user)!),
      eq(conventionsTable.responsableProjet, user.service!),
    );
  }
  return sql`FALSE`;
}

function accessible(row: typeof conventionsTable.$inferSelect, user: SessionUser, reference: ReferenceData): boolean {
  if (user.role === "admin" || user.role === "directeur" || user.role === "directeur_general_services") return true;
  if (user.role === "chef_division") {
    return !!user.direction && !!user.division &&
      divisionDeDirection(reference, user.direction, user.division) &&
      row.rattachement === user.division &&
      (!row.responsableProjet || serviceDansDivision(reference, user.division, row.responsableProjet));
  }
  if (user.role === "chef_service") {
    const scope = perimetreChefService(reference, user);
    return !!scope && row.rattachement === scope && row.responsableProjet === user.service;
  }
  return false;
}

function peutEcrire(user: SessionUser): boolean {
  return user.role === "admin" || user.role === "chef_division" || user.role === "chef_service";
}

function affectationsValides(
  rattachement: string | null | undefined,
  responsableProjet: string | null | undefined,
  user: SessionUser,
  reference: ReferenceData,
): boolean {
  if (user.role === "chef_division") {
    return !!user.direction && !!user.division &&
      divisionDeDirection(reference, user.direction, user.division) &&
      rattachement === user.division &&
      (!responsableProjet || serviceDansDivision(reference, user.division, responsableProjet));
  }
  if (user.role === "chef_service") {
    const scope = perimetreChefService(reference, user);
    return !!scope && rattachement === scope && responsableProjet === user.service;
  }
  if (user.role === "admin") {
    return (!rattachement || !responsableProjet || serviceDansRattachement(reference, rattachement, responsableProjet)) &&
      (!responsableProjet || (!!rattachement && serviceDansRattachement(reference, rattachement, responsableProjet)));
  }
  return false;
}

function conditionsVisibles(user: SessionUser, reference: ReferenceData, filtre?: SQL): SQL {
  return and(isNull(conventionsTable.deletedAt), filtrePerimetre(user, reference), filtre)!;
}

function listeMoValide(
  valeurs: string[] | null | undefined,
  reference: ReferenceData,
  historique: string[] = [],
): boolean {
  return valeurs == null || valeurs.every((valeur) => {
    const nom = valeur.trim();
    return !nom || maitriseOuvrageConnue(reference, nom) || historique.includes(nom);
  });
}

function valeurMoValide(
  valeur: string | null | undefined,
  reference: ReferenceData,
  historique: string | null | undefined = null,
): boolean {
  const nom = valeur?.trim();
  return !nom || maitriseOuvrageConnue(reference, nom) || nom === historique;
}

function snapshot(row: typeof conventionsTable.$inferSelect): Record<string, unknown> {
  return { ...row };
}

function construireTri(tri: string, ordre: string): SQL[] {
  const sens = ordre === "desc" ? desc : asc;

  switch (tri) {
    case "nomConvention":
      return [sens(conventionsTable.nomConvention)];
    case "prochaineEcheance":
      return [
        sql`${conventionsTable.prochaineEcheance} IS NULL`,
        sens(conventionsTable.prochaineEcheance),
      ];
    case "dernierComite":
      return [
        sql`${conventionsTable.dernierComite} IS NULL`,
        sens(conventionsTable.dernierComite),
      ];
    case "responsableProjet":
      return [
        sql`${conventionsTable.responsableProjet} IS NULL`,
        sens(conventionsTable.responsableProjet),
      ];
    case "statutConvention":
      return [
        sql`${conventionsTable.statutConvention} IS NULL`,
        sens(conventionsTable.statutConvention),
      ];
    case "urgence":
    default:
      // Les retards les plus anciens en tête, puis les échéances les plus proches.
      return ordre === "desc"
        ? [desc(rangUrgenceSql), desc(conventionsTable.prochaineEcheance)]
        : [asc(rangUrgenceSql), asc(conventionsTable.prochaineEcheance)];
  }
}

router.get("/conventions", async (req, res): Promise<void> => {
  const query = ListConventionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { page = 1, pageSize = 25, tri = "urgence", ordre = "asc", ...filtres } = query.data;
  const reference = await chargerReferentiel();
  const where = conditionsVisibles(req.user!, reference, construireFiltres(filtres));

  const [lignes, [total]] = await Promise.all([
    db
      .select(colonnesConvention)
      .from(conventionsTable)
      .where(where)
      .orderBy(...construireTri(tri, ordre))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ valeur: count() }).from(conventionsTable).where(where),
  ]);

  const nombreTotal = total?.valeur ?? 0;

  res.json(
    valide(ListConventionsResponse, {
      items: lignes.map(versApi),
      total: nombreTotal,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(nombreTotal / pageSize)),
    }),
  );
});

router.get("/conventions/resume", async (req, res): Promise<void> => {
  const reference = await chargerReferentiel();
  const visible = conditionsVisibles(req.user!, reference);
  const [repartition, [prochaine], jourCourant] = await Promise.all([
    db
      .select({ niveau: niveauAlerteSql, nombre: count() })
      .from(conventionsTable)
      .where(visible)
      .groupBy(niveauAlerteSql),
    db
      .select({ date: conventionsTable.prochaineEcheance })
      .from(conventionsTable)
      .where(and(visible, gte(conventionsTable.prochaineEcheance, sql`CURRENT_DATE`)))
      .orderBy(asc(conventionsTable.prochaineEcheance))
      .limit(1),
    db.execute<{ valeur: string }>(sql`SELECT CURRENT_DATE::text AS valeur`),
  ]);

  const parNiveau = new Map<NiveauAlerte, number>(
    repartition.map((ligne) => [ligne.niveau, ligne.nombre]),
  );

  const compteurs = NIVEAUX_ALERTE.map((niveau) => ({
    niveau,
    libelle: META_ALERTES[niveau].libelle,
    couleur: META_ALERTES[niveau].couleur,
    nombre: parNiveau.get(niveau) ?? 0,
  }));

  const total = compteurs.reduce((somme, compteur) => somme + compteur.nombre, 0);
  const aTraiter =
    (parNiveau.get("EN_RETARD") ?? 0) +
    (parNiveau.get("A_DECLENCHER") ?? 0) +
    (parNiveau.get("A_PREPARER") ?? 0);
  const sansEcheance =
    (parNiveau.get("A_SURVEILLER") ?? 0) + (parNiveau.get("A_QUALIFIER") ?? 0);

  res.json(
    valide(GetResumeAlertesResponse, {
      total,
      compteurs,
      aTraiter,
      sansEcheance,
      prochaineEcheanceDate: prochaine?.date ?? null,
      dateCalcul:
        jourCourant.rows[0]?.valeur ?? new Date().toISOString().slice(0, 10),
    }),
  );
});

router.get("/conventions/alertes", async (req, res): Promise<void> => {
  const query = ListAlertesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { horizonJours = 60, limit = 50 } = query.data;
  const reference = await chargerReferentiel();

  const lignes = await db
    .select(colonnesConvention)
    .from(conventionsTable)
    .where(
      and(
        conditionsVisibles(req.user!, reference),
        isNotNull(conventionsTable.prochaineEcheance),
        lte(
          conventionsTable.prochaineEcheance,
          // Le cast est nécessaire : sans lui Postgres reçoit un paramètre de
          // type inconnu et ne sait pas quel opérateur « date + ? » appliquer.
          sql`CURRENT_DATE + ${horizonJours}::int`,
        ),
      ),
    )
    .orderBy(asc(rangUrgenceSql), asc(conventionsTable.prochaineEcheance))
    .limit(limit);

  res.json(valide(ListAlertesResponse, lignes.map(versApi)));
});

router.get("/conventions/agenda", async (req, res): Promise<void> => {
  const query = GetAgendaQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const { mois = 6 } = query.data;
  const reference = await chargerReferentiel();

  const lignes = await db
    .select(colonnesConvention)
    .from(conventionsTable)
    .where(
      and(
        conditionsVisibles(req.user!, reference),
        gte(conventionsTable.prochaineEcheance, sql`CURRENT_DATE`),
        lte(
          conventionsTable.prochaineEcheance,
          sql`(CURRENT_DATE + make_interval(months => ${mois}::int))::date`,
        ),
      ),
    )
    .orderBy(asc(conventionsTable.prochaineEcheance));

  const formatMois = new Intl.DateTimeFormat("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  const groupes = new Map<string, ReturnType<typeof versApi>[]>();
  for (const ligne of lignes) {
    const echeance = ligne.prochaineEcheance;
    if (!echeance) continue;
    const cle = echeance.slice(0, 7);
    const groupe = groupes.get(cle);
    if (groupe) {
      groupe.push(versApi(ligne));
    } else {
      groupes.set(cle, [versApi(ligne)]);
    }
  }

  const agenda = [...groupes.entries()].map(([moisCle, conventions]) => ({
    mois: moisCle,
    libelle: formatMois.format(new Date(`${moisCle}-01T00:00:00Z`)),
    nombre: conventions.length,
    conventions,
  }));

  res.json(valide(GetAgendaResponse, agenda));
});

router.get("/conventions/options-filtres", async (req, res): Promise<void> => {
  const reference = await chargerReferentiel();
  async function valeursDistinctes(colonne: AnyPgColumn) {
    const lignes = await db
      .selectDistinct({ valeur: colonne })
      .from(conventionsTable)
      .where(and(conditionsVisibles(req.user!, reference), isNotNull(colonne), sql`btrim(${colonne}) <> ''`))
      .orderBy(asc(colonne));
    return lignes
      .map((ligne) => ligne.valeur as string | null)
      .filter((valeur): valeur is string => valeur !== null);
  }

  const [rattachements, responsables, statuts, naturesFonds, decisions] = await Promise.all([
    valeursDistinctes(conventionsTable.rattachement),
    valeursDistinctes(conventionsTable.responsableProjet),
    valeursDistinctes(conventionsTable.statutConvention),
    valeursDistinctes(conventionsTable.natureFonds),
    valeursDistinctes(conventionsTable.decision),
  ]);

  res.json(
    valide(GetOptionsFiltresResponse, {
      rattachements,
      responsables,
      statuts,
      naturesFonds,
      decisions,
    }),
  );
});

/**
 * Export Excel des données filtrées — volontairement hors contrat OpenAPI :
 * c'est un téléchargement de fichier, consommé par un lien direct et non par
 * un hook React Query. Les mêmes paramètres de filtre que la liste sont
 * acceptés, sans pagination.
 */
router.get("/conventions/export", async (req, res): Promise<void> => {
  const query = ListConventionsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
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
    const valeursTexte = conventions.map((convention) => {
      const valeur = colonne.extraire(convention);
      if (valeur === null || valeur === undefined) return "";
      if (colonne.date && typeof valeur === "string") return "31/12/9999";
      return Array.isArray(valeur) ? valeur.join("; ") : String(valeur);
    });
    const longueurMax = Math.max(
      colonne.titre.length,
      ...valeursTexte.map((valeur) => valeur.length),
    );
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

router.post("/conventions", async (req, res): Promise<void> => {
  if (!peutEcrire(req.user!)) {
    res.status(403).json({ error: "Ce rôle ne peut pas modifier les conventions." });
    return;
  }
  const nettoye = normaliserCorps(req.body);
  if (!nettoye.ok) {
    res.status(400).json({ error: nettoye.erreur });
    return;
  }

  const parsed = CreateConventionBody.safeParse(nettoye.valeur);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Création refusée");
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (contributionDepasseEnveloppe(parsed.data.enveloppeBudgetaire, parsed.data.contributionRegion)) {
    res.status(400).json({ error: ERREUR_CONTRIBUTION });
    return;
  }
  for (const champ of CHAMPS_DOCUMENTS) {
    const chemin = parsed.data[champ];
    if (chemin != null && chemin.trim() !== "" && !(await documentVerifie(chemin))) {
      res.status(400).json({ error: ERREUR_DOCUMENT });
      return;
    }
  }

  const user = req.user!;
  await chargerReferentiel();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(741024, 1)`);
    const reference = await chargerReferentielDepuis(tx);
    const valeurs = versColonnes(parsed.data);
    const echeance = calculerEcheance({
      nature: valeurs.nature as string | null | undefined,
      dateVisa: valeurs.dateVisa as string | null | undefined,
      dernierComite: valeurs.dernierComite as string | null | undefined,
      frequenceReunions: valeurs.frequenceReunions as string | null | undefined,
    });
    if (echeance) valeurs.prochaineEcheance = echeance.date;
    if (
      !listeMoValide(parsed.data.maitriseOuvrage, reference) ||
      !listeMoValide(parsed.data.maitriseOuvrageDeleguee, reference) ||
      !valeurMoValide(parsed.data.porteurProjet, reference)
    ) {
      return { status: 400 as const, error: "Les maîtrises d'ouvrage doivent appartenir au référentiel courant." };
    }
    if (typeof valeurs.nomConvention !== "string" || valeurs.nomConvention === "") {
      return { status: 400 as const, error: "Le nom de la convention est obligatoire." };
    }
    if (user.role === "chef_division") {
      if (valeurs.rattachement !== undefined && valeurs.rattachement !== user.division) {
        return { status: 403 as const, error: "La convention doit rester dans votre division." };
      }
      valeurs.rattachement = user.division;
    }
    if (user.role === "chef_service") {
      const scope = perimetreChefService(reference, user);
      if (
        !scope ||
        (valeurs.rattachement !== undefined && valeurs.rattachement !== scope) ||
        (valeurs.responsableProjet !== undefined && valeurs.responsableProjet !== user.service)
      ) {
        return { status: 403 as const, error: "La convention doit rester dans votre service." };
      }
      valeurs.rattachement = scope;
      valeurs.responsableProjet = user.service;
    }
    const rattachement = valeurs.rattachement as string | null | undefined;
    const responsable = valeurs.responsableProjet as string | null | undefined;
    if (!affectationsValides(rattachement, responsable, user, reference)) {
      return { status: 400 as const, error: "Le rattachement et le service doivent correspondre à l'organigramme officiel." };
    }
    const [created] = await tx.insert(conventionsTable)
      .values({ ...valeurs, nomConvention: valeurs.nomConvention as string })
      .returning();
    if (!created) return { status: 400 as const, error: "La convention n'a pas pu être créée." };
    await tx.insert(conventionAuditTable).values({
      conventionId: created.id,
      action: "create",
      actorUsername: user.username,
      before: null,
      after: snapshot(created),
    });
    const [line] = await tx.select(colonnesConvention)
      .from(conventionsTable)
      .where(eq(conventionsTable.id, created.id));
    return line
      ? { status: 201 as const, line }
      : { status: 400 as const, error: "La convention n'a pas pu être créée." };
  });
  if (result.status !== 201) {
    res.status(result.status).json({ error: result.error });
    return;
  }
  res.status(201).json(valide(CreateConventionResponse, versApi(result.line)));
});

router.get("/conventions/:id", async (req, res): Promise<void> => {
  const params = GetConventionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const reference = await chargerReferentiel();
  const [ligne] = await db
    .select(colonnesConvention)
    .from(conventionsTable)
    .where(and(
      eq(conventionsTable.id, params.data.id),
      conditionsVisibles(req.user!, reference),
    ));

  if (!ligne) {
    res.status(404).json({ error: "Convention introuvable." });
    return;
  }

  res.json(valide(GetConventionResponse, versApi(ligne)));
});

router.get("/conventions/:id/documents/:field", async (req, res): Promise<void> => {
  const params = GetConventionParams.safeParse(req.params);
  if (!params.success) {
    res.status(404).json({ error: "Convention ou document introuvable." });
    return;
  }
  if (req.params.field !== "documentConvention" && req.params.field !== "pv") {
    res.status(404).json({ error: "Convention ou document introuvable." });
    return;
  }

  const reference = await chargerReferentiel();
  const [ligne] = await db.select().from(conventionsTable).where(and(
    eq(conventionsTable.id, params.data.id),
    isNull(conventionsTable.deletedAt),
    conditionsVisibles(req.user!, reference),
  ));
  if (!ligne) {
    res.status(404).json({ error: "Convention ou document introuvable." });
    return;
  }

  const chemin = req.params.field === "pv" ? ligne.pv : ligne.documentConvention;
  if (!chemin) {
    res.status(404).json({ error: "Convention ou document introuvable." });
    return;
  }
  const document = await documentVerifie(chemin);
  if (!document) {
    res.status(404).json({ error: "Convention ou document introuvable." });
    return;
  }

  const fichier = await objectStorageService.getObjectEntityFile(chemin);
  const nomAscii = document.name.replace(/[^A-Za-z0-9._-]/g, "_") || "document";
  const nomEncode = encodeURIComponent(document.name).replace(/[!'()*]/g, (caractere) =>
    `%${caractere.charCodeAt(0).toString(16).toUpperCase()}`);
  res.setHeader("Content-Type", document.contentType);
  res.setHeader("Content-Length", String(document.size));
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${nomAscii}"; filename*=UTF-8''${nomEncode}`,
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  fichier.createReadStream()
    .on("error", (error) => {
      req.log.error({ err: error }, "Téléchargement du document impossible");
      if (!res.headersSent) res.status(500).end();
      else res.destroy(error);
    })
    .pipe(res);
});

router.patch("/conventions/:id", async (req, res): Promise<void> => {
  if (!peutEcrire(req.user!)) {
    res.status(403).json({ error: "Ce rôle ne peut pas modifier les conventions." });
    return;
  }
  const params = UpdateConventionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const nettoye = normaliserCorps(req.body);
  if (!nettoye.ok) {
    res.status(400).json({ error: nettoye.erreur });
    return;
  }

  const parsed = UpdateConventionBody.safeParse(nettoye.valeur);
  if (!parsed.success) {
    req.log.warn({ errors: parsed.error.message }, "Mise à jour refusée");
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const valeurs = versColonnes(parsed.data);
  if ("nomConvention" in valeurs && !valeurs.nomConvention) {
    res.status(400).json({ error: "Le nom de la convention est obligatoire." });
    return;
  }

  const user = req.user!;
  await chargerReferentiel();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(741024, 1)`);
    const reference = await chargerReferentielDepuis(tx);
    const [current] = await tx.select().from(conventionsTable)
      .where(and(eq(conventionsTable.id, params.data.id), isNull(conventionsTable.deletedAt)))
      .for("update");
    if (!current || !accessible(current, user, reference)) return { status: 404 as const };
    if (current.version !== parsed.data.version) return { status: 409 as const };

    const anciennesMo = current.maitrisesOuvrage ?? (current.maitriseOuvrage ? [current.maitriseOuvrage] : []);
    const anciennesMoDeleguees = current.maitrisesOuvrageDeleguees ??
      (current.maitriseOuvrageDeleguee ? [current.maitriseOuvrageDeleguee] : []);
    if (
      !listeMoValide(parsed.data.maitriseOuvrage, reference, anciennesMo) ||
      !listeMoValide(parsed.data.maitriseOuvrageDeleguee, reference, anciennesMoDeleguees) ||
      !valeurMoValide(parsed.data.porteurProjet, reference, current.porteurProjet)
    ) {
      return { status: 400 as const, error: "Les maîtrises d'ouvrage doivent appartenir au référentiel courant." };
    }

    for (const champ of CHAMPS_DOCUMENTS) {
      if (!Object.hasOwn(parsed.data, champ)) continue;
      const valeur = parsed.data[champ];
      if (valeur == null || valeur.trim() === "" || valeur === current[champ]) continue;
      if (!(await documentVerifie(valeur))) {
        return { status: 400 as const, error: ERREUR_DOCUMENT };
      }
    }

    const enveloppeFinale = Object.hasOwn(parsed.data, "enveloppeBudgetaire")
      ? parsed.data.enveloppeBudgetaire : current.enveloppeBudgetaire;
    const contributionFinale = Object.hasOwn(parsed.data, "contributionRegion")
      ? parsed.data.contributionRegion : current.contributionRegion;
    if (contributionDepasseEnveloppe(enveloppeFinale, contributionFinale)) {
      return { status: 400 as const };
    }

    const rattachementFinal = (
      Object.hasOwn(valeurs, "rattachement") ? valeurs.rattachement : current.rattachement
    ) as string | null;
    const responsableFinal = (
      Object.hasOwn(valeurs, "responsableProjet") ? valeurs.responsableProjet : current.responsableProjet
    ) as string | null;
    if (
      (user.role === "admin" && ("rattachement" in valeurs || "responsableProjet" in valeurs) &&
        !affectationsValides(rattachementFinal, responsableFinal, user, reference)) ||
      (user.role !== "admin" && !affectationsValides(rattachementFinal, responsableFinal, user, reference))
    ) {
      return { status: 403 as const };
    }
    const valeurFinale = (champ: "nature" | "dateVisa" | "dernierComite" | "frequenceReunions") =>
      Object.hasOwn(valeurs, champ) ? valeurs[champ] as string | null : current[champ];
    const echeanceAvant = calculerEcheance(current);
    const echeance = calculerEcheance({
      nature: valeurFinale("nature"),
      dateVisa: valeurFinale("dateVisa"),
      dernierComite: valeurFinale("dernierComite"),
      frequenceReunions: valeurFinale("frequenceReunions"),
    });
    const champsDeterminants = valeurFinale("dernierComite")
      ? (["dernierComite", "frequenceReunions"] as const)
      : (["dernierComite", "nature", "dateVisa"] as const);
    const sourcesChangees = champsDeterminants
      .some((champ) => Object.hasOwn(valeurs, champ) && valeurs[champ] !== current[champ]);
    if (
      echeance &&
      (sourcesChangees || !current.prochaineEcheance || current.prochaineEcheance === echeance.date)
    ) {
      // Une ancienne date manuelle différente du calcul est conservée tant que
      // ni la date de base, ni la fréquence, ni la nature n'ont changé.
      valeurs.prochaineEcheance = echeance.date;
    } else if (
      echeanceAvant &&
      current.prochaineEcheance === echeanceAvant.date &&
      !Object.hasOwn(valeurs, "prochaineEcheance") &&
      sourcesChangees
    ) {
      // Si l'ancien calcul n'est plus possible, ne pas laisser une ancienne
      // échéance automatique passer pour une date saisie manuellement.
      valeurs.prochaineEcheance = null;
    }
    const [updated] = await tx.update(conventionsTable)
      .set({ ...valeurs, version: current.version + 1, updatedAt: new Date() })
      .where(and(
        eq(conventionsTable.id, params.data.id),
        eq(conventionsTable.version, parsed.data.version),
        isNull(conventionsTable.deletedAt),
      ))
      .returning();
    if (!updated) return { status: 409 as const };
    await tx.insert(conventionAuditTable).values({
      conventionId: updated.id,
      action: "update",
      actorUsername: user.username,
      before: snapshot(current),
      after: snapshot(updated),
    });
    const [line] = await tx.select(colonnesConvention).from(conventionsTable)
      .where(eq(conventionsTable.id, updated.id));
    return line ? { status: 200 as const, line } : { status: 404 as const };
  });
  if (result.status === 404) {
    res.status(404).json({ error: "Convention introuvable." });
    return;
  }
  if (result.status === 403) {
    res.status(403).json({ error: "Affectation non autorisée pour votre périmètre." });
    return;
  }
  if (result.status === 400) {
    res.status(400).json({ error: result.error ?? ERREUR_CONTRIBUTION });
    return;
  }
  if (result.status === 409) {
    res.status(409).json({ error: "La convention a été modifiée entre-temps. Rechargez-la avant de réessayer." });
    return;
  }
  res.json(valide(UpdateConventionResponse, versApi(result.line)));
});

router.delete("/conventions/:id", async (req, res): Promise<void> => {
  if (!peutEcrire(req.user!)) {
    res.status(403).json({ error: "Ce rôle ne peut pas supprimer les conventions." });
    return;
  }
  const params = DeleteConventionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const version = Number(req.query.version);
  if (!Number.isSafeInteger(version) || version < 1) {
    res.status(400).json({ error: "Le paramètre version est obligatoire." });
    return;
  }
  await chargerReferentiel();
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(741024, 1)`);
    const reference = await chargerReferentielDepuis(tx);
    const [current] = await tx.select().from(conventionsTable)
      .where(and(eq(conventionsTable.id, params.data.id), isNull(conventionsTable.deletedAt)))
      .for("update");
    if (!current || !accessible(current, req.user!, reference)) return "missing" as const;
    if (current.version !== version) return "stale" as const;
    const [removed] = await tx.update(conventionsTable).set({
      deletedAt: new Date(),
      updatedAt: new Date(),
      version: current.version + 1,
    }).where(and(
      eq(conventionsTable.id, params.data.id),
      eq(conventionsTable.version, version),
      isNull(conventionsTable.deletedAt),
    )).returning();
    if (!removed) return "stale" as const;
    await tx.insert(conventionAuditTable).values({
      conventionId: removed.id,
      action: "delete",
      actorUsername: req.user!.username,
      before: snapshot(current),
      after: snapshot(removed),
    });
    return "deleted" as const;
  });
  if (result === "missing") {
    res.status(404).json({ error: "Convention introuvable." });
    return;
  }
  if (result === "stale") {
    res.status(409).json({ error: "La convention a été modifiée entre-temps. Rechargez-la avant de réessayer." });
    return;
  }

  res.sendStatus(204);
});

export default router;
