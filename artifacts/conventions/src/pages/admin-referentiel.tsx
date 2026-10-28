import { useMemo, useState, type FormEvent } from "react";
import { Building2, ChevronLeft, ChevronRight, FolderTree, Layers3, Pencil, Plus, Search, Waypoints, X } from "lucide-react";
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
const PAGE_SIZE = 20;

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/[یىئ]/g, "ي")
    .replace(/ک/g, "ك")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/[\u0640\u064B-\u0655\u0670]/g, "");
}

export default function AdminReferentiel() {
  const query = useReferenceData();
  const mutation = useReferenceMutation();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState<"organisation" | "maitrises-ouvrage">("maitrises-ouvrage");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const maitrisesOuvrage = query.data?.maitrisesOuvrage ?? [];
  const filteredMaitrises = useMemo(() => {
    const term = normalizeSearchText(search.trim());
    return maitrisesOuvrage
      .filter(item => !term || normalizeSearchText(item.nom).includes(term))
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }, [maitrisesOuvrage, search]);
  const pageCount = Math.max(1, Math.ceil(filteredMaitrises.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleMaitrises = filteredMaitrises.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rangeStart = filteredMaitrises.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredMaitrises.length);
  const begin = (next: Draft) => { setError(""); mutation.reset(); setDraft(next); };
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!draft?.nom.trim()) return;
    mutation.mutate({ ...draft, nom: draft.nom.trim() }, {
      onSuccess: () => {
        if (draft.kind === "maitrises-ouvrage") {
          setActiveSection("maitrises-ouvrage");
          if (draft.id == null) setSearch("");
          setPage(1);
        }
        setDraft(null);
        setError("");
      },
      onError: cause => setError(errorMessage(cause)),
    });
  };
  return <div className="space-y-6 pb-16">
    <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
      <div><span className="text-sm font-medium text-muted-foreground">Administration / données de référence</span><h1 className="text-2xl font-semibold mt-1">Référentiel</h1><p className="text-muted-foreground mt-1">Organigramme et maîtrises d’ouvrage utilisés dans les conventions et les comptes.</p></div>
      <Button data-testid="button-add-reference" onClick={() => begin(activeSection === "organisation" ? { kind: "directions", nom: "" } : { kind: "maitrises-ouvrage", nom: "" })}>
        <Plus className="w-4 h-4 mr-2" /> {activeSection === "organisation" ? "Nouvelle direction" : "Ajouter une maîtrise"}
      </Button>
    </div>
    <div role="group" aria-label="Sections du référentiel" className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant={activeSection === "organisation" ? "default" : "outline"}
        data-testid="button-view-organisation"
        aria-pressed={activeSection === "organisation"}
        onClick={() => setActiveSection("organisation")}
      >
        <FolderTree className="mr-2 h-4 w-4" /> Organigramme
      </Button>
      <Button
        type="button"
        variant={activeSection === "maitrises-ouvrage" ? "default" : "outline"}
        data-testid="button-view-maitrises"
        aria-pressed={activeSection === "maitrises-ouvrage"}
        onClick={() => setActiveSection("maitrises-ouvrage")}
      >
        <Building2 className="mr-2 h-4 w-4" /> Maîtrises d’ouvrage
      </Button>
    </div>
    {query.isPending ? <Skeleton className="h-96 rounded-md" /> :
      query.isError ? <Card><CardContent className="py-12 text-center"><p role="alert" className="text-destructive">Le référentiel n’a pas pu être chargé : {errorMessage(query.error)}</p><Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>Réessayer</Button></CardContent></Card> :
      activeSection === "organisation" ? <Card className="overflow-hidden">
        <div className="p-5 border-b bg-muted/30 flex flex-wrap gap-3 justify-between items-center">
          <div><h2 className="font-semibold text-lg flex items-center gap-2"><FolderTree className="w-5 h-5 text-secondary" /> Organigramme</h2><p className="text-sm text-muted-foreground">Directions, divisions et services</p></div>
        </div>
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
      </Card> : <Card className="overflow-hidden">
        <div className="p-5 border-b bg-muted/30 space-y-4">
          <div><h2 className="font-semibold text-lg">Catalogue des organismes</h2><p className="text-sm text-muted-foreground">Recherchez par nom pour retrouver rapidement une entrée.</p></div>
          <div className="relative max-w-lg">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              data-testid="input-search-maitrise"
              onChange={event => { setSearch(event.target.value); setPage(1); }}
              aria-label="Rechercher une maîtrise d’ouvrage"
              placeholder="Rechercher un organisme…"
              className="pl-9 pr-9 bg-card"
            />
            {search && <button type="button" data-testid="button-clear-maitrise-search" onClick={() => { setSearch(""); setPage(1); }} aria-label="Effacer la recherche" className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            <span className="font-semibold text-foreground" data-testid="text-maitrise-count">{filteredMaitrises.length}</span>
            {" "}{filteredMaitrises.length === 1 ? "résultat" : "résultats"}
            {search && <span> pour « {search} »</span>}
          </p>
        </div>
        {visibleMaitrises.length ? <div className="divide-y">
          {visibleMaitrises.map((item, index) => <div key={item.id} data-testid={`row-maitrise-${item.id}`} className="grid grid-cols-[32px_minmax(0,1fr)_40px] items-center gap-3 px-4 py-3 sm:grid-cols-[36px_minmax(0,1fr)_80px] sm:px-6">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted font-mono text-[10px] text-muted-foreground">{String((currentPage - 1) * PAGE_SIZE + index + 1).padStart(2, "0")}</span>
            <span className="min-w-0 text-sm" dir="auto">{item.nom}</span>
            <Button size="sm" variant="ghost" data-testid={`button-rename-maitrise-${item.id}`} aria-label={`Renommer ${item.nom}`} onClick={() => begin({ kind: "maitrises-ouvrage", id: item.id, nom: item.nom })} className="justify-self-end"><Pencil className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">Renommer</span></Button>
          </div>)}
        </div> : <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><Search className="h-5 w-5" /></span>
          <h3 className="text-sm font-semibold">{search ? "Aucun organisme trouvé" : "Aucune maîtrise d’ouvrage enregistrée"}</h3>
          <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{search ? "Essayez un autre terme ou effacez la recherche pour parcourir le catalogue." : "Ajoutez une maîtrise d’ouvrage pour la rendre disponible dans les conventions."}</p>
          {search && <Button type="button" variant="outline" size="sm" data-testid="button-clear-maitrise-search-empty" className="mt-4" onClick={() => { setSearch(""); setPage(1); }}>Effacer la recherche</Button>}
        </div>}
        <footer className="flex flex-col gap-3 border-t bg-muted/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm text-muted-foreground">
            <span data-testid="text-maitrise-page-range">{rangeStart}–{rangeEnd} sur {filteredMaitrises.length} entrée{filteredMaitrises.length > 1 ? "s" : ""}</span>
            <span className="ml-1">· catalogue complet : {maitrisesOuvrage.length}</span>
          </p>
          <nav aria-label="Pagination du catalogue" className="flex items-center gap-2 self-end sm:self-auto">
            <Button variant="outline" size="sm" type="button" data-testid="button-previous-maitrise-page" disabled={currentPage <= 1} onClick={() => setPage(current => Math.max(1, Math.min(current, pageCount) - 1))}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Précédent
            </Button>
            <span className="min-w-16 text-center font-mono text-xs text-muted-foreground">{currentPage} / {pageCount}</span>
            <Button variant="outline" size="sm" type="button" data-testid="button-next-maitrise-page" disabled={currentPage >= pageCount} onClick={() => setPage(current => Math.min(pageCount, current + 1))}>
              Suivant <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </nav>
        </footer>
      </Card>}
    <Dialog open={!!draft} onOpenChange={open => { if (!open && !mutation.isPending) setDraft(null); }}><DialogContent><DialogHeader><DialogTitle>{draft?.id == null ? "Ajouter" : "Renommer"} {draft ? `une ${labels[draft.kind]}` : ""}</DialogTitle><DialogDescription>{draft?.parentLabel ? `Dans « ${draft.parentLabel} ». ` : ""}Les noms sont utilisés dans les comptes et les conventions. Aucun élément ne peut être supprimé ici.</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4"><div className="space-y-1.5"><label htmlFor="reference-name" className="text-sm font-medium">Nom</label><Input id="reference-name" data-testid="input-reference-name" autoFocus required maxLength={255} value={draft?.nom ?? ""} onChange={event => setDraft(previous => previous ? { ...previous, nom: event.target.value } : null)} /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => setDraft(null)}>Annuler</Button><Button type="submit" disabled={mutation.isPending || !draft?.nom.trim()}>{mutation.isPending ? "Enregistrement…" : "Enregistrer"}</Button></div></form>
    </DialogContent></Dialog>
  </div>;
}