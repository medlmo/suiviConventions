import { useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Check, ChevronLeft, ChevronRight, RefreshCw, Inbox } from "lucide-react";
import {
  useListNotifications,
  useReadNotification,
  useReadAllNotifications,
  getListNotificationsQueryKey,
  type ConventionNotification,
  type ListNotificationsParams,
} from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const PAGE_SIZE = 10;

const kindLabels: Record<ConventionNotification["kind"], string> = {
  creation: "Création",
  important: "Modification importante",
  minor: "Correction mineure",
};
const kindStyles: Record<ConventionNotification["kind"], string> = {
  creation: "bg-primary/10 text-primary border-primary/20",
  important: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  minor: "bg-muted text-muted-foreground border-border",
};

function statusOf(error: unknown): number | undefined {
  return (error as { status?: number } | null)?.status;
}
function signalExpiration(error: unknown) {
  if (statusOf(error) === 401) window.dispatchEvent(new Event("conventions-session-expired"));
}
function messageOf(error: unknown): string {
  const status = statusOf(error);
  if (status === 401) return "Votre session a expiré. Veuillez vous reconnecter.";
  if (status === 403) return "Vous n'avez pas accès à ces notifications.";
  return "Impossible de charger les notifications. Réessayez.";
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });
function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
}
function relative(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diff)) return value;
  const min = Math.round(diff / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  return d < 8 ? `il y a ${d} j` : formatDate(value);
}

export function NotificationCenter() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);

  const params: ListNotificationsParams = {
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    ...(unreadOnly ? { unreadOnly: 1 as const } : {}),
  };
  // L'identifiant du compte fait partie de la clé : aucun état personnel ne
  // peut être réutilisé après un changement de compte.
  const query = useListNotifications(params, {
    query: {
      queryKey: [...getListNotificationsQueryKey(params), { compte: user?.id ?? null }],
      enabled: !!user,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      placeholderData: (previous) => previous,
    },
  });

  const invalidate = () => client.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
  const readOne = useReadNotification({
    mutation: {
      onSuccess: () => { setActionError(null); void invalidate(); },
      onError: (error) => { signalExpiration(error); setActionError(statusOf(error) === 401 ? messageOf(error) : "Le marquage comme lu a échoué. Réessayez."); },
    },
  });
  const readAll = useReadAllNotifications({
    mutation: {
      onSuccess: () => { setActionError(null); void invalidate(); },
      onError: (error) => { signalExpiration(error); setActionError(statusOf(error) === 401 ? messageOf(error) : "Le marquage global a échoué. Réessayez."); },
    },
  });

  if (!user) return null;
  const data = query.data;
  const unread = data?.unreadCount ?? 0;
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (data && page > 0 && page >= pageCount) setPage(pageCount - 1);

  const markRead = (n: ConventionNotification) => {
    if (n.readAt) return;
    readOne.mutate({ id: n.id, data: { observedAt: n.updatedAt } });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? `Notifications, ${unread} non lues` : "Notifications"}
          data-testid="button-notifications"
        >
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold leading-[18px] text-center tabular-nums"
              data-testid="badge-notifications-unread"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[calc(100vw-1.5rem)] sm:w-[26rem] p-0 overflow-hidden"
        data-testid="panel-notifications"
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm text-foreground">Notifications</h3>
            <p className="text-xs text-muted-foreground" data-testid="text-notifications-summary">
              {data ? `${unread} non lue${unread > 1 ? "s" : ""} · ${total} au total` : "Suivi de vos conventions"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs shrink-0"
            disabled={!data || unread === 0 || readAll.isPending}
            onClick={() => data && readAll.mutate({ data: { observedAt: data.asOf } })}
            data-testid="button-notifications-read-all"
          >
            <CheckCheck className="w-3.5 h-3.5 mr-1.5" />
            Tout marquer comme lu
          </Button>
        </div>

        <label className="px-4 py-2 border-b border-border flex items-center justify-between text-xs text-muted-foreground cursor-pointer">
          Non lues uniquement
          <Switch
            checked={unreadOnly}
            onCheckedChange={(v) => { setUnreadOnly(v); setPage(0); }}
            data-testid="switch-notifications-unread-only"
          />
        </label>

        {actionError && (
          <div className="px-4 py-2 text-xs text-destructive bg-destructive/5 border-b border-border" role="alert" data-testid="text-notifications-action-error">
            {actionError}
          </div>
        )}

        <div className="max-h-[min(60dvh,28rem)] overflow-y-auto">
          {query.isPending ? (
            <ul className="divide-y divide-border" aria-label="Chargement des notifications">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="px-4 py-3 space-y-2 animate-pulse">
                  <div className="h-3 w-1/3 rounded bg-muted" />
                  <div className="h-3.5 w-4/5 rounded bg-muted" />
                  <div className="h-3 w-2/3 rounded bg-muted" />
                </li>
              ))}
            </ul>
          ) : query.isError && !data ? (
            <div className="px-6 py-10 text-center space-y-3">
              <p className="text-sm text-muted-foreground" data-testid="text-notifications-error">{messageOf(query.error)}</p>
              <Button variant="outline" size="sm" onClick={() => void query.refetch()} data-testid="button-notifications-retry">
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Réessayer
              </Button>
            </div>
          ) : !data || data.items.length === 0 ? (
            <div className="px-6 py-10 text-center" data-testid="state-notifications-empty">
              <Inbox className="w-8 h-8 mx-auto mb-3 text-muted-foreground/60" />
              <p className="text-sm font-medium text-foreground">
                {unreadOnly ? "Aucune notification non lue" : "Aucune notification"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Les créations et modifications des conventions de votre périmètre apparaîtront ici.
              </p>
            </div>
          ) : (
            <ul className={cn("divide-y divide-border transition-opacity", query.isPlaceholderData && "opacity-60")}>
              {data.items.map((n) => {
                const isUnread = !n.readAt;
                const grouped = n.kind === "minor" && n.eventCount > 1;
                return (
                  <li key={n.id} className={cn("relative px-4 py-3 flex gap-3", isUnread && "bg-primary/[0.04]")} data-testid={`row-notification-${n.id}`}>
                    <span className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0", isUnread ? "bg-primary" : "bg-transparent")} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1">
                        <span className={cn("text-[10px] uppercase tracking-wide font-semibold border rounded px-1.5 py-0.5", kindStyles[n.kind])}>
                          {kindLabels[n.kind]}
                        </span>
                        {n.eventCount > 1 && (
                          <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-0.5" data-testid={`text-notification-count-${n.id}`}>
                            {grouped ? `${n.eventCount} corrections regroupées` : `${n.eventCount} événements`}
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/conventions/${n.conventionId}`}
                        onClick={() => { markRead(n); setOpen(false); }}
                        className={cn("block text-sm leading-snug hover:underline", isUnread ? "font-semibold text-foreground" : "font-medium text-foreground/80")}
                        data-testid={`link-notification-convention-${n.id}`}
                      >
                        {n.conventionName}
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-3">{n.summary}</p>
                      <p className="text-[11px] text-muted-foreground/80 mt-1.5">
                        Par <span className="font-medium text-foreground/70">{n.actorUsername}</span>
                        {" · "}
                        <time dateTime={n.updatedAt} title={`Dernière mise à jour : ${formatDate(n.updatedAt)}`}>{relative(n.updatedAt)}</time>
                        {n.updatedAt !== n.createdAt && (
                          <span title={formatDate(n.createdAt)}> · depuis le {formatDate(n.createdAt)}</span>
                        )}
                      </p>
                    </div>
                    {isUnread && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        title="Marquer comme lue"
                        aria-label="Marquer comme lue"
                        disabled={readOne.isPending && readOne.variables?.id === n.id}
                        onClick={() => markRead(n)}
                        data-testid={`button-notification-read-${n.id}`}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {data && total > PAGE_SIZE && (
          <div className="px-4 py-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <Button variant="ghost" size="sm" className="h-7" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} data-testid="button-notifications-prev">
              <ChevronLeft className="w-4 h-4" /> Précédent
            </Button>
            <span data-testid="text-notifications-page">Page {page + 1} / {pageCount}</span>
            <Button variant="ghost" size="sm" className="h-7" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)} data-testid="button-notifications-next">
              Suivant <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
