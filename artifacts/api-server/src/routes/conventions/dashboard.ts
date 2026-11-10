import { Router, type IRouter } from "express";
import { and, asc, count, gte, isNotNull, lte, sql } from "drizzle-orm";
import { db, conventionsTable } from "@workspace/db";
import {
  GetAgendaQueryParams,
  GetAgendaResponse,
  GetResumeAlertesResponse,
  ListAlertesQueryParams,
  ListAlertesResponse,
} from "@workspace/api-zod";
import { conditionsVisibles } from "../../lib/convention-access";
import {
  META_ALERTES,
  NIVEAUX_ALERTE,
  niveauAlerteSql,
  rangUrgenceSql,
  type NiveauAlerte,
} from "../../lib/alertes";
import { colonnesConvention, versApi } from "../../lib/conventions-mapper";
import { chargerReferentiel } from "../../lib/reference-data";
import { valide } from "./commun";

const router: IRouter = Router();

const periodeSessionSql = sql<string>`CASE
  WHEN ${conventionsTable.session} IS NULL THEN 'sansDate'
  WHEN ${conventionsTable.session} < DATE '2021-01-01' THEN 'avant2021'
  WHEN ${conventionsTable.session} < DATE '2027-01-01' THEN 'de2021A2026'
  ELSE 'apres2026'
END`;

router.get("/conventions/resume", async (req, res): Promise<void> => {
  const reference = await chargerReferentiel();
  const visible = conditionsVisibles(req.user!, reference);
  const [repartition, [prochaine], jourCourant, synthesesParStatut, synthesesParSession] = await Promise.all([
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
    db
      .select({
        statut: conventionsTable.statutConvention,
        nombre: count(),
        montantGlobal: sql<string>`coalesce(sum(${conventionsTable.enveloppeBudgetaire}), 0)`,
        contributionRegionTotale: sql<string>`coalesce(sum(${conventionsTable.contributionRegion}), 0)`,
      })
      .from(conventionsTable)
      .where(visible)
      .groupBy(conventionsTable.statutConvention),
    db
      .select({
        periode: periodeSessionSql,
        total: count(),
        montantGlobal: sql<string>`coalesce(sum(${conventionsTable.enveloppeBudgetaire}), 0)`,
        contributionRegionTotale: sql<string>`coalesce(sum(${conventionsTable.contributionRegion}), 0)`,
      })
      .from(conventionsTable)
      .where(visible)
      .groupBy(periodeSessionSql),
  ]);

  const syntheseVide = () => ({
    total: 0,
    montantGlobal: 0,
    contributionRegionTotale: 0,
  });
  const montants = syntheseVide();
  const parStatut = {
    enCours: syntheseVide(),
    arriveesATerme: syntheseVide(),
  };
  for (const ligne of synthesesParStatut) {
    const statut = (ligne.statut ?? "").trim().toLocaleLowerCase("fr")
      .normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/’/g, "'");
    const groupe = statut === "en cours" || statut === "en cours d'execution"
      ? parStatut.enCours
      : statut === "arrivee a terme" || statut === "arrivees a terme"
        ? parStatut.arriveesATerme
        : undefined;
    const valeurs = {
      total: ligne.nombre,
      montantGlobal: Number(ligne.montantGlobal),
      contributionRegionTotale: Number(ligne.contributionRegionTotale),
    };
    for (const destination of groupe ? [montants, groupe] : [montants]) {
      destination.total += valeurs.total;
      destination.montantGlobal += valeurs.montantGlobal;
      destination.contributionRegionTotale += valeurs.contributionRegionTotale;
    }
  }

  const periodeVide = () => ({
    total: 0,
    montantGlobal: 0,
    contributionRegionTotale: 0,
  });
  const parSession = {
    avant2021: periodeVide(),
    de2021A2026: periodeVide(),
    sansDate: periodeVide(),
    apres2026: periodeVide(),
  };
  for (const ligne of synthesesParSession) {
    const key = ligne.periode as keyof typeof parSession;
    if (!(key in parSession)) continue;
    parSession[key] = {
      total: ligne.total,
      montantGlobal: Number(ligne.montantGlobal),
      contributionRegionTotale: Number(ligne.contributionRegionTotale),
    };
  }

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
      montantGlobal: Number(montants.montantGlobal),
      contributionRegionTotale: Number(montants.contributionRegionTotale),
      parStatut,
      parSession,
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
    res.status(400).json({ error: "Paramètres des alertes invalides." });
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
    res.status(400).json({ error: "Paramètres de l’agenda invalides." });
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

export default router;
