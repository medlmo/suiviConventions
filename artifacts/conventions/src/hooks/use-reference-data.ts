import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/hooks/use-auth";
import { getListConventionsQueryKey } from "@workspace/api-client-react";

export type Service = { id: number; nom: string };
export type Division = { id: number; nom: string; services: Service[] };
export type Direction = { id: number; direction: string; divisions: Division[] };
export type MaitriseOuvrage = { id: number; nom: string };
export type ReferenceData = { organisation: Direction[]; servicesDgs: Service[]; maitrisesOuvrage: MaitriseOuvrage[] };
export type ReferenceKind = "directions" | "divisions" | "services" | "services-dgs" | "maitrises-ouvrage";
export const referenceDataKey = ["reference-data"] as const;

export function useReferenceData() {
  return useQuery({ queryKey: referenceDataKey, queryFn: () => api<ReferenceData>("/reference-data"), staleTime: 30_000 });
}

export function useReferenceMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id, nom, parentId }: { kind: ReferenceKind; id?: number; nom: string; parentId?: number }) =>
      api<ReferenceData>(id == null ? `/admin/reference-data/${kind}` : `/admin/reference-data/${kind}/${id}`, {
        method: id == null ? "POST" : "PATCH",
        body: JSON.stringify(id == null ? { nom, ...(parentId == null ? {} : { parentId }) } : { nom }),
      }),
    onSuccess: data => {
      client.setQueryData(referenceDataKey, data);
      void client.invalidateQueries({ queryKey: ["admin", "users"] });
      void client.invalidateQueries({ queryKey: ["auth", "me"] });
      // Les clés générées des listes, fiches, alertes, agenda, résumé et
      // options de filtres commencent toutes par /api/conventions.
      // Cette invalidation couvre aussi les listes avec paramètres et chaque id.
      void client.invalidateQueries({ queryKey: getListConventionsQueryKey() });
    },
  });
}