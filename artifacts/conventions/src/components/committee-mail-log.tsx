import { AlertCircle, Ban, CheckCircle2, Clock3, Mail, RefreshCw } from "lucide-react";
import type { AdminMailReminder } from "@workspace/api-client-react";
import { useAdminMailReminderLog } from "@/hooks/use-operational-health";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const dateFormatter = new Intl.DateTimeFormat("fr-MA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Casablanca",
});
const dateOnlyFormatter = new Intl.DateTimeFormat("fr-MA", {
  dateStyle: "medium",
  timeZone: "Africa/Casablanca",
});

function date(value: string | null, dateOnly = false): string {
  if (!value) return "—";
  const parsed = new Date(dateOnly ? `${value}T12:00:00Z` : value);
  return Number.isNaN(parsed.getTime())
    ? value
    : (dateOnly ? dateOnlyFormatter : dateFormatter).format(parsed);
}

const statusLabels: Record<AdminMailReminder["status"], string> = {
  eligible: "Éligible",
  pending: "En attente",
  sending: "En cours d’envoi",
  sent: "Envoyé",
  failed: "Échec · nouvel essai prévu",
  cancelled: "Annulé",
};

function statusStyle(status: AdminMailReminder["status"]): string {
  if (status === "sent") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (status === "failed") return "bg-destructive/10 text-destructive";
  if (status === "eligible") return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  if (status === "cancelled") return "bg-muted text-muted-foreground";
  return "bg-primary/10 text-primary";
}

export function CommitteeMailLog() {
  const query = useAdminMailReminderLog();
  const snapshot = query.data;

  return (
    <section aria-labelledby="mail-reminder-log-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="mail-reminder-log-title" className="text-xl font-semibold">Journal des rappels par e-mail</h2>
          <p className="text-sm text-muted-foreground">
            Rappels admissibles maintenant et 200 dernières livraisons enregistrées.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching} data-testid="button-refresh-mail-log">
          <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {query.isPending ? (
        <div className="space-y-3" aria-label="Chargement du journal des e-mails">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-24" />)}
          </div>
          <Skeleton className="h-56 w-full" />
        </div>
      ) : query.isError || !snapshot ? (
        <Card><CardContent className="py-8 text-center">
          <p role="alert" className="text-sm" data-testid="status-mail-log-error">Impossible de charger le journal des rappels.</p>
          <Button type="button" variant="outline" className="mt-3" onClick={() => void query.refetch()} data-testid="button-retry-mail-log">
            Réessayer
          </Button>
        </CardContent></Card>
      ) : (
        <>
          <Card className={snapshot.enabled ? "border-emerald-600/30" : "border-amber-600/30"}>
            <CardContent className="flex items-start gap-3 p-4">
              {snapshot.enabled
                ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" aria-hidden="true" />
                : <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" aria-hidden="true" />}
              <div>
                <p className="font-medium" data-testid="status-mail-sending-enabled">
                  Envoi automatique {snapshot.enabled ? "activé" : "désactivé"} dans cet environnement
                </p>
                {!snapshot.enabled && <p className="text-sm text-muted-foreground">
                  Les rappels « Éligible » sont informatifs et ne seront pas envoyés tant que l’envoi n’est pas activé.
                </p>}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Metric title="Éligibles" value={snapshot.summary.eligible} icon={Clock3} />
            <Metric title="En attente" value={snapshot.summary.pending} icon={Mail} />
            <Metric title="En cours" value={snapshot.summary.sending} icon={RefreshCw} />
            <Metric title="Envoyés" value={snapshot.summary.sent} icon={CheckCircle2} />
            <Metric title="Échecs" value={snapshot.summary.failed} icon={AlertCircle} />
            <Metric title="Annulés" value={snapshot.summary.cancelled} icon={Ban} />
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[920px] text-sm" data-testid="table-mail-reminders">
              <thead className="bg-muted/40 text-start">
                <tr>
                  <th className="px-3 py-3 font-semibold">État</th>
                  <th className="px-3 py-3 font-semibold">Convention</th>
                  <th className="px-3 py-3 font-semibold">Destinataire</th>
                  <th className="px-3 py-3 font-semibold">Échéance</th>
                  <th className="px-3 py-3 font-semibold">Tentatives</th>
                  <th className="px-3 py-3 font-semibold">Dates</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.items.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground" data-testid="status-mail-log-empty">
                    Aucun rappel éligible ou enregistré.
                  </td></tr>
                ) : snapshot.items.map((item) => (
                  <tr key={item.id ?? `eligible-${item.recipientUsername}-${item.conventionId}-${item.deadlineDate}-${item.reminderDays}`}
                    className="border-t border-border align-top" data-testid={`row-mail-reminder-${item.id ?? `eligible-${item.conventionId}`}`}>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyle(item.status)}`}>
                        {statusLabels[item.status]}
                      </span>
                    </td>
                    <td className="max-w-[280px] px-3 py-3">
                      <p className="font-medium">{item.conventionName}</p>
                      <p className="text-xs text-muted-foreground">Convention #{item.conventionId}</p>
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-medium">{item.recipientUsername}</p>
                      <p className="break-all text-xs text-muted-foreground">{item.recipientEmail ?? "Adresse absente"}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <p>{date(item.deadlineDate, true)}</p>
                      <p className="text-xs text-muted-foreground">
                        Rappel J−{item.reminderDays} · {item.daysRemaining} j restants
                      </p>
                    </td>
                    <td className="px-3 py-3">
                      <p>{item.attempts}</p>
                      {item.lastErrorCode && <p className="text-xs text-destructive">Code : {item.lastErrorCode}</p>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                      {item.status === "eligible" ? <p>Pas encore mis en file</p> : (
                        <>
                          <p>Mise en file : {date(item.createdAt)}</p>
                          {item.nextAttemptAt && <p>Nouvel essai : {date(item.nextAttemptAt)}</p>}
                          {item.sentAt && <p className="text-emerald-700 dark:text-emerald-300">Envoyé : {date(item.sentAt)}</p>}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Éligible = critères satisfaits, sans livraison déjà enregistrée. Les échecs restent en attente d’une nouvelle tentative.
            Historique limité à {snapshot.historyLimit} rappels, actualisé le {date(snapshot.generatedAt)}.
          </p>
        </>
      )}
    </section>
  );
}

function Metric({ title, value, icon: Icon }: {
  title: string;
  value: number;
  icon: typeof Mail;
}) {
  return <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-xs font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
    </CardHeader>
    <CardContent>
      <div className="text-xl font-semibold tabular-nums" data-testid={`metric-mail-${title.toLowerCase().replaceAll(" ", "-")}`}>
        {value.toLocaleString("fr-FR")}
      </div>
    </CardContent>
  </Card>;
}
