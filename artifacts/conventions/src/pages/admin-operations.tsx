import { Activity, AlertTriangle, CheckCircle2, Clock3, Database, RefreshCw, ShieldAlert } from "lucide-react";
import { useOperationsSnapshot } from "@/hooks/use-operational-health";
import { errorMessage } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const dateFormatter = new Intl.DateTimeFormat("fr-MA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Casablanca",
});

function duree(value: number | null): string {
  if (value === null) return "—";
  return value >= 1_000 ? `${(value / 1_000).toFixed(1)} s` : `${value} ms`;
}

function formatStatus(status: "unknown" | "ready" | "unavailable") {
  if (status === "ready") return "Disponible";
  if (status === "unavailable") return "Indisponible";
  return "En attente";
}

function MetricCard({ title, value, detail, icon: Icon, testId }: {
  title: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  testId: string;
}) {
  return <Card data-testid={testId}>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </CardContent>
  </Card>;
}

export default function AdminOperations() {
  const query = useOperationsSnapshot();
  if (query.isPending) {
    return <div className="space-y-6" aria-label="Chargement de la surveillance">
      <Skeleton className="h-20 w-full" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-28" />)}</div>
      <Skeleton className="h-40 w-full" />
    </div>;
  }
  if (query.isError || !query.data) {
    return <Card><CardContent className="py-12 text-center">
      <p role="alert" data-testid="status-operations-error">{errorMessage(query.error)}</p>
      <Button className="mt-4" variant="outline" onClick={() => void query.refetch()} data-testid="button-retry-operations">
        <RefreshCw className="mr-2 h-4 w-4" /> Réessayer
      </Button>
    </CardContent></Card>;
  }

  const snapshot = query.data;
  const database = snapshot.database;
  const antivirus = snapshot.antivirus;
  const dependencyIcon = (status: string) => status === "ready" ? CheckCircle2 : AlertTriangle;
  const DatabaseIcon = dependencyIcon(database.status);
  const AntivirusIcon = dependencyIcon(antivirus.status);

  return <div className="space-y-6 pb-12">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <span className="text-xs font-bold uppercase tracking-widest text-secondary">Administration / supervision</span>
        <h1 className="mt-2 text-3xl font-semibold">État du service</h1>
        <p className="mt-1 text-muted-foreground">Disponibilité, performances et alertes actives.</p>
      </div>
      <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching} data-testid="button-refresh-operations">
        <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> Actualiser
      </Button>
    </div>

    <section aria-label="Disponibilité des dépendances" className="grid gap-4 sm:grid-cols-2">
      <Card data-testid="status-database">
        <CardContent className="flex items-center gap-4 p-5">
          <DatabaseIcon className={`h-6 w-6 ${database.status === "ready" ? "text-emerald-600" : "text-destructive"}`} aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold">Base de données : {formatStatus(database.status)}</p>
            <p className="text-sm text-muted-foreground">
              {database.latencyMs === null ? "Temps de réponse indisponible" : `Réponse en ${duree(database.latencyMs)}`}
            </p>
          </div>
        </CardContent>
      </Card>
      <Card data-testid="status-antivirus">
        <CardContent className="flex items-center gap-4 p-5">
          <AntivirusIcon className={`h-6 w-6 ${antivirus.status === "ready" ? "text-emerald-600" : "text-destructive"}`} aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold">Antivirus : {formatStatus(antivirus.status)}</p>
            <p className="text-sm text-muted-foreground">
              {antivirus.latencyMs === null ? "Temps de réponse indisponible" : `Vérifié en ${duree(antivirus.latencyMs)}`}
            </p>
          </div>
        </CardContent>
      </Card>
    </section>

    <section aria-label="Métriques HTTP sur cinq minutes" className="space-y-3">
      <div><h2 className="text-lg font-semibold">Performances HTTP</h2><p className="text-sm text-muted-foreground">Fenêtre glissante de cinq minutes · disponibilité de cette instance</p></div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Requêtes" value={snapshot.requests.total.toLocaleString("fr-FR")} detail={`${snapshot.requests.rejected} refus client (4xx)`} icon={Activity} testId="metric-request-count" />
        <MetricCard title="Erreurs serveur" value={`${snapshot.requests.errorRatePercent.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`} detail={`${snapshot.requests.serverErrors} réponses 5xx`} icon={ShieldAlert} testId="metric-error-rate" />
        <MetricCard title="Latence p95" value={duree(snapshot.requests.p95LatencyMs)} detail={`p50 ${duree(snapshot.requests.p50LatencyMs)} · p99 ${duree(snapshot.requests.p99LatencyMs)}`} icon={Clock3} testId="metric-latency-percentiles" />
        <MetricCard title="Requêtes lentes" value={snapshot.requests.slow.toLocaleString("fr-FR")} detail="Durée supérieure ou égale à 2 secondes" icon={Clock3} testId="metric-slow-requests" />
      </div>
    </section>

    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" aria-hidden="true" /> Alertes actives</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {snapshot.alerts.length === 0
          ? <p className="text-sm text-muted-foreground" data-testid="status-no-operations-alerts">Aucune anomalie active détectée.</p>
          : snapshot.alerts.map(alert => <article
            key={alert.id}
            className={`rounded-lg border p-4 ${alert.severity === "critical" ? "border-destructive/40 bg-destructive/5" : "border-amber-500/40 bg-amber-500/5"}`}
            role="alert"
            data-testid={`alert-operations-${alert.id}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{alert.title}</h3>
              <span className="text-xs text-muted-foreground">Depuis {dateFormatter.format(new Date(alert.since))}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{alert.description}</p>
          </article>)}
        <p className="border-t pt-3 text-xs text-muted-foreground">
          Alertes calculées à partir des seuils d’erreurs (5 % après 20 requêtes), de latence p95 (2 s après 20 requêtes) et de disponibilité des dépendances.
        </p>
      </CardContent>
    </Card>

    <p className="text-xs text-muted-foreground">
      Échantillon actualisé le {dateFormatter.format(new Date(snapshot.generatedAt))}. Les compteurs sont locaux à cette instance et sont remis à zéro au redémarrage.
    </p>
  </div>;
}
