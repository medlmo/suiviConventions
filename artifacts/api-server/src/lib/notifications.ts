import { isDeepStrictEqual } from "node:util";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db, notificationsTable, usersTable, type Convention } from "@workspace/db";
import { DIRECTION_GENERALE_SERVICES } from "@workspace/organisation";
import type { SessionUser } from "./auth";
import { divisionDeDirection, perimetreChefService, type ReferenceData } from "./reference-data";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const GROUP_WINDOW_MS = 10 * 60 * 1000;

const FIELD_LABELS: Partial<Record<keyof Convention, string>> = {
  nomConvention: "Nom de la convention", objetConventionFr: "Objet de la convention",
  rattachement: "Rattachement", responsableProjet: "Service responsable",
  typeSession: "Type de session", session: "Session", dateVisa: "Date de visa",
  statutConvention: "Statut", decision: "Décision", competence: "Compétence", nature: "Nature du projet",
  provincesPrefectures: "Provinces / préfectures", communes: "Communes",
  presidenceComite: "Présidence du comité", membresComite: "Membres du comité",
  frequenceReunions: "Fréquence des réunions", dernierComite: "Dernier comité",
  datePvComite: "Date du PV", dernierComiteNote: "Mention du dernier comité",
  prochainComite: "Prochain comité", prochaineEcheance: "Prochaine échéance",
  prochaineEcheanceNote: "Mention de l'échéance", pv: "Documents",
  enveloppeBudgetaire: "Enveloppe budgétaire", contributionRegion: "Contribution de la Région",
  natureFonds: "Nature des fonds", porteurProjet: "Porteur de projet",
  maitrisesOuvrage: "Maîtrise d'ouvrage", maitrisesOuvrageDeleguees: "Maîtrise d'ouvrage déléguée",
  partenaires: "Partenaires", suiviFinancier: "Montage financier",
  situationVersements: "Situation des versements", avancementPhysiqueHistorique: "Avancement physique",
  documentConvention: "Documents", documents: "Documents", commentaires: "Commentaires",
};

const IMPORTANT_FIELDS = new Set<keyof Convention>([
  "rattachement", "responsableProjet", "typeSession", "session", "dateVisa", "statutConvention",
  "decision", "competence", "nature", "provincesPrefectures", "communes",
  "frequenceReunions", "dernierComite", "datePvComite", "prochainComite", "prochaineEcheance",
  "enveloppeBudgetaire", "contributionRegion", "natureFonds", "porteurProjet",
  "maitrisesOuvrage", "maitrisesOuvrageDeleguees", "partenaires", "suiviFinancier",
  "situationVersements", "avancementPhysiqueHistorique", "documentConvention", "documents", "pv",
]);
const MULTI_FIELDS = new Set<keyof Convention>([
  "provincesPrefectures", "communes", "maitrisesOuvrage", "maitrisesOuvrageDeleguees", "partenaires",
]);

export function changementsNotification(before: Convention | null, after: Convention) {
  if (!before) return { kind: "creation" as const, changedFields: [] as string[] };
  const keys = (Object.keys(FIELD_LABELS) as (keyof Convention)[]).filter((key) => {
    const normaliser = (value: unknown) => MULTI_FIELDS.has(key)
      ? [...((value ?? []) as string[])].sort()
      : value;
    return !isDeepStrictEqual(normaliser(before[key]), normaliser(after[key]));
  });
  return {
    kind: keys.some((key) => IMPORTANT_FIELDS.has(key)) ? "important" as const : "minor" as const,
    changedFields: [...new Set(keys.map((key) => FIELD_LABELS[key]!))],
  };
}

export function estDestinataire(
  user: SessionUser, actor: SessionUser, convention: Convention, reference: ReferenceData,
): boolean {
  if (!user.active || user.id === actor.id) return false;
  const division = reference.organisation.flatMap((direction) =>
    direction.divisions.map((item) => ({ ...item, direction: direction.direction })),
  ).find((item) => item.nom === convention.rattachement);
  const directDgs = convention.rattachement === DIRECTION_GENERALE_SERVICES &&
    (!convention.responsableProjet ||
      reference.servicesDgs.some((service) => service.nom === convention.responsableProjet));
  const responsibleDirection = user.role === "directeur" &&
    reference.organisation.some((direction) =>
      direction.direction === convention.rattachement && direction.direction === user.direction);
  const responsibleService = user.role === "chef_service" &&
    !!user.service && !!convention.rattachement &&
    user.service === convention.responsableProjet &&
    perimetreChefService(reference, user) === convention.rattachement;
  const responsibleDivision = user.role === "chef_division" && !!division &&
    user.division === division.nom && user.direction === division.direction &&
    divisionDeDirection(reference, user.direction, user.division);

  if (actor.role === "chef_service") {
    return directDgs ? user.role === "directeur_general_services" : responsibleDivision;
  }
  if (actor.role === "chef_division") {
    return responsibleService || (user.role === "directeur" && !!division && user.direction === division.direction);
  }
  if (actor.role === "admin") {
    return responsibleService || responsibleDivision || responsibleDirection ||
      (directDgs && user.role === "directeur_general_services");
  }
  return false;
}

/** Persisted in the convention's transaction: never announce a failed save. */
export async function notifierChangementConvention(
  tx: Transaction, actor: SessionUser, before: Convention | null, after: Convention, reference: ReferenceData,
): Promise<void> {
  const change = changementsNotification(before, after);
  if (before && change.changedFields.length === 0) return;
  const users = await tx.select({
    id: usersTable.id, username: usersTable.username, active: usersTable.active, role: usersTable.role,
    direction: usersTable.direction, division: usersTable.division, service: usersTable.service,
  }).from(usersTable).where(eq(usersTable.active, true));
  const recipients = users.filter((user) => estDestinataire(user, actor, after, reference))
    .sort((a, b) => a.id - b.id);
  for (const recipient of recipients) {
    // Also used by read operations: concurrent corrections cannot be merged into a read item.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(741025, ${recipient.id})`);
    const now = new Date();
    if (change.kind === "minor") {
      const [pending] = await tx.select().from(notificationsTable).where(and(
        eq(notificationsTable.recipientId, recipient.id),
        eq(notificationsTable.actorId, actor.id),
        eq(notificationsTable.conventionId, after.id),
        eq(notificationsTable.kind, "minor"),
        isNull(notificationsTable.readAt),
        gte(notificationsTable.createdAt, new Date(now.getTime() - GROUP_WINDOW_MS)),
      )).limit(1);
      if (pending) {
        await tx.update(notificationsTable).set({
          changedFields: [...new Set([...pending.changedFields, ...change.changedFields])],
          eventCount: pending.eventCount + 1,
          updatedAt: now,
        }).where(eq(notificationsTable.id, pending.id));
        continue;
      }
    }
    await tx.insert(notificationsTable).values({
      recipientId: recipient.id, conventionId: after.id,
      actorId: actor.id, actorUsername: actor.username,
      kind: change.kind, changedFields: change.changedFields,
      createdAt: now, updatedAt: now,
    });
  }
}

export function resumeNotification(kind: string, fields: string[], eventCount: number): string {
  if (kind === "creation") return "Nouvelle convention créée.";
  const detail = fields.slice(0, 6).join(", ") +
    (fields.length > 6 ? ` et ${fields.length - 6} autre(s) champ(s)` : "");
  if (kind === "important") return `Modification importante : ${detail}.`;
  return eventCount > 1
    ? `${eventCount} enregistrements regroupés sur 10 minutes : ${detail}.`
    : `Correction : ${detail}.`;
}
