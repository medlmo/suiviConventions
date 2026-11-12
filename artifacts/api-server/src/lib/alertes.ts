import { sql, type SQL } from "drizzle-orm";

/**
 * Calcul du statut d'alerte — reprise exacte de l'onglet « Référentiel » du
 * fichier Excel d'origine.
 *
 * Le niveau est calculé en SQL (et non en TypeScript) pour une raison précise :
 * la liste doit pouvoir être filtrée, triée par urgence et paginée par la base.
 * Calculer côté application obligerait à charger toutes les lignes avant de
 * paginer, et ferait diverger le tri de l'affichage.
 *
 * Rien n'est jamais stocké : chaque requête compare à CURRENT_DATE.
 */

export const NIVEAUX_ALERTE = [
  "EN_RETARD",
  "A_DECLENCHER",
  "A_PREPARER",
  "TENU",
  "A_JOUR",
  "A_SURVEILLER",
  "A_QUALIFIER",
] as const;

export type NiveauAlerte = (typeof NIVEAUX_ALERTE)[number];

/** Niveaux présentés dans les compteurs du dashboard; A_JOUR reste neutre. */
export const NIVEAUX_COMPTEURS: readonly NiveauAlerte[] = [
  "EN_RETARD",
  "A_DECLENCHER",
  "A_PREPARER",
  "TENU",
  "A_SURVEILLER",
  "A_QUALIFIER",
];

export type CouleurAlerte = "rouge" | "orange" | "jaune" | "vert" | "gris";

interface MetaAlerte {
  libelle: string;
  action: string;
  couleur: CouleurAlerte;
}

export const META_ALERTES: Record<NiveauAlerte, MetaAlerte> = {
  EN_RETARD: {
    libelle: "Hors échéance",
    action: "Organiser / régulariser immédiatement",
    couleur: "rouge",
  },
  A_DECLENCHER: {
    libelle: "À tenir entre 0 et 30 jours",
    action: "Préparer convocation et pièces",
    couleur: "orange",
  },
  A_PREPARER: {
    libelle: "À tenir entre 31 et 60 jours",
    action: "Anticiper avec le responsable",
    couleur: "jaune",
  },
  TENU: {
    libelle: "Tenus",
    action: "Le dernier comité a respecté l’échéance précédente.",
    couleur: "vert",
  },
  A_JOUR: {
    libelle: "Sans échéance prioritaire",
    action: "Aucune action immédiate",
    couleur: "vert",
  },
  A_SURVEILLER: {
    libelle: "Fréquence conditionnelle",
    action: "Vérifier le déclencheur / la clause",
    couleur: "gris",
  },
  A_QUALIFIER: {
    libelle: "Échéance non renseignée",
    action: "Donnée manquante, à compléter",
    couleur: "gris",
  },
};

/**
 * Fréquences décrivant un déclenchement conditionnel plutôt qu'une périodicité.
 * Majoritairement en arabe dans les données réelles :
 *   « كلما دعت الضرورة إلى ذلك » — chaque fois que la nécessité l'exige
 *   « عند الحاجة » / « عند الاقتضاء » — en cas de besoin
 * Une convention sans échéance mais avec ce type de clause est « Fréquence conditionnelle »
 * (il faut vérifier le déclencheur), pas « Échéance non renseignée » (donnée manquante).
 */
const MOTIFS_CONDITIONNELS = [
  "الضرورة",
  "الحاجة",
  "الاقتضاء",
  "كلما",
  "si besoin",
  "au besoin",
  "en cas de besoin",
  "selon les besoins",
  "à la demande",
  "sur demande",
].join("|");

/**
 * Le motif est injecté littéralement, pas en paramètre lié.
 *
 * Avec un paramètre, la même expression apparaît sous des numéros différents
 * dans le SELECT et dans le GROUP BY ; Postgres ne les reconnaît alors plus
 * comme identiques et rejette la requête des compteurs. Le motif est une
 * constante du code, sans donnée utilisateur.
 */
const MOTIFS_CONDITIONNELS_SQL = sql.raw(`'${MOTIFS_CONDITIONNELS}'`);

/**
 * Vrai uniquement si l'historique prouve que la date du dernier comité,
 * enregistrée lors d'une modification, ne dépasse pas l'échéance qui la
 * précédait. Les dossiers sans cette preuve ne sont pas classés « Tenu ».
 */
const dernierComiteRespecteEcheanceSql = sql<boolean>`
  (
    SELECT CASE
      WHEN convention_audit.before->>'prochaineEcheance' IS NULL THEN FALSE
      ELSE
        (convention_audit.after->>'dernierComite')::date
        <= (convention_audit.before->>'prochaineEcheance')::date
    END
    FROM convention_audit
    WHERE convention_audit.convention_id = conventions.id
      AND convention_audit.action = 'update'
      AND convention_audit.after->>'dernierComite' = conventions.dernier_comite::text
      AND convention_audit.after->>'dernierComite'
        IS DISTINCT FROM convention_audit.before->>'dernierComite'
    ORDER BY convention_audit.created_at DESC, convention_audit.id DESC
    LIMIT 1
  ) IS TRUE
`;

/** Niveau d'alerte recalculé par rapport à la date du jour. */
export const niveauAlerteSql: SQL<NiveauAlerte> = sql<NiveauAlerte>`
  CASE
    WHEN conventions.prochaine_echeance IS NOT NULL THEN
      CASE
        WHEN conventions.prochaine_echeance < CURRENT_DATE THEN 'EN_RETARD'
        WHEN conventions.prochaine_echeance <= CURRENT_DATE + 30 THEN 'A_DECLENCHER'
        WHEN conventions.prochaine_echeance <= CURRENT_DATE + 60 THEN 'A_PREPARER'
        WHEN ${dernierComiteRespecteEcheanceSql} THEN 'TENU'
        ELSE 'A_JOUR'
      END
    WHEN COALESCE(conventions.frequence_reunions, '') ~* ${MOTIFS_CONDITIONNELS_SQL} THEN 'A_SURVEILLER'
    ELSE 'A_QUALIFIER'
  END
`;

/** Jours avant l'échéance : négatif si dépassée, NULL si aucune échéance. */
export const joursRestantsSql: SQL<number | null> = sql<number | null>`
  (conventions.prochaine_echeance - CURRENT_DATE)
`;

/**
 * Rang d'urgence pour le tri par défaut : les échéances dépassées d'abord, les dossiers
 * sans échéance en dernier.
 */
export const rangUrgenceSql: SQL<number> = sql<number>`
  CASE
    WHEN conventions.prochaine_echeance IS NOT NULL THEN
      CASE
        WHEN conventions.prochaine_echeance < CURRENT_DATE THEN 0
        WHEN conventions.prochaine_echeance <= CURRENT_DATE + 30 THEN 1
        WHEN conventions.prochaine_echeance <= CURRENT_DATE + 60 THEN 2
        ELSE 3
      END
    WHEN COALESCE(conventions.frequence_reunions, '') ~* ${MOTIFS_CONDITIONNELS_SQL} THEN 4
    ELSE 5
  END
`;

export function construireAlerte(
  niveau: NiveauAlerte,
  joursRestants: number | null,
): {
  niveau: NiveauAlerte;
  libelle: string;
  action: string;
  couleur: CouleurAlerte;
  joursRestants: number | null;
} {
  const meta = META_ALERTES[niveau];
  return {
    niveau,
    libelle: meta.libelle,
    action: meta.action,
    couleur: meta.couleur,
    joursRestants,
  };
}
