import { FormControl } from "@/components/ui/form";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReferenceData } from "@/hooks/use-reference-data";
import { useAuth, errorMessage } from "@/hooks/use-auth";
import { DIRECTION_GENERALE_SERVICES } from "@workspace/organisation";

type ChoixProps = { value: string | null | undefined; onValueChange: (value: string | null) => void };

function EtatReferentiel({ error, retry }: { error: unknown; retry: () => void }) {
  return <p role="alert" className="text-xs text-destructive">Organigramme indisponible : {errorMessage(error)} <button type="button" className="underline" onClick={retry}>Réessayer</button></p>;
}

export function RattachementSelect({ value, onValueChange }: ChoixProps) {
  const { user } = useAuth();
  const query = useReferenceData();
  const limited = user?.role === "chef_division" || user?.role === "chef_service";
  const dgsPermise = !limited || (user?.role === "chef_service" && !user.direction && !user.division &&
    query.data?.servicesDgs.some(service => service.nom === user.service));
  const options = [...(dgsPermise ? [DIRECTION_GENERALE_SERVICES] : []), ...(query.data?.organisation.flatMap(direction => [
    ...(!limited ? [direction.direction] : []),
    ...direction.divisions.filter(division => !limited || (division.nom === user?.division && direction.direction === user.direction)).map(division => division.nom),
  ]) ?? [])];
  const ancien = !!value && !!query.data && !options.includes(value);
  return <>
    <Select value={value || ""} onValueChange={onValueChange} disabled={query.isPending || query.isError}>
      <FormControl><SelectTrigger data-testid="select-rattachement" className="w-full text-left" title={value || undefined}><SelectValue placeholder={query.isPending ? "Chargement de l’organigramme…" : "Choisir une direction ou une division"} /></SelectTrigger></FormControl>
      <SelectContent className="max-h-80 w-[min(34rem,90vw)]">
        {ancien && <SelectItem value={value!} className="whitespace-normal">{value} (historique)</SelectItem>}
        {dgsPermise && <SelectItem value={DIRECTION_GENERALE_SERVICES} className="font-semibold whitespace-normal">{DIRECTION_GENERALE_SERVICES}</SelectItem>}
        {query.data?.organisation.filter(direction => !limited || direction.direction === user?.direction).map(direction => <SelectGroup key={direction.id}>
          {!limited && <SelectItem value={direction.direction} className="font-semibold whitespace-normal">{direction.direction}</SelectItem>}
          {direction.divisions.filter(division => !limited || division.nom === user?.division).map(division => <SelectItem key={division.id} value={division.nom} className="pl-8 whitespace-normal">{division.nom}</SelectItem>)}
        </SelectGroup>)}
      </SelectContent>
    </Select>
    {value && !limited && <button type="button" className="text-xs text-muted-foreground underline" onClick={() => onValueChange(null)}>Effacer le rattachement</button>}
    {ancien && <p className="text-xs text-muted-foreground">Valeur historique : {value}. Conservée tant que vous ne la changez pas.</p>}
    {query.isError && <EtatReferentiel error={query.error} retry={() => void query.refetch()} />}
  </>;
}

export function ServiceSelect({ rattachement, value, onValueChange }: ChoixProps & { rattachement: string | null | undefined }) {
  const { user } = useAuth();
  const query = useReferenceData();
  const services = rattachement === DIRECTION_GENERALE_SERVICES
    ? query.data?.servicesDgs.map(service => service.nom) ?? []
    : query.data?.organisation.flatMap(direction => direction.divisions.filter(division => division.nom === rattachement).flatMap(division => division.services.map(service => service.nom))) ?? [];
  const permitted = services.filter(service => user?.role !== "chef_service" || service === user.service);
  const ancien = !!value && !!query.data && !permitted.includes(value);
  return <>
    <Select value={value || ""} onValueChange={onValueChange} disabled={query.isPending || query.isError || (!permitted.length && !ancien)}>
      <FormControl><SelectTrigger data-testid="select-responsable-projet" className="w-full text-left" title={value || undefined}><SelectValue placeholder={query.isPending ? "Chargement…" : permitted.length ? "Choisir un service" : "Choisir d’abord une division ou la DGS"} /></SelectTrigger></FormControl>
      <SelectContent className="max-h-80 w-[min(34rem,90vw)]">
        {ancien && <SelectItem value={value!} className="whitespace-normal">{value} (historique)</SelectItem>}
        {permitted.map(service => <SelectItem key={service} value={service} className="whitespace-normal">{service}</SelectItem>)}
      </SelectContent>
    </Select>
    {value && user?.role !== "chef_service" && <button type="button" className="text-xs text-muted-foreground underline" onClick={() => onValueChange(null)}>Effacer le service</button>}
    {ancien && <p className="text-xs text-muted-foreground">Valeur historique : {value}. Conservée tant que vous ne la changez pas.</p>}
    {query.isError && <EtatReferentiel error={query.error} retry={() => void query.refetch()} />}
  </>;
}