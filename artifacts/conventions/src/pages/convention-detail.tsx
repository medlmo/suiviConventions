import { useLocation, useParams } from "wouter";
import { 
  useGetConvention, 
  getGetConventionQueryKey,
  getGetResumeAlertesQueryKey,
  getListAlertesQueryKey,
  getListConventionsQueryKey,
  getGetAgendaQueryKey,
  getGetOptionsFiltresQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useEffect, useRef, useState } from "react";
import { api, canEditConvention, errorMessage, useAuth, type ApiError } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { DocumentUploadField } from "@/components/document-upload-field";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RattachementSelect, ServiceSelect } from "@/components/organisation-selects";
import { MaitriseOuvrageSelect } from "@/components/maitrise-ouvrage-select";
import { useReferenceData } from "@/hooks/use-reference-data";
import { calculerEcheance } from "@/lib/echeances";
import { AlerteBadge } from "@/components/alerte-badge";
import { ArrowLeft, Save, Trash2, CalendarIcon, FileText, Info, Building, Wallet, RefreshCw, WifiOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/utils";
import { format } from "date-fns";

// Un champ montant vidé doit repartir à NULL, pas à 0 : z.coerce.number()
// convertit "" en 0, ce qui enregistrerait un budget nul au lieu d'effacer
// l'information.
const montantOptionnel = z.preprocess(
  (valeur) => (valeur === "" || valeur === null || valeur === undefined ? null : valeur),
  z.coerce.number().nonnegative().nullable(),
).optional();

const conventionSchema = z.object({
  nomConvention: z.string().min(1, "Le nom est requis"),
  objetConventionFr: z.string().nullable().optional(),
  rattachement: z.string().nullable().optional(),
  responsableProjet: z.string().nullable().optional(),
  typeSession: z.enum(["Ordinaire", "Extraordinaire"]).nullable().optional(),
  session: z.string().nullable().optional(),
  dateVisa: z.string().nullable().optional(),
  statutConvention: z.string().nullable().optional(),
  decision: z.string().nullable().optional(),
  competence: z.string().nullable().optional(),
  nature: z.string().nullable().optional(),
  presidenceComite: z.string().nullable().optional(),
  membresComite: z.string().nullable().optional(),
  frequenceReunions: z.string().nullable().optional(),
  dernierComite: z.string().nullable().optional(),
  dernierComiteNote: z.string().nullable().optional(),
  prochaineEcheance: z.string().nullable().optional(),
  prochaineEcheanceNote: z.string().nullable().optional(),
  pv: z.string().nullable().optional(),
  enveloppeBudgetaire: montantOptionnel,
  contributionRegion: montantOptionnel,
  natureFonds: z.string().nullable().optional(),
  porteurProjet: z.string().nullable().optional(),
  maitriseOuvrage: z.array(z.string()).nullable().optional(),
  maitriseOuvrageDeleguee: z.array(z.string()).nullable().optional(),
  documentConvention: z.string().nullable().optional(),
  commentaires: z.string().nullable().optional(),
}).superRefine((valeurs, contexte) => {
  if (valeurs.enveloppeBudgetaire != null && valeurs.contributionRegion != null &&
      valeurs.contributionRegion > valeurs.enveloppeBudgetaire) {
    contexte.addIssue({
      code: "custom",
      path: ["contributionRegion"],
      message: "La contribution de la Région ne peut pas dépasser l'enveloppe budgétaire.",
    });
  }
});

type FormValues = z.infer<typeof conventionSchema>;

// Les anciennes réponses peuvent encore contenir une chaîne libre. Ne jamais la
// découper : elle doit rester une valeur historique unique jusqu'à retrait explicite.
function valeursMO(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return typeof value === "string" && value.length ? [value] : [];
}

export default function ConventionDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState("");
  const [formRecordId, setFormRecordId] = useState<number | null>(null);
  const { user } = useAuth();
  const reference = useReferenceData();

  const { data: convention, isLoading, isFetching, isError, error, refetch } = useGetConvention(id, {
    query: {
      enabled: !!id,
      queryKey: getGetConventionQueryKey(id)
    }
  });

  const canEdit = !!user && !!convention && canEditConvention(user, convention);

  const form = useForm<FormValues>({
    resolver: zodResolver(conventionSchema),
    defaultValues: {
      nomConvention: "",
      natureFonds: null,
    }
  });
  const rattachementChoisi = form.watch("rattachement");
  // React Hook Form doit observer dirtyFields pour que keepDirtyValues fonctionne.
  const champsModifies = form.formState.dirtyFields;
  const [nature, dateVisa, dernierComite, frequenceReunions] =
    form.watch(["nature", "dateVisa", "dernierComite", "frequenceReunions"]);
  const calculTheorique = canEdit
    ? calculerEcheance({ nature, dateVisa, dernierComite, frequenceReunions })
    : null;
  const sourcesModifiees = !!(
    champsModifies.dernierComite ||
    (dernierComite
      ? champsModifies.frequenceReunions
      : champsModifies.nature || champsModifies.dateVisa)
  );
  const dateEnregistree = convention?.prochaineEcheance?.split("T")[0] ?? null;
  const dateHistoriqueManuelle = !!(
    calculTheorique && dateEnregistree &&
    dateEnregistree !== calculTheorique.date && !sourcesModifiees
  );
  const echeanceCalculee = dateHistoriqueManuelle ? null : calculTheorique;
  const derniereEcheanceAutomatique = useRef<string | null>(null);
  const brouillonEcheanceManuelle = useRef<string | null | undefined>(undefined);
  const etaitHistorique = useRef(false);
  const idEcheanceAutomatique = useRef<number | null>(null);

  // Chaque nouvelle version serveur actualise les champs non modifiés, mais
  // conserve les saisies en cours lors d'un renommage du référentiel.
  const initializedId = useRef<number | null>(null);
  useEffect(() => {
    if (convention) {
      const sameRecord = initializedId.current === id;
      initializedId.current = id;
      form.reset({
        nomConvention: convention.nomConvention,
        objetConventionFr: convention.objetConventionFr,
        rattachement: convention.rattachement,
        responsableProjet: convention.responsableProjet,
        typeSession: convention.typeSession,
        session: convention.session?.split("T")[0] || null,
        dateVisa: convention.dateVisa?.split('T')[0] || null, // Handle dates from API if needed
        statutConvention: convention.statutConvention,
        decision: convention.decision,
        competence: convention.competence,
        nature: convention.nature,
        presidenceComite: convention.presidenceComite,
        membresComite: convention.membresComite,
        frequenceReunions: convention.frequenceReunions,
        dernierComite: convention.dernierComite?.split('T')[0] || null,
        dernierComiteNote: convention.dernierComiteNote,
        prochaineEcheance: convention.prochaineEcheance?.split('T')[0] || null,
        prochaineEcheanceNote: convention.prochaineEcheanceNote,
        pv: convention.pv,
        enveloppeBudgetaire: convention.enveloppeBudgetaire,
        contributionRegion: convention.contributionRegion,
        natureFonds: convention.natureFonds ?? null,
        porteurProjet: convention.porteurProjet ?? null,
        maitriseOuvrage: valeursMO(convention.maitriseOuvrage),
        maitriseOuvrageDeleguee: valeursMO(convention.maitriseOuvrageDeleguee),
        documentConvention: convention.documentConvention,
        commentaires: convention.commentaires,
      }, { keepDirtyValues: sameRecord });
      setFormRecordId(id);
    }
  }, [convention, id, form]);

  useEffect(() => {
    if (idEcheanceAutomatique.current !== id) {
      idEcheanceAutomatique.current = id;
      derniereEcheanceAutomatique.current = null;
      brouillonEcheanceManuelle.current = undefined;
      etaitHistorique.current = false;
    }
    if (!canEdit || !convention || formRecordId !== id) return;
    const ancienneDateAutomatique = derniereEcheanceAutomatique.current;
    if (dateHistoriqueManuelle) {
      if (ancienneDateAutomatique && form.getValues("prochaineEcheance") === ancienneDateAutomatique) {
        const dateARestaurer = brouillonEcheanceManuelle.current === undefined
          ? dateEnregistree : brouillonEcheanceManuelle.current;
        form.setValue("prochaineEcheance", dateARestaurer, { shouldDirty: true });
      }
      derniereEcheanceAutomatique.current = null;
      brouillonEcheanceManuelle.current = undefined;
      etaitHistorique.current = true;
      return;
    }
    if (echeanceCalculee) {
      if (etaitHistorique.current && brouillonEcheanceManuelle.current === undefined) {
        brouillonEcheanceManuelle.current = form.getValues("prochaineEcheance") ?? null;
      }
      if (form.getValues("prochaineEcheance") !== echeanceCalculee.date) {
        form.setValue("prochaineEcheance", echeanceCalculee.date, { shouldDirty: true });
      }
      derniereEcheanceAutomatique.current = echeanceCalculee.date;
      etaitHistorique.current = false;
    } else if (ancienneDateAutomatique && form.getValues("prochaineEcheance") === ancienneDateAutomatique) {
      form.setValue("prochaineEcheance", brouillonEcheanceManuelle.current ?? null, { shouldDirty: true });
      derniereEcheanceAutomatique.current = null;
      brouillonEcheanceManuelle.current = undefined;
      etaitHistorique.current = false;
    }
  }, [canEdit, convention?.id, dateEnregistree, dateHistoriqueManuelle, echeanceCalculee?.date, form, formRecordId, id]);

  const onSubmit = async (data: FormValues) => {
    if (!canEdit || !convention) return;
    if (isFetching) return; // attendre la version actualisée après invalidation
    if (!reference.data) {
      toast({ variant: "destructive", title: "Référentiel indisponible", description: "Réessayez avant d’enregistrer." }); return;
    }
    // Nettoyer les chaines vides en null pour l'API
    const cleanData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v === "" ? null : v])
    );
    if (echeanceCalculee) cleanData.prochaineEcheance = echeanceCalculee.date;

    setSaving(true); setConflict("");
    try {
        const latest = queryClient.getQueryData<typeof convention>(getGetConventionQueryKey(id)) ?? convention;
        const updatedConvention = await api<typeof convention>(`/conventions/${id}`, { method: "PATCH", body: JSON.stringify({ ...cleanData, version: (latest as typeof convention & { version: number }).version }) });
        queryClient.setQueryData(getGetConventionQueryKey(id), updatedConvention);
        form.reset({
          ...data,
          prochaineEcheance: updatedConvention.prochaineEcheance?.split("T")[0] ?? null,
        });
        toast({
          title: "Convention mise à jour",
          description: "Les modifications ont été enregistrées avec succès.",
        });
        // On invalide les requetes du TDB car les dates de comites impactent les alertes
        queryClient.invalidateQueries({ queryKey: getGetResumeAlertesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListAlertesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListConventionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAgendaQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetOptionsFiltresQueryKey() });
      } catch (error) {
        if ((error as ApiError).status === 409 || (error as ApiError).status === 404) setConflict("Cette convention a été modifiée ou supprimée depuis son ouverture. Actualisez la fiche avant de réessayer.");
        toast({
          variant: "destructive",
          title: "Erreur",
          description: errorMessage(error),
        });
      } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (isDeleting || !canEdit || !convention) return;
    setIsDeleting(true);
    setConflict("");
    try {
        await api<void>(`/conventions/${id}?version=${encodeURIComponent(String((convention as typeof convention & { version: number }).version))}`, { method: "DELETE" });
        toast({
          title: "Convention supprimée",
        });
        queryClient.invalidateQueries({ queryKey: getGetResumeAlertesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListAlertesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListConventionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAgendaQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetOptionsFiltresQueryKey() });
        queryClient.removeQueries({ queryKey: getGetConventionQueryKey(id) });
        setDeleteDialogOpen(false);
        setLocation("/conventions");
      } catch (error) {
        if ((error as ApiError).status === 409 || (error as ApiError).status === 404) { setConflict("Cette convention a été modifiée ou supprimée depuis son ouverture. Actualisez la fiche avant de réessayer."); setDeleteDialogOpen(false); }
        toast({
          variant: "destructive",
          title: "Erreur",
          description: errorMessage(error),
        });
      } finally { setIsDeleting(false); }
  };

  if (isLoading || (!isError && !!convention && formRecordId !== id)) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Skeleton className="h-[400px] w-full" />
          <Skeleton className="h-[400px] w-full" />
        </div>
      </div>
    );
  }

  // Une panne réseau ne doit pas être présentée comme une convention absente :
  // seul un 404 signifie réellement que la fiche n'existe pas.
  if (isError || !convention) {
    const statut = (error as { status?: number } | null)?.status;
    const introuvable = statut === 404 || (!isError && !convention);

    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => setLocation("/conventions")} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Retour à la liste
        </Button>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              {introuvable ? (
                <Info className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              ) : (
                <WifiOff className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <p className="font-semibold text-destructive">
                  {introuvable
                    ? "Cette convention est introuvable."
                    : "La convention n’a pas pu être chargée."}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {introuvable
                    ? "Elle a peut-être été supprimée, ou le lien utilisé n’est plus valide."
                    : `La requête au serveur a échoué${statut ? ` (erreur ${statut})` : ""}. Vérifiez votre connexion, puis réessayez.`}
                </p>
                {!introuvable && (
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Réessayer
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-300">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/conventions")} className="rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold">Fiche Convention</h1>
        <div className="ml-auto flex items-center gap-3 flex-wrap justify-end">
          <AlerteBadge alerte={convention.alerte} className="text-base px-3 py-1 mr-4" />
          {canEdit && <>
          <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)} disabled={isDeleting}>
            <Trash2 className="w-4 h-4 mr-2" />
            Supprimer
          </Button>
           <Button onClick={form.handleSubmit(onSubmit)} disabled={saving || isFetching || !reference.data}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
          </>}
        </div>
      </div>
      {!canEdit && <div className="rounded-lg border border-primary/20 bg-accent/50 p-4 text-sm text-primary">Consultation uniquement : cette convention est hors de votre périmètre de modification.</div>}
       {conflict && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-destructive">{conflict}</span><Button variant="outline" size="sm" disabled={isFetching} onClick={async () => { const result = await refetch(); if (result.data) setConflict(""); }}>Actualiser la fiche</Button></div>}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <fieldset disabled={!canEdit} className="space-y-6 min-w-0">
          
          {/* Titre Principal Large */}
          <Card className="border-t-4 border-t-primary shadow-md bg-card">
            <CardContent className="pt-6">
              <FormField
                control={form.control}
                name="nomConvention"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-bold uppercase tracking-wider text-primary">Objet de la convention (arabe)</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        dir="auto"
                        className="text-base font-normal min-h-[100px] leading-normal bg-accent/10 border-accent resize-y"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="objetConventionFr"
                render={({ field }) => (
                  <FormItem className="mt-5">
                    <FormLabel className="text-sm font-bold uppercase tracking-wider text-primary">Objet de la convention (français)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        value={field.value || ""}
                        dir="auto"
                        placeholder="Saisir l'objet de la convention en français"
                        className="text-base font-normal min-h-[80px] leading-normal resize-y"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Colonne Gauche */}
            <div className="space-y-6">
              
              <Card className="shadow-sm">
                <CardHeader className="bg-muted/30 pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Info className="w-5 h-5 text-secondary" />
                    Identification
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="statutConvention" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Statut</FormLabel>
                        <Select
                          value={field.value || "non-renseigne"}
                          onValueChange={(value) => field.onChange(value === "non-renseigne" ? null : value)}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choisir un statut" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {field.value && !["En cours", "Arrivée à terme", "Résiliée"].includes(field.value) && (
                              <SelectItem value={field.value}>{field.value} (historique)</SelectItem>
                            )}
                            <SelectItem value="non-renseigne">Non renseigné</SelectItem>
                            <SelectItem value="En cours">En cours</SelectItem>
                            <SelectItem value="Arrivée à terme">Arrivée à terme</SelectItem>
                            <SelectItem value="Résiliée">Résiliée</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="rattachement" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rattachement</FormLabel>
                        <RattachementSelect
                          value={field.value}
                          onValueChange={(valeur) => {
                            field.onChange(valeur);
                            form.setValue("responsableProjet", null, { shouldDirty: true });
                          }}
                        />
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="responsableProjet" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Responsable Projet</FormLabel>
                        <ServiceSelect
                          rattachement={rattachementChoisi}
                          value={field.value}
                          onValueChange={field.onChange}
                        />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="typeSession" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type de la session</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choisir un type de session" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {field.value && !["Ordinaire", "Extraordinaire"].includes(field.value) && (
                              <SelectItem value={field.value}>{field.value} (historique)</SelectItem>
                            )}
                            <SelectItem value="Ordinaire">Ordinaire</SelectItem>
                            <SelectItem value="Extraordinaire">Extraordinaire</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="session" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Session</FormLabel>
                        <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="competence" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Compétence</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choisir une compétence" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {field.value && !["Propre", "Partagée", "Transférée"].includes(field.value) && (
                              <SelectItem value={field.value}>{field.value} (historique)</SelectItem>
                            )}
                            <SelectItem value="Propre">Propre</SelectItem>
                            <SelectItem value="Partagée">Partagée</SelectItem>
                            <SelectItem value="Transférée">Transférée</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="nature" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nature du projet</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choisir la nature du projet" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {field.value && !["Infrastructure", "Subventions", "Prestations"].includes(field.value) && (
                              <SelectItem value={field.value}>{field.value} (historique)</SelectItem>
                            )}
                            <SelectItem value="Infrastructure">Infrastructure</SelectItem>
                            <SelectItem value="Subventions">Subventions</SelectItem>
                            <SelectItem value="Prestations">Prestations</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="dateVisa" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date de Visa</FormLabel>
                        <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <div>
                    <FormField control={form.control} name="decision" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Décision</FormLabel>
                        <Select
                          value={field.value || "non-renseigne"}
                          onValueChange={(value) => field.onChange(value === "non-renseigne" ? null : value)}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choisir une décision" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {field.value && !["A renouveler", "A reconduire tacitemment", "A maintenir", "A ne pas renouveler", "A résilier"].includes(field.value) && (
                              <SelectItem value={field.value}>{field.value} (historique)</SelectItem>
                            )}
                            <SelectItem value="non-renseigne">Non renseignée</SelectItem>
                            <SelectItem value="A renouveler">A renouveler</SelectItem>
                            <SelectItem value="A reconduire tacitemment">A reconduire tacitemment</SelectItem>
                            <SelectItem value="A maintenir">A maintenir</SelectItem>
                            <SelectItem value="A ne pas renouveler">A ne pas renouveler</SelectItem>
                            <SelectItem value="A résilier">A résilier</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )} />
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader className="bg-muted/30 pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Wallet className="w-5 h-5 text-secondary" />
                    Budget & Maîtrise d'Ouvrage
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="enveloppeBudgetaire" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Enveloppe budgétaire (MAD)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="0.01" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="contributionRegion" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contribution de la Région (MAD)</FormLabel>
                        <FormControl>
                          <Input type="number" min="0" step="0.01" {...field} value={field.value ?? ""} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="natureFonds" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nature des fonds</FormLabel>
                      <Select
                        value={field.value || "non-renseigne"}
                        onValueChange={(value) => field.onChange(value === "non-renseigne" ? null : value)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Choisir une nature de fonds" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {field.value && !["Propres", "FEC", "Contribution des partenaires"].includes(field.value) && (
                            <SelectItem value={field.value}>{field.value} (historique)</SelectItem>
                          )}
                          <SelectItem value="non-renseigne">Non renseignée</SelectItem>
                          <SelectItem value="Propres">Propres</SelectItem>
                          <SelectItem value="FEC">FEC</SelectItem>
                          <SelectItem value="Contribution des partenaires">Contribution des partenaires</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField control={form.control} name="porteurProjet" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Porteur de projet</FormLabel>
                        <MaitriseOuvrageSelect
                          label="porteur-de-projet"
                          intitule="porteur de projet"
                          multiple={false}
                          value={field.value}
                          onChange={field.onChange}
                        />
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="maitriseOuvrage" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Maîtrise d'ouvrage</FormLabel>
                         <MaitriseOuvrageSelect label="maitrise-ouvrage" value={field.value} onChange={field.onChange} />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="maitriseOuvrageDeleguee" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Maîtrise d'ouv. Déléguée</FormLabel>
                         <MaitriseOuvrageSelect label="maitrise-ouvrage-deleguee" value={field.value} onChange={field.onChange} />
                      </FormItem>
                    )} />
                  </div>
                </CardContent>
              </Card>

            </div>

            {/* Colonne Droite */}
            <div className="space-y-6">
              
              {/* Le coeur métier : Le Comité */}
              <Card className="shadow-sm border-orange-200">
                <CardHeader className="bg-orange-50/50 pb-4 border-b border-orange-100">
                  <CardTitle className="flex items-center gap-2 text-lg text-orange-900">
                    <CalendarIcon className="w-5 h-5 text-orange-600" />
                    Comité de Suivi
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-5">
                  <div className="grid grid-cols-2 gap-4 bg-red-50/30 p-4 rounded-lg border border-red-100">
                    <FormField control={form.control} name="prochaineEcheance" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-bold text-red-900">Date Prochaine Échéance</FormLabel>
                        <FormControl><Input type="date" {...field} value={echeanceCalculee?.date ?? field.value ?? ""} readOnly={!!echeanceCalculee} data-testid="input-prochaine-echeance" className="font-bold border-red-200 focus-visible:ring-red-500" /></FormControl>
                        <p data-testid="status-calcul-echeance" className="text-[11px] text-red-600/80">
                          {dateHistoriqueManuelle && calculTheorique
                            ? `Date enregistrée conservée. Calcul attendu : ${calculTheorique.date}.`
                            : echeanceCalculee
                            ? `Calcul automatique : ${echeanceCalculee.source === "visa" ? "date de visa" : "dernier comité tenu"} + ${echeanceCalculee.mois} mois. Cette date pilote l'alerte.`
                            : dernierComite
                              ? "Fréquence non chiffrée : saisissez l'échéance manuellement."
                              : "Saisie manuelle tant que la nature du projet ou la date de visa manque."}
                        </p>
                        {dateHistoriqueManuelle && calculTheorique && (
                          <Button
                            type="button"
                            variant="link"
                            data-testid="button-appliquer-calcul-echeance"
                            className="h-auto p-0 text-xs"
                            onClick={() => form.setValue("prochaineEcheance", calculTheorique.date, { shouldDirty: true })}
                          >
                            Appliquer le calcul
                          </Button>
                        )}
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="prochaineEcheanceNote" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Note sur l'échéance</FormLabel>
                        <FormControl><Input {...field} value={field.value || ""} dir="auto" placeholder="Ex: غير محدد" /></FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="dernierComite" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date Dernier Comité</FormLabel>
                        <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="dernierComiteNote" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Note Dernier Comité</FormLabel>
                        <FormControl><Input {...field} value={field.value || ""} dir="auto" placeholder="Ex: لم يعقد اي اجتماع" /></FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="frequenceReunions" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fréquence prévue des réunions (mois)</FormLabel>
                      <FormControl><Input {...field} value={field.value || ""} dir="auto" placeholder="Ex. : 3" /></FormControl>
                      <p className="text-xs text-muted-foreground">Indiquer un nombre de mois, ou la mention « كلما دعت الضرورة الى ذلك » si la fréquence est inconnue.</p>
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="presidenceComite" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Présidence</FormLabel>
                        <FormControl><Input {...field} value={field.value || ""} dir="auto" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="membresComite" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Membres</FormLabel>
                        <FormControl><Textarea {...field} value={field.value || ""} dir="auto" className="min-h-[80px]" /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardHeader className="bg-muted/30 pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="w-5 h-5 text-secondary" />
                    Documents & commentaires
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6 space-y-4">
                  <FormField control={form.control} name="documentConvention" render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="documentConvention">Convention</FormLabel>
                      <DocumentUploadField
                        id="documentConvention"
                        field="documentConvention"
                        value={field.value}
                        persistedValue={convention.documentConvention}
                        conventionId={id}
                        onChange={field.onChange}
                      />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="pv" render={({ field }) => (
                    <FormItem>
                      <FormLabel htmlFor="pv">PV</FormLabel>
                      <DocumentUploadField
                        id="pv"
                        field="pv"
                        value={field.value}
                        persistedValue={convention.pv}
                        conventionId={id}
                        onChange={field.onChange}
                      />
                    </FormItem>
                  )} />
                  
                  <FormField control={form.control} name="commentaires" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Commentaires Libres</FormLabel>
                      <FormControl><Textarea {...field} value={field.value || ""} dir="auto" className="min-h-[100px]" /></FormControl>
                    </FormItem>
                  )} />
                  
                  <div className="pt-4 mt-4 border-t border-border flex justify-between text-xs text-muted-foreground">
                    <span>Créé le: {convention.creeLe ? format(new Date(convention.creeLe), "dd/MM/yyyy HH:mm") : "-"}</span>
                    <span>Modifié le: {convention.modifieLe ? format(new Date(convention.modifieLe), "dd/MM/yyyy HH:mm") : "-"}</span>
                  </div>
                </CardContent>
              </Card>

            </div>
          </div>
          </fieldset>
        </form>
      </Form>
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!isDeleting) setDeleteDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette convention ?</AlertDialogTitle>
            <AlertDialogDescription>
              La convention « {convention.nomConvention} » sera retirée du suivi. La fiche ne sera plus visible, mais une trace restera dans le journal d'administration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Suppression..." : "Supprimer la convention"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
