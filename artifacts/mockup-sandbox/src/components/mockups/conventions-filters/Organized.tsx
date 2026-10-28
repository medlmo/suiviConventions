import "./_group.css";
import { useState } from "react";
import { FilterX, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PartenaireMultiSelect } from "./PartenaireMultiSelect";

const natures = ["Infrastructure", "Prestations", "Équipement"];
const rattachements = ["DGS", "DPE", "DRH"];
const statuts = ["En cours", "Signée", "Clôturée"];
const partenaires = ["Province de Taroudant", "Université Ibn Zohr", "Agence urbaine"];

export function Organized() {
  const [q, setQ] = useState("");
  const [alerte, setAlerte] = useState("all");
  const [rattachement, setRattachement] = useState("all");
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [statut, setStatut] = useState("all");
  const [nature, setNature] = useState("all");
  const [sessionDu, setSessionDu] = useState("");
  const [sessionAu, setSessionAu] = useState("");
  const hasFilters = Boolean(q || alerte !== "all" || rattachement !== "all"
    || selectedPartners.length || statut !== "all" || nature !== "all" || sessionDu || sessionAu);

  const clearFilters = () => {
    setQ("");
    setAlerte("all");
    setRattachement("all");
    setSelectedPartners([]);
    setStatut("all");
    setNature("all");
    setSessionDu("");
    setSessionAu("");
  };

  return (
    <div className="min-h-screen bg-background p-5">
      <Card className="overflow-hidden border-border/80 shadow-sm">
        <CardContent className="space-y-5 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <label htmlFor="organized-search" className="sr-only">Rechercher une convention</label>
              <Input
                id="organized-search"
                placeholder="Rechercher une convention…"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                className="h-10 w-full bg-background pl-9"
                dir="auto"
              />
            </div>
            {hasFilters && (
              <Button type="button" variant="outline" onClick={clearFilters} className="h-10 shrink-0 gap-2">
                <FilterX className="h-4 w-4" />
                Effacer les filtres
              </Button>
            )}
          </div>

          <section className="space-y-3 border-t border-border pt-4" aria-labelledby="organized-filter-title">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 id="organized-filter-title" className="text-sm font-semibold text-foreground">Affiner la liste</h2>
              <span className="text-xs text-muted-foreground">Filtres facultatifs</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="min-w-0 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Niveau d’alerte</label>
                <Select value={alerte} onValueChange={setAlerte}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Toutes les alertes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les alertes</SelectItem>
                    <SelectItem value="EN_RETARD">En retard</SelectItem>
                    <SelectItem value="A_DECLENCHER">À déclencher</SelectItem>
                    <SelectItem value="A_PREPARER">À préparer</SelectItem>
                    <SelectItem value="A_JOUR">À jour</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Statut</label>
                <Select value={statut} onValueChange={setStatut}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Tous les statuts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les statuts</SelectItem>
                    {statuts.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Nature du projet</label>
                <Select value={nature} onValueChange={setNature}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Toutes les natures" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes les natures</SelectItem>
                    {natures.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Rattachement</label>
                <Select value={rattachement} onValueChange={setRattachement}>
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Tous les rattachements" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les rattachements</SelectItem>
                    {rattachements.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="min-w-0 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Partenaires</label>
                <PartenaireMultiSelect
                  options={partenaires}
                  selected={selectedPartners}
                  onChange={setSelectedPartners}
                  buttonClassName="h-10 w-full justify-between font-normal"
                />
              </div>

              <div className="min-w-0 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Date de session</label>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-2">
                  <div className="min-w-0 space-y-1">
                    <label htmlFor="organized-session-du" className="text-[11px] text-muted-foreground">Du</label>
                    <Input
                      id="organized-session-du"
                      type="date"
                      aria-label="Session à partir du"
                      value={sessionDu}
                      max={sessionAu || undefined}
                      onChange={(event) => setSessionDu(event.target.value)}
                      className="h-10 min-w-0 w-full px-2"
                    />
                  </div>
                  <span className="pb-2 text-xs text-muted-foreground" aria-hidden="true">au</span>
                  <div className="min-w-0 space-y-1">
                    <label htmlFor="organized-session-au" className="text-[11px] text-muted-foreground">Au</label>
                    <Input
                      id="organized-session-au"
                      type="date"
                      aria-label="Session jusqu’au"
                      value={sessionAu}
                      min={sessionDu || undefined}
                      onChange={(event) => setSessionAu(event.target.value)}
                      className="h-10 min-w-0 w-full px-2"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
