import { isDeepStrictEqual } from "node:util";
import type { Convention } from "@workspace/db";
import { DIRECTION_GENERALE_SERVICES } from "@workspace/organisation";

type SessionUser = {
  id: number; active: boolean; role: string;
  direction: string | null; division: string | null; service: string | null;
};
type ReferenceData = {
  organisation: {
    direction: string;
    divisions: { nom: string; services: { nom: string }[] }[];
  }[];
  servicesDgs: { nom: string }[];
};

function divisionDansDirection(reference: ReferenceData, direction: string, division: string): boolean {
  return reference.organisation.some((entry) =>
    entry.direction === direction && entry.divisions.some((item) => item.nom === division));
}

function serviceDansDivision(reference: ReferenceData, division: string, service: string): boolean {
  return reference.organisation.some((entry) =>
    entry.divisions.some((item) =>
      item.nom === division && item.services.some((candidate) => candidate.nom === service)));
}

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
  const scope = user.role !== "chef_service" || !user.service ? null
    : !user.direction && !user.division
      ? reference.servicesDgs.some((item) => item.nom === user.service) ? DIRECTION_GENERALE_SERVICES : null
      : user.direction && user.division &&
        divisionDansDirection(reference, user.direction, user.division) &&
        serviceDansDivision(reference, user.division, user.service) ? user.division : null;
  const responsibleService = user.role === "chef_service" &&
    !!user.service && !!convention.rattachement &&
    user.service === convention.responsableProjet &&
    scope === convention.rattachement;
  const responsibleDivision = user.role === "chef_division" && !!division &&
    user.division === division.nom && user.direction === division.direction &&
    divisionDansDirection(reference, user.direction, user.division);

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

export function resumeNotification(kind: string, fields: string[], eventCount: number): string {
  if (kind === "creation") return "Nouvelle convention créée.";
  const detail = fields.slice(0, 6).join(", ") +
    (fields.length > 6 ? ` et ${fields.length - 6} autre(s) champ(s)` : "");
  if (kind === "important") return `Modification importante : ${detail}.`;
  return eventCount > 1
    ? `${eventCount} enregistrements regroupés sur 10 minutes : ${detail}.`
    : `Correction : ${detail}.`;
}
