import { useState } from "react";
import { Link } from "wouter";
import { 
  useListConventions,
  useGetOptionsFiltres,
  NiveauAlerte,
  ListConventionsTri,
  ListConventionsOrdre
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Download, Plus, FilterX, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { AlerteBadge } from "@/components/alerte-badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/utils";
import { useAuth, errorMessage } from "@/hooks/use-auth";

export default function ConventionsList() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [alerte, setAlerte] = useState<NiveauAlerte | undefined>();
  const [rattachement, setRattachement] = useState<string | undefined>();
  const [statutConvention, setStatutConvention] = useState<string | undefined>();
  const [tri, setTri] = useState<ListConventionsTri>("urgence");
  // Urgence ascendante = les retards en tête (rang 0), « À qualifier » en fin.
  const [ordre, setOrdre] = useState<ListConventionsOrdre>("asc");

  const { data, isLoading, isError, error, refetch } = useListConventions({
    page,
    pageSize: 15,
    q: q || undefined,
    alerte,
    rattachement: rattachement === "all" ? undefined : rattachement,
    statutConvention: statutConvention === "all" ? undefined : statutConvention,
    tri,
    ordre,
  });

  const { data: options } = useGetOptionsFiltres();

  const handleSort = (field: ListConventionsTri) => {
    if (tri === field) {
      setOrdre(ordre === "asc" ? "desc" : "asc");
    } else {
      setTri(field);
      setOrdre("asc");
    }
  };

  const buildExportUrl = () => {
    const params = new URLSearchParams();
    if (q) params.append("q", q);
    if (alerte) params.append("alerte", alerte);
    if (rattachement && rattachement !== "all") params.append("rattachement", rattachement);
    if (statutConvention && statutConvention !== "all") params.append("statutConvention", statutConvention);
    if (tri) params.append("tri", tri);
    if (ordre) params.append("ordre", ordre);
    
    return `/api/conventions/export?${params.toString()}`;
  };

  const SortIcon = ({ field }: { field: ListConventionsTri }) => {
    if (tri !== field) return <div className="w-4 h-4" />;
    return ordre === "asc" ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Conventions ({data?.total || 0})</h1>
          <p className="text-muted-foreground text-sm">Gérez et suivez le portefeuille de conventions.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" asChild>
            <a href={buildExportUrl()} download className="flex items-center gap-2">
              <Download className="w-4 h-4" /> Export CSV
            </a>
          </Button>
          {user?.role !== "directeur" && user?.role !== "directeur_general_services" && <Button asChild className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm">
            <Link href="/conventions/nouvelle" className="flex items-center gap-2">
              <Plus className="w-4 h-4" /> Nouvelle Convention
            </Link>
          </Button>}
        </div>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Rechercher (intitulé en arabe ou en français, responsable, etc.)..."
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                className="pl-9 h-10 w-full bg-accent/20"
                dir="auto"
              />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:flex lg:flex-wrap items-center gap-3 [&_button[role=combobox]]:w-full lg:[&_button[role=combobox]]:w-auto">
              <Select value={alerte || "all"} onValueChange={(v) => { setAlerte(v === "all" ? undefined : v as NiveauAlerte); setPage(1); }}>
                <SelectTrigger className="w-[160px] h-10">
                  <SelectValue placeholder="Niveau d'alerte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les alertes</SelectItem>
                  <SelectItem value="EN_RETARD">En retard</SelectItem>
                  <SelectItem value="A_DECLENCHER">À déclencher</SelectItem>
                  <SelectItem value="A_PREPARER">À préparer</SelectItem>
                  <SelectItem value="A_JOUR">À jour</SelectItem>
                  <SelectItem value="A_SURVEILLER">À surveiller</SelectItem>
                  <SelectItem value="A_QUALIFIER">À qualifier</SelectItem>
                </SelectContent>
              </Select>

              {/* Les colonnes « statut » et « rattachement » sont vides dans le
                  fichier Excel importé : afficher un filtre sans option laisserait
                  croire à un bug. Il n'apparaît qu'une fois des valeurs saisies. */}
              {(options?.statuts.length ?? 0) > 0 && (
              <Select value={statutConvention || "all"} onValueChange={(v) => { setStatutConvention(v); setPage(1); }}>
                <SelectTrigger className="w-[160px] h-10">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  {options?.statuts.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              )}

              {(options?.rattachements.length ?? 0) > 0 && (
              <Select value={rattachement || "all"} onValueChange={(v) => { setRattachement(v); setPage(1); }}>
                <SelectTrigger className="w-[200px] h-10 [&>span]:truncate">
                  <SelectValue placeholder="Rattachement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les rattachements</SelectItem>
                  {options?.rattachements.map(r => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              )}

              {(q || alerte || rattachement || statutConvention) && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => { setQ(""); setAlerte(undefined); setRattachement(undefined); setStatutConvention(undefined); setPage(1); }}
                  className="h-10 w-10 text-muted-foreground hover:text-destructive"
                  title="Effacer les filtres"
                >
                  <FilterX className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {isError && <Card><CardContent className="p-8 text-center"><p role="alert" className="text-destructive">{errorMessage(error)}</p><Button variant="outline" className="mt-4" onClick={() => void refetch()}>Réessayer</Button></CardContent></Card>}
      {!isError && <div className="bg-card rounded-xl border shadow-sm overflow-hidden flex flex-col">
        {/* Sur mobile, le tableau devient une liste de cartes : un tableau à six
            colonnes forcerait un défilement horizontal, et les noms arabes,
            alignés à droite, démarreraient hors de l'écran. */}
        <div className="md:hidden divide-y divide-border">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="p-4 space-y-2">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))
          ) : data?.items.length === 0 ? (
            <div className="px-4 py-12 text-center text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              {user?.role === "chef_division" || user?.role === "chef_service" ? "Aucune convention attribuée à votre périmètre. Les anciennes conventions sans rattachement restent accessibles à l'administration." : "Aucune convention trouvée avec ces filtres."}
            </div>
          ) : (
            data?.items.map((conv) => (
              <Link key={conv.id} href={`/conventions/${conv.id}`}>
                <div className="p-4 active:bg-accent/40 transition-colors">
                  <AlerteBadge alerte={conv.alerte} />
                  <div dir="auto" className="mt-2 font-semibold leading-relaxed line-clamp-3">
                    {conv.nomConvention}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Dernier comité :{" "}
                      {conv.dernierComite
                        ? format(new Date(conv.dernierComite), "dd/MM/yyyy")
                        : "—"}
                    </span>
                    <span className="font-medium text-foreground">
                      Échéance :{" "}
                      {conv.prochaineEcheance
                        ? format(new Date(conv.prochaineEcheance), "dd/MM/yyyy")
                        : "—"}
                    </span>
                  </div>
                  {(conv.dernierComiteNote || conv.prochaineEcheanceNote) && (
                    <div
                      dir="auto"
                      className="mt-2 text-xs italic text-muted-foreground line-clamp-2"
                    >
                      {conv.prochaineEcheanceNote || conv.dernierComiteNote}
                    </div>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-4 cursor-pointer hover:text-foreground transition-colors group w-12" onClick={() => handleSort("urgence")}>
                  <div className="flex items-center gap-1">Alerte <SortIcon field="urgence" /></div>
                </th>
                <th className="px-4 py-4 cursor-pointer hover:text-foreground transition-colors group min-w-[300px]" onClick={() => handleSort("nomConvention")}>
                  <div className="flex items-center gap-1">Convention <SortIcon field="nomConvention" /></div>
                </th>
                <th className="px-4 py-4 cursor-pointer hover:text-foreground transition-colors group w-48" onClick={() => handleSort("statutConvention")}>
                  <div className="flex items-center gap-1">Statut / Entité <SortIcon field="statutConvention" /></div>
                </th>
                <th className="px-4 py-4 cursor-pointer hover:text-foreground transition-colors group w-40" onClick={() => handleSort("dernierComite")}>
                  <div className="flex items-center gap-1">Dernier Comité <SortIcon field="dernierComite" /></div>
                </th>
                <th className="px-4 py-4 cursor-pointer hover:text-foreground transition-colors group w-40" onClick={() => handleSort("prochaineEcheance")}>
                  <div className="flex items-center gap-1">Proch. Échéance <SortIcon field="prochaineEcheance" /></div>
                </th>
                <th className="px-4 py-4 text-right w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-4"><Skeleton className="h-6 w-20 rounded-full" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-full mb-2" /><Skeleton className="h-3 w-3/4" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-3 w-32" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-4"><Skeleton className="h-8 w-16 ml-auto rounded" /></td>
                  </tr>
                ))
              ) : data?.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    {user?.role === "chef_division" || user?.role === "chef_service" ? "Aucune convention attribuée à votre périmètre. Les anciennes conventions sans rattachement restent accessibles à l'administration." : "Aucune convention trouvée avec ces filtres."}
                  </td>
                </tr>
              ) : (
                data?.items.map((conv, i) => (
                  <tr 
                    key={conv.id} 
                    className="hover:bg-accent/30 transition-colors animate-in fade-in slide-in-from-bottom-2"
                    style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'both' }}
                  >
                    <td className="px-4 py-4 align-top">
                      <AlerteBadge alerte={conv.alerte} />
                    </td>
                    <td className="px-4 py-4 align-top max-w-[400px]">
                      <div dir="auto" className="font-semibold text-foreground text-base leading-relaxed line-clamp-2 hover:line-clamp-none transition-all" title={conv.nomConvention}>
                        {conv.nomConvention}
                      </div>
                      {(conv.enveloppeBudgetaire || conv.contributionRegion) && (
                        <div className="mt-2 text-xs font-medium text-muted-foreground flex gap-3">
                          {conv.enveloppeBudgetaire && <span>Budget: {formatNumber(conv.enveloppeBudgetaire)} MAD</span>}
                          {conv.contributionRegion && <span className="text-primary/80">Région: {formatNumber(conv.contributionRegion)} MAD</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top">
                      <div className="font-medium text-foreground text-sm">
                        {conv.statutConvention || "Non défini"}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 line-clamp-2" title={conv.rattachement || ""}>
                        {conv.rattachement || "-"}
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-sm">
                      <div className="font-medium">
                        {conv.dernierComite ? format(new Date(conv.dernierComite), "dd/MM/yyyy") : "-"}
                      </div>
                      {conv.dernierComiteNote && (
                        <div dir="auto" className="text-xs text-muted-foreground mt-1 line-clamp-2 italic bg-muted/30 p-1 rounded inline-block">
                          {conv.dernierComiteNote}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top text-sm">
                      <div className="font-bold text-foreground">
                        {conv.prochaineEcheance ? format(new Date(conv.prochaineEcheance), "dd/MM/yyyy") : "-"}
                      </div>
                      {conv.prochaineEcheanceNote && (
                        <div dir="auto" className="text-xs text-muted-foreground mt-1 line-clamp-2 italic bg-muted/30 p-1 rounded inline-block">
                          {conv.prochaineEcheanceNote}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top text-right">
                      <Button variant="secondary" size="sm" asChild className="w-full font-medium">
                        <Link href={`/conventions/${conv.id}`}>Ouvrir</Link>
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        
        {data && data.totalPages > 1 && (
          <div className="border-t border-border p-4 bg-muted/20 flex flex-col sm:flex-row items-center gap-3 sm:justify-between">
            <span className="text-sm text-muted-foreground">
              Affichage {(page - 1) * data.pageSize + 1} à{" "}
              {Math.min(page * data.pageSize, data.total)} sur {data.total}
            </span>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Précédent
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
                disabled={page === data.totalPages}
              >
                Suivant
              </Button>
            </div>
          </div>
        )}
      </div>}
    </div>
  );
}
