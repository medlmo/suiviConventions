import { useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type Props = {
  value?: string | null;
  onChange: (value: string | null) => void;
  options: readonly string[];
  label: string;
  placeholder: string;
};

function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr");
}

export function SearchableOptionSelect({
  value,
  onChange,
  options,
  label,
  placeholder,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const term = normalizeSearch(search.trim());
  const filteredOptions = options.filter((option) => !term || normalizeSearch(option).includes(term));
  const isHistorical = !!value && !options.includes(value);
  const historicalMatches = isHistorical && (!term || normalizeSearch(value).includes(term));

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
          aria-label={label}
          aria-expanded={open}
          className="w-full min-h-10 h-auto justify-between text-left font-normal"
        >
          <span dir="auto" className="truncate">{value || placeholder}</span>
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
          <label htmlFor={`search-${label}`} className="sr-only">Rechercher {label}</label>
          <Input
            ref={searchRef}
            id={`search-${label}`}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.preventDefault();
            }}
            placeholder={`Rechercher ${label.toLocaleLowerCase("fr")}…`}
            autoComplete="off"
          />
        </div>
        <div role="listbox" aria-label={label} className="max-h-64 overflow-y-auto p-1">
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
                setSearch("");
              }}
              className="w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent"
            >
              Effacer la sélection
            </button>
          )}
          {historicalMatches && (
            <button
              type="button"
              role="option"
              aria-selected
              onClick={() => {
                onChange(value!);
                setOpen(false);
                setSearch("");
              }}
              className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span dir="auto">{value} (historique)</span>
            </button>
          )}
          {filteredOptions.map((option) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={value === option}
              onClick={() => {
                onChange(option);
                setOpen(false);
                setSearch("");
              }}
              className="flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
            >
              <Check className={`mt-0.5 h-4 w-4 shrink-0 ${value === option ? "text-primary" : "opacity-0"}`} />
              <span dir="auto">{option}</span>
            </button>
          ))}
          {!historicalMatches && filteredOptions.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">Aucune valeur ne correspond à cette recherche.</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
