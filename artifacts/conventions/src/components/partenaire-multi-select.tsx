import { useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = {
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
};

function normaliserRecherche(valeur: string) {
  return valeur
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/[یىئ]/g, "ي")
    .replace(/ک/g, "ك")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/[\u0640\u064B-\u0655\u0670]/g, "");
}

export function PartenaireMultiSelect({ options, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const term = normaliserRecherche(search.trim());
  const filtered = options.filter((name) => !term || normaliserRecherche(name).includes(term));

  const toggle = (name: string) => {
    onChange(selected.includes(name)
      ? selected.filter((item) => item !== name)
      : [...selected, name]);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-label="Filtrer par partenaires"
          aria-expanded={open}
          data-testid="button-filter-partners"
          className="h-10 w-full justify-between font-normal"
        >
          <span className="truncate">
            {selected.length
              ? `${selected.length} partenaire${selected.length > 1 ? "s" : ""} sélectionné${selected.length > 1 ? "s" : ""}`
              : "Tous les partenaires"}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(23rem,90vw)] p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchRef.current?.focus();
        }}
      >
        <div className="border-b p-3">
          <label htmlFor="search-partners" className="sr-only">Rechercher un partenaire</label>
          <Input
            ref={searchRef}
            id="search-partners"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
            placeholder="Rechercher un partenaire…"
            autoComplete="off"
            data-testid="input-search-partners"
          />
        </div>
        <div role="listbox" aria-label="Partenaires" aria-multiselectable="true" className="max-h-64 overflow-y-auto p-1">
          {filtered.length ? filtered.map((name, index) => {
            const checked = selected.includes(name);
            return (
              <button
                key={name}
                type="button"
                role="checkbox"
                aria-checked={checked}
                data-testid={`option-partner-${index}`}
                onClick={() => toggle(name)}
                className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                  <Check className={`h-4 w-4 ${checked ? "text-primary" : "opacity-0"}`} />
                </span>
                <span dir="auto">{name}</span>
              </button>
            );
          }) : (
            <p className="p-3 text-sm text-muted-foreground">Aucun partenaire ne correspond à cette recherche.</p>
          )}
        </div>
        {selected.length > 0 && (
          <div className="border-t p-2">
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => onChange([])}>
              Tout désélectionner
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
