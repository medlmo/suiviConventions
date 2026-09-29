import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useReferenceData } from "@/hooks/use-reference-data";
import { errorMessage } from "@/hooks/use-auth";

type Props = { value?: string[] | null; onChange: (value: string[] | null) => void; label: string };

export function MaitriseOuvrageSelect({ value, onChange, label }: Props) {
  const [open, setOpen] = useState(false);
  const query = useReferenceData();
  const selected = Array.isArray(value) ? value : [];
  const known = query.data?.maitrisesOuvrage ?? [];
  const unknown = selected.filter(name => !known.some(item => item.nom === name));
  const toggle = (name: string) => {
    const next = selected.includes(name) ? selected.filter(item => item !== name) : [...selected, name];
    onChange(next.length ? next : null);
  };
  return <div className="space-y-2">
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><Button data-testid={`button-select-${label}`} type="button" variant="outline" role="combobox" aria-expanded={open} aria-label={label} disabled={query.isPending || query.isError} className="w-full justify-between min-h-10 h-auto text-left font-normal">
        <span className="truncate">{query.isPending ? "Chargement du référentiel…" : selected.length ? `${selected.length} sélection${selected.length > 1 ? "s" : ""}` : "Choisir dans le référentiel"}</span><ChevronDown className="w-4 h-4 ml-2 shrink-0 opacity-60" />
      </Button></PopoverTrigger>
      <PopoverContent align="start" className="w-[min(23rem,90vw)] p-1 max-h-72 overflow-y-auto">
        {!known.length && <p className="p-3 text-sm text-muted-foreground">Aucune maîtrise d’ouvrage dans le référentiel.</p>}
        {known.map(item => <button type="button" key={item.id} data-testid={`button-mo-${label}-${item.id}`} role="checkbox" aria-checked={selected.includes(item.nom)} onClick={() => toggle(item.nom)} className="w-full text-left flex items-start gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Check className={`w-4 h-4 shrink-0 mt-0.5 ${selected.includes(item.nom) ? "text-primary" : "opacity-0"}`} /><span dir="auto">{item.nom}</span>
        </button>)}
      </PopoverContent>
    </Popover>
    {query.isError && <p role="alert" className="text-xs text-destructive">Référentiel indisponible : {errorMessage(query.error)} <button type="button" className="underline" onClick={() => void query.refetch()}>Réessayer</button></p>}
    {!!selected.length && <div className="flex flex-wrap gap-1.5">{selected.map(name => <span key={name} className="inline-flex max-w-full items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs text-accent-foreground"><span dir="auto" className="truncate">{name}</span>{unknown.includes(name) && <span className="opacity-70">(historique)</span>}<button type="button" aria-label={`Retirer ${name} de ${label}`} data-testid={`button-remove-mo-${label}-${name}`} onClick={() => toggle(name)} className="ml-1 font-bold hover:text-destructive">×</button></span>)}</div>}
    {!!unknown.length && <p className="text-xs text-muted-foreground">Les valeurs historiques restent enregistrées tant que vous ne les retirez pas.</p>}
  </div>;
}