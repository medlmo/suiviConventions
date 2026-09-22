import { Link } from "wouter";
import { 
  useGetResumeAlertes, 
  useListAlertes,
  useGetAgenda,
  AlerteCouleur,
  Convention 
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertCircle, Calendar, ArrowRight, Activity, Clock, FileWarning, CheckCircle2 } from "lucide-react";
import { AlerteBadge } from "@/components/alerte-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

const ICONS: Record<AlerteCouleur, any> = {
  rouge: FileWarning,
  orange: Clock,
  jaune: Calendar,
  vert: CheckCircle2,
  gris: Activity,
};

const BG_COLORS: Record<AlerteCouleur, string> = {
  rouge: "bg-red-50 text-red-700 border-red-100",
  orange: "bg-orange-50 text-orange-700 border-orange-100",
  jaune: "bg-yellow-50 text-yellow-700 border-yellow-100",
  vert: "bg-green-50 text-green-700 border-green-100",
  gris: "bg-slate-50 text-slate-700 border-slate-100",
};

export default function Dashboard() {
  const { data: resume, isLoading: resumeLoading } = useGetResumeAlertes();
  const { data: alertes, isLoading: alertesLoading } = useListAlertes({ limit: 10, horizonJours: 60 });
  const { data: agenda, isLoading: agendaLoading } = useGetAgenda({ mois: 3 });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Pilotage des Conventions</h1>
        <div className="text-muted-foreground text-lg">
          {resumeLoading ? (
            <Skeleton className="h-6 w-64" />
          ) : (
            <>Vue d'ensemble au {format(new Date(resume?.dateCalcul || new Date()), "d MMMM yyyy", { locale: fr })}</>
          )}
        </div>
      </div>

      {/* Compteurs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {resumeLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
        ) : (
          resume?.compteurs.map((compteur) => {
            const Icon = ICONS[compteur.couleur] || Activity;
            const bgClass = BG_COLORS[compteur.couleur];
            
            return (
              <Card key={compteur.niveau} className={cn("border shadow-sm overflow-hidden", bgClass)}>
                <CardContent className="p-5 flex flex-col items-center justify-center text-center h-full">
                  <Icon className="w-6 h-6 mb-2 opacity-80" />
                  <div className="text-3xl font-black mb-1">{compteur.nombre}</div>
                  <div className="text-xs font-semibold uppercase tracking-wider opacity-90">
                    {compteur.libelle}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* Actions urgentes */}
        <Card className="xl:col-span-2 shadow-md border-t-4 border-t-primary">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">Priorités d'action</CardTitle>
                  <CardDescription>Les conventions nécessitant une attention immédiate</CardDescription>
                </div>
              </div>
              <Link href="/conventions" className="text-sm font-medium text-primary hover:underline flex items-center gap-1">
                Voir tout <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {alertesLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            ) : alertes && alertes.length > 0 ? (
              <div className="space-y-3">
                {alertes.map((convention) => (
                  <Link key={convention.id} href={`/conventions/${convention.id}`}>
                    <div className="group block border border-border/50 rounded-lg p-4 hover:bg-accent/50 hover:border-accent transition-all cursor-pointer">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h4 
                            dir="auto" 
                            className="font-bold text-foreground truncate group-hover:text-primary transition-colors text-base"
                            title={convention.nomConvention}
                          >
                            {convention.nomConvention}
                          </h4>
                          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                            {convention.prochaineEcheance && (
                              <span className="flex items-center gap-1 font-medium text-foreground/70">
                                <Calendar className="w-3.5 h-3.5" />
                                {format(new Date(convention.prochaineEcheance), "dd/MM/yyyy")}
                              </span>
                            )}
                            <span className="truncate">{convention.rattachement || 'Non rattaché'}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <AlerteBadge alerte={convention.alerte} />
                          {convention.alerte.joursRestants !== null && convention.alerte.joursRestants !== undefined && (
                            <span className={cn(
                              "text-xs font-semibold px-2 py-1 rounded-full",
                              convention.alerte.joursRestants < 0 ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"
                            )}>
                              {Math.abs(convention.alerte.joursRestants)} j {convention.alerte.joursRestants < 0 ? "de retard" : "restants"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-green-500 opacity-50" />
                <p className="font-medium text-lg">Aucune alerte prioritaire</p>
                <p className="text-sm mt-1">Toutes vos conventions sont à jour.</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Agenda */}
        <Card className="shadow-md">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-secondary/10 rounded-lg">
                <Calendar className="w-5 h-5 text-secondary" />
              </div>
              <CardTitle className="text-xl">Agenda à venir</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {agendaLoading ? (
              <div className="space-y-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-3">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-12 w-full rounded-md" />
                    <Skeleton className="h-12 w-full rounded-md" />
                  </div>
                ))}
              </div>
            ) : agenda && agenda.length > 0 ? (
              <div className="space-y-6">
                {agenda.map((mois) => (
                  <div
                    key={mois.mois}
                    className="relative pl-7 before:absolute before:left-[7px] before:top-4 before:bottom-0 before:w-px before:bg-border last:before:hidden"
                  >
                    <span className="absolute left-0 top-1 w-4 h-4 flex items-center justify-center rounded-full border-2 border-primary bg-card">
                      <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                    </span>
                    <h4 className="text-sm font-bold uppercase tracking-wider text-primary">
                      {mois.libelle}
                    </h4>

                    <div className="space-y-3 mt-3">
                      {mois.conventions.length === 0 ? (
                        <div className="text-sm text-muted-foreground italic pl-2 border-l-2 border-border/50">
                          Aucune échéance ce mois-ci
                        </div>
                      ) : (
                        mois.conventions.map(conv => (
                          <Link key={conv.id} href={`/conventions/${conv.id}`}>
                            <div className="bg-card border shadow-sm rounded-lg p-3 hover:border-primary/50 transition-colors cursor-pointer group">
                              <div className="flex justify-between items-start mb-1 gap-2">
                                <span className="text-xs font-bold text-foreground bg-muted px-2 py-1 rounded">
                                  {conv.prochaineEcheance ? format(new Date(conv.prochaineEcheance), "dd MMM") : "-"}
                                </span>
                                <AlerteBadge alerte={conv.alerte} className="text-[10px] px-1.5 py-0.5 h-auto" />
                              </div>
                              <p dir="auto" className="text-sm font-medium line-clamp-2 mt-1 group-hover:text-primary transition-colors leading-relaxed">
                                {conv.nomConvention}
                              </p>
                            </div>
                          </Link>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                Aucune échéance dans les prochains mois.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
