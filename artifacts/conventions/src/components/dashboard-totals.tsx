import type { ResumeAlertes } from "@workspace/api-client-react";
import { ArrowRight, Banknote, Files, Wallet } from "lucide-react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const montant = new Intl.NumberFormat("fr-FR", {
  useGrouping: true,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formaterMontant = (value: number) =>
  montant.format(value).replace(/[\u00a0\u202f]/g, " ");

export function DashboardTotals({
  resume,
  isLoading,
}: {
  resume: ResumeAlertes | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-36 rounded-xl" />
        ))}
      </div>
    );
  }
  if (!resume) return null;

  const indicateurs = [
    {
      titre: "Nombre total de conventions",
      valeur: resume.total.toLocaleString("fr-FR"),
      precision: "Conventions de votre périmètre de consultation",
      Icon: Files,
      lien: true,
    },
    {
      titre: "Montant global des conventions",
      valeur: `${formaterMontant(resume.montantGlobal)} MAD`,
      Icon: Wallet,
    },
    {
      titre: "Total des contributions de la Région",
      valeur: `${formaterMontant(resume.contributionRegionTotale)} MAD`,
      Icon: Banknote,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {indicateurs.map(({ titre, valeur, Icon, lien }) => (
        <Card key={titre} className="shadow-sm min-w-0">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-semibold text-muted-foreground">{titre}</h2>
              <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-foreground break-words tabular-nums">
              {valeur}
            </p>
            {lien && (
              <Link
                href="/conventions"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                Voir les conventions <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
