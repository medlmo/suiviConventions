import type { ResumeAlertes } from "@workspace/api-client-react";
import { ArrowRight, Banknote, Files, Wallet } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const montant = new Intl.NumberFormat("de-DE", {
  useGrouping: true,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const nombre = new Intl.NumberFormat("fr-FR");
const pourcentage = new Intl.NumberFormat("fr-FR", {
  style: "percent",
  maximumFractionDigits: 1,
});

const formaterMontant = (value: number) => `${montant.format(value)} MAD`;

const PERIODES = [
  { key: "avant2021", libelle: "Avant 2021" },
  { key: "de2021A2026", libelle: "2021–2026" },
] as const;

const PERIODES_COMPLEMENTAIRES = [
  { key: "sansDate", libelle: "Session non renseignée" },
  { key: "apres2026", libelle: "Après 2026" },
] as const;

export function DashboardTotals({
  resume,
  isLoading,
}: {
  resume: ResumeAlertes | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-56 rounded-xl" />
        ))}
      </div>
    );
  }
  if (!resume) return null;

  const indicateurs = [
    {
      cle: "nombre",
      titre: "Nombre de conventions visées",
      valeur: resume.total,
      formater: (value: number) => nombre.format(value),
      mesure: (periode: ResumeAlertes["parSession"]["avant2021"]) => periode.total,
      formaterMesure: (value: number) => nombre.format(value),
      unite: "Conventions",
      Icon: Files,
    },
    {
      cle: "budget",
      titre: "Budget alloué",
      valeur: resume.montantGlobal,
      formater: formaterMontant,
      mesure: (periode: ResumeAlertes["parSession"]["avant2021"]) => periode.montantGlobal,
      formaterMesure: formaterMontant,
      Icon: Wallet,
    },
    {
      cle: "contribution",
      titre: "Contribution de la Région",
      valeur: resume.contributionRegionTotale,
      formater: formaterMontant,
      mesure: (periode: ResumeAlertes["parSession"]["avant2021"]) => periode.contributionRegionTotale,
      formaterMesure: formaterMontant,
      Icon: Banknote,
    },
  ];

  return (
    <section aria-label="Indicateurs des conventions visées">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {indicateurs.map(({ cle, titre, valeur, formater, mesure, formaterMesure, unite, Icon }) => {
          const complementaires = PERIODES_COMPLEMENTAIRES
            .map((periode) => ({
              ...periode,
              donnees: resume.parSession[periode.key],
            }))
            .filter((periode) => periode.donnees.total > 0);
          const totalPourcentage =
            cle === "nombre"
              ? resume.total
              : cle === "budget"
                ? resume.montantGlobal
              : cle === "contribution"
                ? resume.contributionRegionTotale
                : null;

          return (
            <Card key={cle} className="h-full min-w-0 shadow-sm" data-testid={`card-indicateur-${cle}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-sm font-semibold text-muted-foreground">{titre}</h2>
                  <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                </div>

                <p
                  className="mt-3 flex flex-wrap items-baseline gap-x-2 break-words text-2xl font-bold tracking-tight text-foreground tabular-nums"
                  data-testid={`text-indicateur-${cle}`}
                >
                  {formater(valeur)}
                  {unite && <span>{unite}</span>}
                </p>

                <div className="mt-1 h-4">
                  {cle === "contribution" && (
                    <p className="text-xs font-medium leading-4 text-primary tabular-nums">
                      {resume.montantGlobal > 0
                        ? `${pourcentage.format(resume.contributionRegionTotale / resume.montantGlobal)} du montant global`
                        : "— du montant global"}
                    </p>
                  )}
                </div>

                <dl className="mt-4 grid grid-cols-2 divide-x border-t border-border pt-3">
                  {PERIODES.map((periode, index) => {
                    const donnees = resume.parSession[periode.key];
                    const valeurPeriode = mesure(donnees);
                    return (
                      <div
                        key={periode.key}
                        className={`min-w-0 text-center ${index === 0 ? "pr-2" : "pl-2"}`}
                      >
                        <dt className="text-xs text-muted-foreground">{periode.libelle}</dt>
                        <dd className="mt-1 break-words text-sm font-semibold tabular-nums">
                          {formaterMesure(valeurPeriode)}
                          <span className="block min-h-4 text-xs font-medium text-muted-foreground">
                            {totalPourcentage === null
                              ? "\u00a0"
                              : totalPourcentage > 0
                                ? pourcentage.format(valeurPeriode / totalPourcentage)
                                : "—"}
                          </span>
                        </dd>
                      </div>
                    );
                  })}
                </dl>

                {complementaires.length > 0 && (
                  <dl className="mt-3 space-y-1 border-t border-border pt-2">
                    {complementaires.map((periode) => (
                      <div key={periode.key} className="flex items-baseline justify-between gap-3 text-xs">
                        <dt className="text-muted-foreground">{periode.libelle}</dt>
                        <dd className="shrink-0 font-medium tabular-nums">
                          {formaterMesure(mesure(periode.donnees))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                {cle === "nombre" && (
                  <Link
                    href="/conventions"
                    data-testid="link-voir-conventions"
                    className="mt-3 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Voir les conventions <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
