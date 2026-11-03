import { useState } from "react";
import type { ResumeAlertes } from "@workspace/api-client-react";
import { ArrowRight, Banknote, Files, Wallet } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const montant = new Intl.NumberFormat("de-DE", {
  useGrouping: true,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const pourcentage = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 1,
});

const formaterMontant = (value: number) => montant.format(value);

type Portee = "visees" | "enCours" | "arriveesATerme";

type Agregat = { total: number; montantGlobal: number; contributionRegionTotale: number };

const PORTEES: { id: Portee; onglet: string; libelle: string }[] = [
  { id: "visees", onglet: "Toutes visées", libelle: "conventions visées" },
  { id: "enCours", onglet: "En cours d’exécution", libelle: "conventions en cours d’exécution" },
  { id: "arriveesATerme", onglet: "Arrivées à terme", libelle: "conventions arrivées à terme" },
];

export function DashboardTotals({
  resume,
  isLoading,
}: {
  resume: ResumeAlertes | undefined;
  isLoading: boolean;
}) {
  const [portee, setPortee] = useState<Portee>("visees");

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full max-w-xl rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-36 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  if (!resume) return null;

  const agregats: Record<Portee, Agregat> = {
    visees: resume,
    enCours: resume.parStatut.enCours,
    arriveesATerme: resume.parStatut.arriveesATerme,
  };
  const actif = PORTEES.find((p) => p.id === portee)!;
  const donnees = agregats[portee];

  const indicateurs = [
    {
      cle: "nombre",
      titre: `Nombre total de ${actif.libelle}`,
      valeur: donnees.total.toLocaleString("fr-FR"),
      unite: "Conventions",
      Icon: Files,
      lien: true,
      href: portee === "visees"
        ? "/conventions"
        : `/conventions?statutConvention=${encodeURIComponent(portee === "enCours" ? "En cours" : "Arrivée à terme")}`,
    },
    {
      cle: "montant",
      titre: `Montant global des ${actif.libelle}`,
      valeur: `${formaterMontant(donnees.montantGlobal)} MAD`,
      Icon: Wallet,
    },
    {
      cle: "contribution",
      titre: `Total des contributions de la Région pour les ${actif.libelle}`,
      valeur: `${formaterMontant(donnees.contributionRegionTotale)} MAD`,
      sousTitre:
        donnees.montantGlobal > 0
          ? `${pourcentage.format(donnees.contributionRegionTotale / donnees.montantGlobal)} du montant global`
          : "— du montant global",
      Icon: Banknote,
    },
  ];

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % PORTEES.length;
    else if (e.key === "ArrowLeft") next = (index - 1 + PORTEES.length) % PORTEES.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = PORTEES.length - 1;
    else return;
    e.preventDefault();
    setPortee(PORTEES[next].id);
    document.getElementById(`portee-${PORTEES[next].id}`)?.focus();
  };

  return (
    <section aria-label="Indicateurs des conventions" className="space-y-3">
      <div
        role="tablist"
        aria-label="Périmètre des indicateurs"
        className="flex w-full flex-wrap gap-1 rounded-lg border bg-muted/50 p-1 sm:w-fit"
      >
        {PORTEES.map((p, index) => {
          const selected = p.id === portee;
          return (
            <button
              key={p.id}
              id={`portee-${p.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls="panneau-indicateurs"
              tabIndex={selected ? 0 : -1}
              onClick={() => setPortee(p.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              data-testid={`tab-portee-${p.id}`}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none",
                selected
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.onglet}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {agregats[p.id].total.toLocaleString("fr-FR")}
              </span>
            </button>
          );
        })}
      </div>

      <div
        id="panneau-indicateurs"
        role="tabpanel"
        aria-labelledby={`portee-${portee}`}
        aria-live="polite"
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        {indicateurs.map(({ cle, titre, valeur, unite, sousTitre, Icon, lien, href }) => (
          <Card key={cle} className="shadow-sm min-w-0" data-testid={`card-indicateur-${cle}`}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-sm font-semibold text-muted-foreground">{titre}</h2>
                <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              </div>
              <p
                className="mt-3 flex flex-wrap items-baseline gap-x-2 text-2xl font-bold tracking-tight text-foreground break-words tabular-nums"
                data-testid={`text-indicateur-${cle}-${portee}`}
              >
                {valeur}
                {unite && <span>{unite}</span>}
              </p>
              {sousTitre && (
                <p className="mt-1 text-sm text-muted-foreground tabular-nums">{sousTitre}</p>
              )}
              {lien && (
                <Link
                  href={href ?? "/conventions"}
                  data-testid="link-voir-conventions"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  Voir les conventions <ArrowRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
