import { useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useReferenceData } from "@/hooks/use-reference-data";
import { errorMessage } from "@/hooks/use-auth";

const comparateurAlphabetique = new Intl.Collator("fr", {
  numeric: true,
  sensitivity: "base",
});

type Props = {
  value?: string[] | string | null;
  onChange: (value: string[] | string | null) => void;
  label: string;
  multiple?: boolean;
  intitule?: string;
};

function normaliserRecherche(valeur: string): string {
  return valeur.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr");
}

export function MaitriseOuvrageSelect({
  value,
  onChange,
  label,
  multiple = true,
  intitule = "maîtrise d’ouvrage",
}: Props) {
  const [open, setOpen] = useState(false);
  const [recherche, setRecherche] = useState("");
  const rechercheRef = useRef<HTMLInputElement>(null);
  const query = useReferenceData();
  const selected = multiple
    ? (Array.isArray(value) ? value : [])
    : (typeof value === "string" && value ? [value] : []);
  const selectionsTriees = [...selected].sort((a, b) => comparateurAlphabetique.compare(a, b));
  const known = query.data?.maitrisesOuvrage ?? [];
  const unknown = selected.filter(name => !known.some(item => item.nom === name));
  const terme = normaliserRecherche(recherche.trim());
  const correspond = (nom: string) => !terme || normaliserRecherche(nom).includes(terme);
  const optionsConnues = known
    .filter(item => correspond(item.nom))
    .sort((a, b) => comparateurAlphabetique.compare(a.nom, b.nom));
  const optionsHistoriques = unknown
    .filter(correspond)
    .sort((a, b) => comparateurAlphabetique.compare(a, b));
  const toggle = (name: string) => {
    if (!multiple) {
      onChange(name);
      setOpen(false);
      return;
    }
    const next = selected.includes(name) ? selected.filter(item => item !== name) : [...selected, name];
    onChange(next.length ? next : null);
  };
  return <div className="space-y-2">
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setRecherche("");
      }}
    >
      <PopoverTrigger asChild><Button data-testid={`button-select-${label}`} type="button" variant="outline" role="combobox" aria-expanded={open} aria-label={intitule} disabled={query.isPending || query.isError} className="w-full justify-between min-h-10 h-auto text-left font-normal">
        <span dir="auto" className="truncate">{query.isPending ? "Chargement du référentiel…" : selected.length ? (multiple ? `${selected.length} sélection${selected.length > 1 ? "s" : ""}` : selected[0]) : "Choisir dans le référentiel"}</span><ChevronDown className="w-4 h-4 ml-2 shrink-0 opacity-60" />
      </Button></PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(23rem,90vw)] p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          rechercheRef.current?.focus();
        }}
      >
        <div className="border-b p-3">
          <label htmlFor={`recherche-${label}`} className="sr-only">Rechercher {intitule}</label>
          <Input
            ref={rechercheRef}
            id={`recherche-${label}`}
            type="search"
            value={recherche}
            onChange={(event) => setRecherche(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
            placeholder="Rechercher dans la liste…"
            autoComplete="off"
          />
        </div>
        <div role="listbox" aria-label={intitule} aria-multiselectable={multiple || undefined} className="max-h-64 overflow-y-auto p-1">
          {!known.length && !unknown.length ? (
            <p className="p-3 text-sm text-muted-foreground">Aucune maîtrise d’ouvrage dans le référentiel.</p>
          ) : (
            <>
              {optionsConnues.map(item => <button type="button" key={item.id} data-testid={`button-mo-${label}-${item.id}`} role={multiple ? "checkbox" : "option"} aria-checked={multiple ? selected.includes(item.nom) : undefined} aria-selected={!multiple ? selected.includes(item.nom) : undefined} onClick={() => toggle(item.nom)} className="w-full text-left flex items-start gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <Check className={`w-4 h-4 shrink-0 mt-0.5 ${selected.includes(item.nom) ? "text-primary" : "opacity-0"}`} /><span dir="auto">{item.nom}</span>
              </button>)}
              {!!optionsHistoriques.length && (
                <div className="border-t mt-1 pt-1">
                  <p className="px-3 py-1 text-xs text-muted-foreground">Valeurs historiques sélectionnées</p>
                  {optionsHistoriques.map(name => <button type="button" key={name} role={multiple ? "checkbox" : "option"} aria-checked={multiple ? true : undefined} aria-selected={!multiple ? true : undefined} onClick={() => toggle(name)} className="w-full text-left flex items-start gap-2 px-3 py-2 rounded-md text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Check className="w-4 h-4 shrink-0 mt-0.5 text-primary" /><span dir="auto">{name}</span>
                  </button>)}
                </div>
              )}
              {!optionsConnues.length && !optionsHistoriques.length && (
                <p className="p-3 text-sm text-muted-foreground">Aucune valeur ne correspond à cette recherche.</p>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
    {query.isError && <p role="alert" className="text-xs text-destructive">Référentiel indisponible : {errorMessage(query.error)} <button type="button" className="underline" onClick={() => void query.refetch()}>Réessayer</button></p>}
     {!!selected.length && <div className="flex flex-wrap gap-1.5">{selectionsTriees.map(name => <span key={name} className="inline-flex max-w-full items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs text-accent-foreground"><span dir="auto" className="truncate">{name}</span>{unknown.includes(name) && <span className="opacity-70">(historique)</span>}<button type="button" aria-label={`Retirer ${name} de ${intitule}`} data-testid={`button-remove-mo-${label}-${name}`} onClick={() => multiple ? toggle(name) : onChange(null)} className="ml-1 font-bold hover:text-destructive">×</button></span>)}</div>}
    {!!unknown.length && <p className="text-xs text-muted-foreground">Les valeurs historiques restent enregistrées tant que vous ne les retirez pas.</p>}
  </div>;
}