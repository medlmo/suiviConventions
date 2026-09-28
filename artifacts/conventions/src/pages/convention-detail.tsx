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
  prochainComite: z.string().nullable().optional(),
  prochaineEcheance: z.string().nullable().optional(),
  prochaineEcheanceNote: z.string().nullable().optional(),
  pv: z.string().nullable().optional(),
  enveloppeBudgetaire: montantOptionnel,
  contributionRegion: montantOptionnel,
  natureFonds: z.string().nullable().optional(),
  maitriseOuvrage: z.string().nullable().optional(),
  maitriseOuvrageDeleguee: z.string().nullable().optional(),
  documentConvention: z.string().nullable().optional(),
  commentaires: z.string().nullable().optional(),
});

type FormValues = z.infer<typeof conventionSchema>;

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
  const { user } = useAuth();

  const { data: convention, isLoading, isError, error, refetch } = useGetConvention(id, {
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
      natureFonds: "Propres",
    }
  });
  const rattachementChoisi = form.watch("rattachement");

  // Watch pour init les valeurs
  const initializedId = useRef<number | null>(null);
  useEffect(() => {
    if (convention && initializedId.current !== id) {
      initializedId.current = id;
      form.reset({
        nomConvention: convention.nomConvention,
        objetConventionFr: convention.objetConventionFr,
        rattachement: convention.rattachement,
        responsableProjet: convention.responsableProjet,
        typeSession: convention.typeSession,
        session: convention.session,
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
        prochainComite: convention.prochainComite?.split('T')[0] || null,
        prochaineEcheance: convention.prochaineEcheance?.split('T')[0] || null,
        prochaineEcheanceNote: convention.prochaineEcheanceNote,
        pv: convention.pv,
        enveloppeBudgetaire: convention.enveloppeBudgetaire,
        contributionRegion: convention.contributionRegion,
        natureFonds: convention.natureFonds || "Propres",
        maitriseOuvrage: convention.maitriseOuvrage,
        maitriseOuvrageDeleguee: convention.maitriseOuvrageDeleguee,
        documentConvention: convention.documentConvention,
        commentaires: convention.commentaires,
      });
    }
  }, [convention, id, form]);

  const onSubmit = async (data: FormValues) => {
    if (!canEdit || !convention) return;
    // Nettoyer les chaines vides en null pour l'API
    const cleanData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v === "" ? null : v])
    );

    setSaving(true); setConflict("");
    try {
        const updatedConvention = await api<typeof convention>(`/conventions/${id}`, { method: "PATCH", body: JSON.stringify({ ...cleanData, version: (convention as typeof convention & { version: number }).version }) });
        toast({
          title: "Convention mise à jour",
          description: "Les modifications ont été enregistrées avec succès.",
        });
        // On invalide les requetes du TDB car les dates de comites impactent les alertes
        queryClient.setQueryData(getGetConventionQueryKey(id), updatedConvention);
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

  if (isLoading) {
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
          <Button onClick={form.handleSubmit(onSubmit)} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
          </>}
        </div>
      </div>
      {!canEdit && <div className="rounded-lg border border-primary/20 bg-accent/50 p-4 text-sm text-primary">Consultation uniquement : cette convention est hors de votre périmètre de modification.</div>}
      {conflict && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-destructive">{conflict}</span><Button variant="outline" size="sm" onClick={async () => { const result = await refetch(); if (result.data) { initializedId.current = null; form.reset(result.data as unknown as FormValues); setConflict(""); } }}>Actualiser la fiche</Button></div>}

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
                        <FormLabel>Nature</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Choisir une nature" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
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
                        <FormLabel>Enveloppe Globale (MAD)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} value={field.value || ""} />
                        </FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="contributionRegion" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contribution Région (MAD)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} value={field.value || ""} />
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <FormField control={form.control} name="natureFonds" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nature des fonds</FormLabel>
                      <Select
                        value={field.value || "Propres"}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Choisir une nature de fonds" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Propres">Propres</SelectItem>
                          <SelectItem value="FEC">FEC</SelectItem>
                          <SelectItem value="Contribution des partenaires">Contribution des partenaires</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )} />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="maitriseOuvrage" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Maîtrise d'ouvrage</FormLabel>
                        <FormControl><Input {...field} value={field.value || ""} dir="auto" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="maitriseOuvrageDeleguee" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Maîtrise d'ouv. Déléguée</FormLabel>
                        <FormControl><Input {...field} value={field.value || ""} dir="auto" /></FormControl>
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
                        <FormControl><Input type="date" {...field} value={field.value || ""} className="font-bold border-red-200 focus-visible:ring-red-500" /></FormControl>
                        <p className="text-[11px] text-red-600/80">Pilote le calcul de l'alerte.</p>
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
                    <FormField control={form.control} name="prochainComite" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Prochain comité programmé</FormLabel>
                        <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="frequenceReunions" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Fréquence prévue des réunions (mois)</FormLabel>
                      <FormControl><Input {...field} value={field.value || ""} dir="auto" placeholder="Ex. : 3" /></FormControl>
                      <p className="text-xs text-muted-foreground">Indiquer le nombre de mois entre deux réunions.</p>
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
                      <FormLabel>Document Convention (Lien/Réf)</FormLabel>
                      <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="pv" render={({ field }) => (
                    <FormItem>
                      <FormLabel>PV (Lien/Réf)</FormLabel>
                      <FormControl><Input {...field} value={field.value || ""} /></FormControl>
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
