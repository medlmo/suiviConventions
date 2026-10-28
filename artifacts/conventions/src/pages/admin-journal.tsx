import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { History, Search, ChevronLeft, ChevronRight, FileClock } from "lucide-react";
import { api, errorMessage } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

type Audit = { id: number; conventionId: number; action: "create" | "update" | "delete"; actorUsername: string; before: unknown; after: unknown; createdAt: string };
const labels = { create: "Création", update: "Modification", delete: "Suppression" };
const colors = { create: "bg-emerald-50 text-emerald-800", update: "bg-blue-50 text-blue-800", delete: "bg-red-50 text-red-800" };
const pageSize = 20;
const automaticAuditFields = new Set(["updatedAt", "version"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length && left.every((value, index) => sameJsonValue(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length &&
    leftKeys.every(key => Object.prototype.hasOwnProperty.call(right, key) && sameJsonValue(left[key], right[key]));
}

function AuditSnapshot({ value, compare, highlightChanges }: {
  value: unknown;
  compare: unknown;
  highlightChanges: boolean;
}) {
  const current = isRecord(value) ? value : { valeur: value };
  const other = isRecord(compare) ? compare : compare == null ? {} : { valeur: compare };
  const keys = [...new Set([...Object.keys(current), ...Object.keys(other)])];

  return <pre className="text-xs whitespace-pre-wrap break-all bg-muted/50 rounded p-3 max-h-72 overflow-auto">{"{\n"}
    {keys.map((key, index) => {
      const hasValue = Object.prototype.hasOwnProperty.call(current, key);
      const hasOther = Object.prototype.hasOwnProperty.call(other, key);
      const changed = highlightChanges && !automaticAuditFields.has(key) &&
        (hasValue !== hasOther || (hasValue && hasOther && !sameJsonValue(current[key], other[key])));
      const serialized = hasValue ? JSON.stringify(current[key], null, 2) : "—";
      return <span key={key}>{"  "}
        {changed
          ? <strong className="font-bold text-foreground">{JSON.stringify(key)}: {serialized}</strong>
          : <>{JSON.stringify(key)}: {serialized}</>}
        {index < keys.length - 1 ? "," : ""}{"\n"}
      </span>;
    })}
    {"}"}
  </pre>;
}

export default function AdminJournal() {
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("");
  const [input, setInput] = useState("");
  const query = useQuery({
    queryKey: ["admin", "audit", page, filter],
    queryFn: () => api<{ items: Audit[]; total: number }>(`/admin/audit?limit=${pageSize}&offset=${page * pageSize}${filter ? `&conventionId=${encodeURIComponent(filter)}` : ""}`),
    staleTime: 15_000,
  });
  function submit(event: FormEvent) { event.preventDefault(); setPage(0); setFilter(input.trim()); }
  return <div className="space-y-6 pb-12">
    <div><span className="text-xs font-bold uppercase tracking-widest text-secondary">Administration / traçabilité</span><h1 className="text-3xl font-semibold mt-2">Journal des modifications</h1><p className="text-muted-foreground mt-1">L'historique des créations, modifications et suppressions.</p></div>
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2 max-w-md"><div className="relative flex-1"><Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" /><Input aria-label="Numéro de convention" inputMode="numeric" pattern="[0-9]*" placeholder="N° de convention" className="pl-9 bg-card" value={input} onChange={event => setInput(event.target.value)} /></div><Button variant="outline" type="submit">Filtrer</Button>{filter && <Button variant="ghost" type="button" onClick={() => { setFilter(""); setInput(""); setPage(0); }}>Effacer</Button>}</form>
    {query.isPending ? <div className="space-y-3">{[1,2,3,4].map(i => <Skeleton key={i} className="h-24 w-full" />)}</div>
      : query.isError ? <Card><CardContent className="py-12 text-center"><p role="alert">{errorMessage(query.error)}</p><Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>Réessayer</Button></CardContent></Card>
      : !query.data?.items.length ? <Card><CardContent className="py-16 text-center text-muted-foreground"><FileClock className="w-10 h-10 mx-auto mb-4 text-secondary" />Aucune opération enregistrée{filter ? " pour cette convention" : ""}.</CardContent></Card>
      : <div className="border rounded-xl bg-card overflow-hidden divide-y">{query.data.items.map(entry => <article key={entry.id} className="p-4 sm:p-5 flex gap-4">
        <div className="w-10 h-10 shrink-0 rounded-lg bg-accent text-primary grid place-items-center"><History className="w-5 h-5" /></div>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><span className={`text-xs font-semibold rounded-full px-2.5 py-1 ${colors[entry.action]}`}>{labels[entry.action]}</span><span className="text-sm font-semibold">Convention #{entry.conventionId}</span></div><p className="text-sm text-muted-foreground mt-2">Par <strong className="text-foreground">{entry.actorUsername}</strong> · <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString("fr-MA", { dateStyle: "medium", timeStyle: "short" })}</time></p>
          <div className="flex flex-wrap gap-4 mt-2">{entry.action !== "delete" && <Link href={`/conventions/${entry.conventionId}`} className="text-sm font-medium text-primary underline">Voir la convention</Link>}{(entry.before != null || entry.after != null) && <details className="text-sm text-muted-foreground"><summary className="cursor-pointer hover:text-foreground">Voir les données de l'opération</summary>{entry.action === "update" && <p className="mt-2 text-xs">Les champs modifiés apparaissent en gras.</p>}<div className="mt-3 grid md:grid-cols-2 gap-3">{entry.before != null && <div><div className="font-semibold mb-1">Avant</div><AuditSnapshot value={entry.before} compare={entry.after} highlightChanges={entry.action === "update"} /></div>}{entry.after != null && <div><div className="font-semibold mb-1">Après</div><AuditSnapshot value={entry.after} compare={entry.before} highlightChanges={entry.action === "update"} /></div>}</div></details>}</div>
        </div>
      </article>)}</div>}
    {!!query.data?.total && <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground"><span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, query.data.total)} sur {query.data.total}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Page précédente"><ChevronLeft className="w-4 h-4" /></Button><Button variant="outline" size="sm" disabled={(page + 1) * pageSize >= query.data.total} onClick={() => setPage(page + 1)} aria-label="Page suivante"><ChevronRight className="w-4 h-4" /></Button></div></div>}
  </div>;
}