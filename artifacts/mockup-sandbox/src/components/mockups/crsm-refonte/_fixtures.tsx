import { forwardRef, type AnchorHTMLAttributes } from "react";

// Données d'illustration communes à toutes les maquettes. Aucun accès à l'API.
export type AlerteCouleur = "rouge" | "orange" | "jaune" | "vert" | "gris";
export type Alerte = {
  niveau: string;
  libelle: string;
  couleur: AlerteCouleur;
  joursRestants: number | null;
};
export type Convention = {
  id: number;
  nomConvention: string;
  rattachement: string;
  prochaineEcheance: string;
  alerte: Alerte;
};
export type ResumeAlertes = {
  dateCalcul: string;
  total: number;
  montantGlobal: number;
  contributionRegionTotale: number;
  compteurs: { niveau: string; libelle: string; couleur: AlerteCouleur; nombre: number }[];
};

export const resumeDemo: ResumeAlertes = {
  dateCalcul: "2026-10-28",
  total: 230,
  montantGlobal: 1842560000,
  contributionRegionTotale: 624850000,
  compteurs: [
    { niveau: "EN_RETARD", libelle: "En retard", couleur: "rouge", nombre: 12 },
    { niveau: "A_DECLENCHER", libelle: "À déclencher", couleur: "orange", nombre: 18 },
    { niveau: "A_PREPARER", libelle: "À préparer", couleur: "jaune", nombre: 26 },
    { niveau: "A_JOUR", libelle: "À jour", couleur: "vert", nombre: 142 },
    { niveau: "A_SURVEILLER", libelle: "À surveiller", couleur: "gris", nombre: 20 },
    { niveau: "A_QUALIFIER", libelle: "À qualifier", couleur: "gris", nombre: 12 },
  ],
};

const alerte = (index: number, jours: number): Alerte => {
  const { niveau, libelle, couleur } = resumeDemo.compteurs[index]!;
  return { niveau, libelle, couleur, joursRestants: jours };
};

export const conventionsDemo: Convention[] = [
  {
    id: 1,
    nomConvention: "اتفاقية شراكة لتهيئة وتأهيل الطرق والمسالك القروية",
    rattachement: "Direction des infrastructures",
    prochaineEcheance: "2026-10-04",
    alerte: alerte(0, -24),
  },
  {
    id: 2,
    nomConvention: "اتفاقية لدعم مشاريع الاقتصاد الاجتماعي والتضامني",
    rattachement: "Direction du développement économique",
    prochaineEcheance: "2026-10-12",
    alerte: alerte(0, -16),
  },
  {
    id: 3,
    nomConvention: "اتفاقية شراكة لإنجاز وتجهيز المراكز الصحية",
    rattachement: "Direction du développement social",
    prochaineEcheance: "2026-10-25",
    alerte: alerte(0, -3),
  },
  {
    id: 4,
    nomConvention: "اتفاقية للمحافظة على الموارد المائية بالجهة",
    rattachement: "Direction de l'environnement",
    prochaineEcheance: "2026-11-02",
    alerte: alerte(1, 5),
  },
  {
    id: 5,
    nomConvention: "اتفاقية دعم التكوين والإدماج المهني للشباب",
    rattachement: "Direction du développement social",
    prochaineEcheance: "2026-11-15",
    alerte: alerte(1, 18),
  },
];

const agendaDemo = [
  { mois: "2026-10", libelle: "Octobre 2026", conventions: [conventionsDemo[2]!] },
  { mois: "2026-11", libelle: "Novembre 2026", conventions: conventionsDemo.slice(3) },
  {
    mois: "2026-12",
    libelle: "Décembre 2026",
    conventions: [{
      id: 6,
      nomConvention: "اتفاقية لتأهيل البنيات الثقافية بالجهة",
      rattachement: "Direction du développement social",
      prochaineEcheance: "2026-12-10",
      alerte: alerte(2, 43),
    }],
  },
];

function resultat<T>(data: T) {
  return {
    data,
    isLoading: false,
    isError: false,
    error: null,
    refetch: async () => ({ data }),
  };
}
export const useGetResumeAlertes = () => resultat(resumeDemo);
export const useListAlertes = (_params?: { limit: number; horizonJours: number }) => resultat(conventionsDemo);
export const useGetAgenda = (_params?: { mois: number }) => resultat(agendaDemo);

export const roleLabels: Record<string, string> = { admin: "Administrateur" };
export const useAuth = () => ({
  user: { username: "Compte démo", role: "admin" },
  logout: async () => {},
});
export const useLocation = (): [string, (path: string) => void] => ["/", () => {}];
export const Link = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
  ({ children, href: _href, onClick, ...props }, ref) => (
    <a {...props} ref={ref} href="#" onClick={event => {
      event.preventDefault();
      onClick?.(event);
    }}>{children}</a>
  ),
);
Link.displayName = "PreviewLink";
