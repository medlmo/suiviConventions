import { Router, type IRouter } from "express";
import { and, asc, count, desc, eq, gte, isNotNull, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db, conventionsTable } from "@workspace/db";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
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

const router: IRouter = Router();

const CHAMPS_DATE_CORPS = [
  "dateVisa",
  "prochainComite",
  "dernierComite",
  "prochaineEcheance",
] as const;

const CHAMPS_MONTANT_CORPS = ["enveloppeBudgetaire", "contributionRegion"] as const;

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
      conventionsTable.responsableProjet,
      conventionsTable.maitriseOuvrage,
      conventionsTable.maitriseOuvrageDeleguee,
      conventionsTable.presidenceComite,
      conventionsTable.membresComite,
      conventionsTable.frequenceReunions,
      conventionsTable.commentaires,
      conventionsTable.pv,
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
  const where = construireFiltres(filtres);

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

router.get("/conventions/resume", async (_req, res): Promise<void> => {
  const [repartition, [prochaine], jourCourant] = await Promise.all([
    db
      .select({ niveau: niveauAlerteSql, nombre: count() })
      .from(conventionsTable)
      .groupBy(niveauAlerteSql),
    db
      .select({ date: conventionsTable.prochaineEcheance })
      .from(conventionsTable)
      .where(gte(conventionsTable.prochaineEcheance, sql`CURRENT_DATE`))
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

  const lignes = await db
    .select(colonnesConvention)
    .from(conventionsTable)
    .where(
      and(
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

  const lignes = await db
    .select(colonnesConvention)
    .from(conventionsTable)
    .where(
      and(
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

router.get("/conventions/options-filtres", async (_req, res): Promise<void> => {
  async function valeursDistinctes(colonne: AnyPgColumn) {
    const lignes = await db
      .selectDistinct({ valeur: colonne })
      .from(conventionsTable)
      .where(and(isNotNull(colonne), sql`btrim(${colonne}) <> ''`))
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
 * Export CSV des données filtrées — volontairement hors contrat OpenAPI :
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

  const lignes = await db
    .select(colonnesConvention)
    .from(conventionsTable)
    .where(construireFiltres(filtres))
    .orderBy(...construireTri(tri, ordre));

  const colonnes: [string, (c: ReturnType<typeof versApi>) => unknown][] = [
    ["Convention visée", (c) => c.nomConvention],
    ["Statut d'alerte", (c) => c.alerte.libelle],
    ["Action à mener", (c) => c.alerte.action],
    ["Jours restants", (c) => c.alerte.joursRestants],
    ["Rattachement", (c) => c.rattachement],
    ["Responsable du projet", (c) => c.responsableProjet],
    ["Session", (c) => c.session],
    ["Date de visa", (c) => c.dateVisa],
    ["Présidence du comité", (c) => c.presidenceComite],
    ["Membres du comité", (c) => c.membresComite],
    ["Fréquence des réunions", (c) => c.frequenceReunions],
    ["Enveloppe budgétaire (MAD)", (c) => c.enveloppeBudgetaire],
    ["Contribution de la Région (MAD)", (c) => c.contributionRegion],
    ["Nature des fonds", (c) => c.natureFonds],
    ["Maîtrise d'ouvrage", (c) => c.maitriseOuvrage],
    ["Maîtrise d'ouvrage déléguée", (c) => c.maitriseOuvrageDeleguee],
    ["Dernier comité", (c) => c.dernierComite],
    ["Dernier comité (mention)", (c) => c.dernierComiteNote],
    ["Prochain comité", (c) => c.prochainComite],
    ["Prochaine échéance", (c) => c.prochaineEcheance],
    ["Prochaine échéance (mention)", (c) => c.prochaineEcheanceNote],
    ["PV", (c) => c.pv],
    ["Décision", (c) => c.decision],
    ["Convention (document)", (c) => c.documentConvention],
    ["Fiche technique", (c) => c.ficheTechnique],
    ["Statut de la convention", (c) => c.statutConvention],
    ["Commentaires", (c) => c.commentaires],
  ];

  function echapper(valeur: unknown): string {
    if (valeur === null || valeur === undefined) return "";
    let texte = String(valeur);
    // Les champs sont librement éditables : un contenu commençant par =, +, -
    // ou @ serait interprété comme une formule à l'ouverture dans Excel. On
    // préfixe d'une apostrophe, qui force le mode texte sans s'afficher.
    if (/^[=+\-@\t\r]/.test(texte)) {
      texte = `'${texte}`;
    }
    return `"${texte.replace(/"/g, '""')}"`;
  }

  const enTete = colonnes.map(([titre]) => echapper(titre)).join(";");
  const corps = lignes
    .map(versApi)
    .map((convention) =>
      colonnes.map(([, extraire]) => echapper(extraire(convention))).join(";"),
    );

  // Le BOM UTF-8 est indispensable : sans lui, Excel ouvre le fichier en
  // ANSI et tous les titres arabes deviennent illisibles.
  const csv = `\uFEFF${[enTete, ...corps].join("\r\n")}\r\n`;
  const horodatage = new Date().toISOString().slice(0, 10);

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="conventions-${horodatage}.csv"`,
  );
  res.send(csv);
});

router.post("/conventions", async (req, res): Promise<void> => {
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

  const valeurs = versColonnes(parsed.data);
  if (typeof valeurs.nomConvention !== "string" || valeurs.nomConvention === "") {
    res.status(400).json({ error: "Le nom de la convention est obligatoire." });
    return;
  }

  const [creee] = await db
    .insert(conventionsTable)
    .values({ ...valeurs, nomConvention: valeurs.nomConvention })
    .returning({ id: conventionsTable.id });

  if (!creee) {
    res.status(400).json({ error: "La convention n'a pas pu être créée." });
    return;
  }

  const [ligne] = await db
    .select(colonnesConvention)
    .from(conventionsTable)
    .where(eq(conventionsTable.id, creee.id));

  res.status(201).json(valide(CreateConventionResponse, versApi(ligne!)));
});

router.get("/conventions/:id", async (req, res): Promise<void> => {
  const params = GetConventionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [ligne] = await db
    .select(colonnesConvention)
    .from(conventionsTable)
    .where(eq(conventionsTable.id, params.data.id));

  if (!ligne) {
    res.status(404).json({ error: "Convention introuvable." });
    return;
  }

  res.json(valide(GetConventionResponse, versApi(ligne)));
});

router.patch("/conventions/:id", async (req, res): Promise<void> => {
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

  if (Object.keys(valeurs).length > 0) {
    const [misAJour] = await db
      .update(conventionsTable)
      .set(valeurs)
      .where(eq(conventionsTable.id, params.data.id))
      .returning({ id: conventionsTable.id });

    if (!misAJour) {
      res.status(404).json({ error: "Convention introuvable." });
      return;
    }
  }

  // Relecture obligatoire : le statut d'alerte renvoyé doit refléter les
  // nouvelles dates, c'est ce qui permet au client de l'afficher à jour
  // immédiatement après l'enregistrement.
  const [ligne] = await db
    .select(colonnesConvention)
    .from(conventionsTable)
    .where(eq(conventionsTable.id, params.data.id));

  if (!ligne) {
    res.status(404).json({ error: "Convention introuvable." });
    return;
  }

  res.json(valide(UpdateConventionResponse, versApi(ligne)));
});

router.delete("/conventions/:id", async (req, res): Promise<void> => {
  const params = DeleteConventionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [supprimee] = await db
    .delete(conventionsTable)
    .where(eq(conventionsTable.id, params.data.id))
    .returning({ id: conventionsTable.id });

  if (!supprimee) {
    res.status(404).json({ error: "Convention introuvable." });
    return;
  }

  res.sendStatus(204);
});

export default router;
