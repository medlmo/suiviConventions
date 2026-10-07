import { useState, type FormEvent } from "react";
import { Building2, FolderTree, Layers3, Pencil, Plus, Waypoints } from "lucide-react";
import { useReferenceData, useReferenceMutation, type ReferenceKind } from "@/hooks/use-reference-data";
import { errorMessage } from "@/hooks/use-auth";
import { DIRECTION_GENERALE_SERVICES } from "@workspace/organisation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Draft = { kind: ReferenceKind; id?: number; parentId?: number; nom: string; parentLabel?: string };
const labels: Record<ReferenceKind, string> = { directions: "direction", divisions: "division", services: "service", "services-dgs": "service directement rattaché à la DGS", "maitrises-ouvrage": "maîtrise d’ouvrage" };

export default function AdminReferentiel() {
  const query = useReferenceData();
  const mutation = useReferenceMutation();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const begin = (next: Draft) => { setError(""); mutation.reset(); setDraft(next); };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!draft?.nom.trim()) return;
    mutation.mutate({ ...draft, nom: draft.nom.trim() }, {
      onSuccess: () => { setDraft(null); setError(""); },
      onError: cause => setError(errorMessage(cause)),
    });
  };
  return <div className="space-y-6 pb-16">
    <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
      <div><span className="text-xs font-bold uppercase tracking-widest text-secondary">Administration / données de référence</span><h1 className="text-3xl font-semibold mt-2">Référentiel</h1><p className="text-muted-foreground mt-1">Organigramme et maîtrises d’ouvrage utilisés dans les conventions et les comptes.</p></div>
      <Button onClick={() => begin({ kind: "directions", nom: "" })}><Plus className="w-4 h-4 mr-2" /> Nouvelle direction</Button>
    </div>
    {query.isPending ? <div className="grid md:grid-cols-[1.5fr_1fr] gap-5">{[0, 1].map(i => <Skeleton key={i} className="h-96 rounded-xl" />)}</div> :
      query.isError ? <Card><CardContent className="py-12 text-center"><p role="alert" className="text-destructive">Le référentiel n’a pas pu être chargé : {errorMessage(query.error)}</p><Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>Réessayer</Button></CardContent></Card> :
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)] gap-5 items-start">
        <Card className="overflow-hidden shadow-sm"><div className="p-5 border-b bg-muted/30 flex flex-wrap gap-3 justify-between items-center"><div><h2 className="font-semibold text-lg flex items-center gap-2"><FolderTree className="w-5 h-5 text-secondary" /> Organigramme</h2><p className="text-sm text-muted-foreground">Directions, divisions et services</p></div><Button size="sm" variant="outline" onClick={() => begin({ kind: "directions", nom: "" })}><Plus className="w-4 h-4 mr-1" /> Direction</Button></div>
          <CardContent className="p-4 sm:p-5 space-y-4">
            <section className="rounded-lg border overflow-hidden">
              <div className="bg-accent/40 px-4 py-3"><h3 className="font-semibold">{DIRECTION_GENERALE_SERVICES}</h3><p className="text-sm text-muted-foreground">Services directement rattachés, sans direction ni division intermédiaire</p></div>
              <div className="p-3 space-y-2">{query.data?.servicesDgs.map(service => <div key={service.id} className="flex items-center gap-2 text-sm"><Waypoints className="w-4 h-4 shrink-0 text-secondary" /><span className="flex-1">{service.nom}</span><Button size="sm" variant="ghost" aria-label={`Renommer ${service.nom}`} onClick={() => begin({ kind: "services-dgs", id: service.id, nom: service.nom })}><Pencil className="w-3.5 h-3.5" /></Button></div>)}
                <Button size="sm" variant="outline" onClick={() => begin({ kind: "services-dgs", parentLabel: DIRECTION_GENERALE_SERVICES, nom: "" })}><Plus className="w-3.5 h-3.5 mr-1" /> Service directement rattaché à la DGS</Button>
              </div>
            </section>
            {!query.data?.organisation.length && <div className="py-12 text-center text-muted-foreground"><Building2 className="mx-auto mb-3 w-8 h-8 text-secondary" />Aucune direction. Ajoutez la première pour construire l’organigramme.</div>}
            {query.data?.organisation.map(direction => <section key={direction.id} className="rounded-lg border overflow-hidden">
              <div className="bg-accent/40 px-4 py-3 flex gap-2 items-center"><Building2 className="w-4 h-4 shrink-0 text-primary" /><h3 className="font-semibold flex-1 min-w-0" dir="auto">{direction.direction}</h3><Button variant="ghost" size="sm" aria-label={`Renommer ${direction.direction}`} onClick={() => begin({ kind: "directions", id: direction.id, nom: direction.direction })}><Pencil className="w-4 h-4" /></Button></div>
              <div className="p-3 space-y-3">
                {direction.divisions.map(division => <div key={division.id} className="border-l-2 border-secondary/40 pl-3 ml-2">
                  <div className="flex gap-2 items-center"><Layers3 className="w-4 h-4 shrink-0 text-secondary" /><span className="font-medium text-sm flex-1" dir="auto">{division.nom}</span><Button size="sm" variant="ghost" aria-label={`Renommer ${division.nom}`} onClick={() => begin({ kind: "divisions", id: division.id, nom: division.nom })}><Pencil className="w-3.5 h-3.5" /></Button><Button size="sm" variant="outline" onClick={() => begin({ kind: "services", parentId: division.id, parentLabel: division.nom, nom: "" })}><Plus className="w-3.5 h-3.5 mr-1" /> Service</Button></div>
                  <div className="mt-2 ml-6 space-y-1">{division.services.map(service => <div key={service.id} className="flex items-center gap-2 text-sm py-1"><Waypoints className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /><span className="flex-1" dir="auto">{service.nom}</span><Button size="sm" variant="ghost" aria-label={`Renommer ${service.nom}`} onClick={() => begin({ kind: "services", id: service.id, nom: service.nom })}><Pencil className="w-3.5 h-3.5" /></Button></div>)}</div>
                </div>)}
                <Button size="sm" variant="outline" onClick={() => begin({ kind: "divisions", parentId: direction.id, parentLabel: direction.direction, nom: "" })}><Plus className="w-3.5 h-3.5 mr-1" /> Ajouter une division</Button>
              </div>
            </section>)}
          </CardContent>
        </Card>
        <Card className="overflow-hidden shadow-sm"><div className="p-5 border-b bg-muted/30 flex flex-wrap gap-3 justify-between items-center"><div><h2 className="font-semibold text-lg">Maîtrises d’ouvrage</h2><p className="text-sm text-muted-foreground">Liste commune aux deux champs MO</p></div><Button size="sm" variant="outline" onClick={() => begin({ kind: "maitrises-ouvrage", nom: "" })}><Plus className="w-4 h-4 mr-1" /> Ajouter</Button></div>
          <CardContent className="p-4 sm:p-5">{!query.data?.maitrisesOuvrage.length ? <p className="py-10 text-center text-sm text-muted-foreground">Aucune maîtrise d’ouvrage enregistrée.</p> : <div className="divide-y">{query.data.maitrisesOuvrage.map(item => <div key={item.id} className="flex items-center gap-3 py-2.5"><span className="flex-1 text-sm" dir="auto">{item.nom}</span><Button size="sm" variant="ghost" aria-label={`Renommer ${item.nom}`} onClick={() => begin({ kind: "maitrises-ouvrage", id: item.id, nom: item.nom })}><Pencil className="w-4 h-4" /></Button></div>)}</div>}</CardContent>
        </Card>
      </div>}
    <Dialog open={!!draft} onOpenChange={open => { if (!open && !mutation.isPending) setDraft(null); }}><DialogContent><DialogHeader><DialogTitle>{draft?.id == null ? "Ajouter" : "Renommer"} {draft ? `une ${labels[draft.kind]}` : ""}</DialogTitle><DialogDescription>{draft?.parentLabel ? `Dans « ${draft.parentLabel} ». ` : ""}Les noms sont utilisés dans les comptes et les conventions. Aucun élément ne peut être supprimé ici.</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4"><div className="space-y-1.5"><label htmlFor="reference-name" className="text-sm font-medium">Nom</label><Input id="reference-name" data-testid="input-reference-name" autoFocus required maxLength={255} value={draft?.nom ?? ""} onChange={event => setDraft(previous => previous ? { ...previous, nom: event.target.value } : null)} /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setDraft(null)}>Annuler</Button><Button type="submit" disabled={mutation.isPending || !draft?.nom.trim()}>{mutation.isPending ? "Enregistrement…" : "Enregistrer"}</Button></div></form>
    </DialogContent></Dialog>
  </div>;
}