/**
 * Organigramme fourni pour les conventions : une direction regroupe des
 * divisions, et chaque division détermine les services possibles.
 */
export const organisation = [
  {
    direction: "Direction des Affaires Financières, Territoriales et des Ressources",
    divisions: [
      {
        nom: "Division des Ressources Humaines et des Moyens Généraux",
        services: [
          "Service de la Formation et du Développement des Compétences",
          "Service des Moyens Généraux",
          "Service de la Gestion Administrative des Ressources Humaines",
        ],
      },
      {
        nom: "Division des Affaires Financières, du Budget et de la Programmation",
        services: [
          "Service de la Commande Publique",
          "Service du Patrimoine et des Ressources Financières",
          "Service du Budget et de la Comptabilité",
        ],
      },
      {
        nom: "Division de l'Aménagement et du Développement Territorial",
        services: [
          "Service des Travaux et de l'Aménagement",
          "Service de la Transition Numérique et de la Gestion Documentaire",
          "Service de la Planification et de l'Ingénierie des Projets",
        ],
      },
    ],
  },
  {
    direction: "Direction des Affaires Économiques, Sociales et du Développement Durable",
    divisions: [
      {
        nom: "Division de l'Inclusion Sociale et Solidaire",
        services: [
          "Service de l'Économie Sociale et Solidaire",
          "Service de l'Inclusion Sociale",
          "Service des Activités Culturelles et Sportives",
        ],
      },
      {
        nom: "Division du Développement Économique et des Secteurs Stratégiques",
        services: [
          "Service de la Transition Économique et de l'Innovation",
          "Service de l'Appui aux Entreprises et de la Promotion de l'Investissement",
          "Service de la Promotion des Secteurs Stratégiques",
          "Service de l'Environnement et des Énergies Renouvelables",
        ],
      },
    ],
  },
] as const;

export function rattachementConnu(valeur: string | null | undefined): boolean {
  if (!valeur) return false;
  return organisation.some(
    ({ direction, divisions }) =>
      direction === valeur || divisions.some(({ nom }) => nom === valeur),
  );
}

export function servicesDeDivision(rattachement: string | null | undefined): readonly string[] {
  if (!rattachement) return [];
  for (const direction of organisation) {
    const division = direction.divisions.find(({ nom }) => nom === rattachement);
    if (division) return division.services;
  }
  return [];
}