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

export function Current() {
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
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher (intitulé en arabe ou en français, responsable, etc.)..."
                value={q}
                onChange={(event) => setQ(event.target.value)}
                className="pl-9 h-10 w-full bg-accent/20"
                dir="auto"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 lg:flex lg:flex-wrap items-center gap-3 [&_button[role=combobox]]:w-full lg:[&_button[role=combobox]]:w-auto">
              <Select value={alerte} onValueChange={setAlerte}>
                <SelectTrigger className="w-[160px] h-10">
                  <SelectValue placeholder="Niveau d'alerte" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les alertes</SelectItem>
                  <SelectItem value="EN_RETARD">En retard</SelectItem>
                  <SelectItem value="A_DECLENCHER">À déclencher</SelectItem>
                  <SelectItem value="A_PREPARER">À préparer</SelectItem>
                  <SelectItem value="A_JOUR">À jour</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statut} onValueChange={setStatut}>
                <SelectTrigger className="w-[160px] h-10">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  {statuts.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={nature} onValueChange={setNature}>
                <SelectTrigger className="w-[200px] h-10 [&>span]:truncate">
                  <SelectValue placeholder="Nature du projet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les natures</SelectItem>
                  {natures.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>

              <div className="col-span-1 flex w-full flex-col gap-1 sm:col-span-2 lg:col-span-1 lg:w-[340px]">
                <span className="text-xs text-muted-foreground">Date de session</span>
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <label htmlFor="current-session-du" className="sr-only">Session à partir du</label>
                    <Input id="current-session-du" type="date" aria-label="Session à partir du" title="Session à partir du" value={sessionDu} max={sessionAu || undefined} onChange={(event) => setSessionDu(event.target.value)} className="h-10 w-full" />
                  </div>
                  <span className="pb-2 text-sm text-muted-foreground" aria-hidden="true">au</span>
                  <div className="min-w-0 flex-1">
                    <label htmlFor="current-session-au" className="sr-only">Session jusqu'au</label>
                    <Input id="current-session-au" type="date" aria-label="Session jusqu'au" title="Session jusqu'au" value={sessionAu} min={sessionDu || undefined} onChange={(event) => setSessionAu(event.target.value)} className="h-10 w-full" />
                  </div>
                </div>
              </div>

              <Select value={rattachement} onValueChange={setRattachement}>
                <SelectTrigger className="w-[200px] h-10 [&>span]:truncate">
                  <SelectValue placeholder="Rattachement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les rattachements</SelectItem>
                  {rattachements.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                </SelectContent>
              </Select>

              <PartenaireMultiSelect options={partenaires} selected={selectedPartners} onChange={setSelectedPartners} />

              {hasFilters && (
                <Button variant="ghost" size="icon" onClick={clearFilters} className="h-10 w-10 text-muted-foreground hover:text-destructive" title="Effacer les filtres">
                  <FilterX className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
