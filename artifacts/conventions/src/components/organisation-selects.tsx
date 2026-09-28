import { FormControl } from "@/components/ui/form";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { organisation, rattachementConnu, servicesDeDivision } from "@/lib/organisation";
import { useAuth } from "@/hooks/use-auth";

type ChoixProps = {
  value: string | null | undefined;
  onValueChange: (value: string | null) => void;
};

export function RattachementSelect({ value, onValueChange }: ChoixProps) {
  const { user } = useAuth();
  const divisionsPermises = user?.role === "chef_division" || user?.role === "chef_service" ? user.division : null;
  const ancien = !!value && !rattachementConnu(value);

  return (
    <>
      <Select
        value={ancien ? "" : value || ""}
        onValueChange={onValueChange}
      >
        <FormControl>
          <SelectTrigger data-testid="select-rattachement" className="w-full text-left" title={value || undefined}>
            <SelectValue placeholder="Choisir une direction ou une division" />
          </SelectTrigger>
        </FormControl>
        <SelectContent className="max-h-80 w-[min(34rem,90vw)]">
          {organisation.filter(({ direction }) => !divisionsPermises || direction === user?.direction).map(({ direction, divisions }) => (
            <SelectGroup key={direction}>
              {!divisionsPermises && <SelectItem value={direction} className="font-semibold whitespace-normal">
                {direction}
              </SelectItem>}
              {divisions.filter(({ nom }) => !divisionsPermises || nom === divisionsPermises).map(({ nom }) => (
                <SelectItem key={nom} value={nom} className="pl-8 whitespace-normal">
                  {nom}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {value && !divisionsPermises && (
        <button type="button" className="text-xs text-muted-foreground underline hover:text-foreground" onClick={() => onValueChange(null)} data-testid="button-effacer-rattachement">
          Effacer le rattachement
        </button>
      )}
      {ancien && (
        <p className="text-xs text-muted-foreground" data-testid="text-rattachement-existant">
          Valeur existante : {value}. Conservée tant que vous ne changez pas ce champ.
        </p>
      )}
    </>
  );
}

type ServiceSelectProps = ChoixProps & {
  rattachement: string | null | undefined;
};

export function ServiceSelect({ rattachement, value, onValueChange }: ServiceSelectProps) {
  const { user } = useAuth();
  const services = servicesDeDivision(rattachement).filter(service => user?.role !== "chef_service" || service === user.service);
  const ancien = !!value && !services.includes(value);

  return (
    <>
      <Select
        value={ancien ? "" : value || ""}
        onValueChange={onValueChange}
        disabled={services.length === 0}
      >
        <FormControl>
          <SelectTrigger data-testid="select-responsable-projet" className="w-full text-left" title={value || undefined}>
            <SelectValue placeholder={services.length ? "Choisir un service" : "Choisir d'abord une division"} />
          </SelectTrigger>
        </FormControl>
        <SelectContent className="max-h-80 w-[min(34rem,90vw)]">
          {services.map((service) => (
            <SelectItem key={service} value={service} className="whitespace-normal">
              {service}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && user?.role !== "chef_service" && (
        <button type="button" className="text-xs text-muted-foreground underline hover:text-foreground" onClick={() => onValueChange(null)} data-testid="button-effacer-responsable-projet">
          Effacer le service
        </button>
      )}
      {ancien && (
        <p className="text-xs text-muted-foreground" data-testid="text-responsable-existant">
          Valeur existante : {value}. Conservée tant que vous ne changez pas le rattachement.
        </p>
      )}
      {!ancien && !services.length && (
        <p className="text-xs text-muted-foreground">
          Sélectionnez une division pour accéder à ses services.
        </p>
      )}
    </>
  );
}