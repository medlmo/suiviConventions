import { useLocation, useParams } from "wouter";
import { 
  useGetConvention, 
  useUpdateConvention,
  useDeleteConvention,
  getGetConventionQueryKey,
  getGetResumeAlertesQueryKey,
  getListAlertesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Form, 
  FormControl, 
  FormField, 
  FormItem, 
  FormLabel, 
  FormMessage 
} from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlerteBadge } from "@/components/alerte-badge";
import { ArrowLeft, Save, Trash2, CalendarIcon, FileText, Info, Building, Wallet } from "lucide-react";
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
  rattachement: z.string().nullable().optional(),
  responsableProjet: z.string().nullable().optional(),
  session: z.string().nullable().optional(),
  dateVisa: z.string().nullable().optional(),
  statutConvention: z.string().nullable().optional(),
  decision: z.string().nullable().optional(),
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

  const { data: convention, isLoading } = useGetConvention(id, {
    query: {
      enabled: !!id,
      queryKey: getGetConventionQueryKey(id)
    }
  });

  const updateMutation = useUpdateConvention();
  const deleteMutation = useDeleteConvention();

  const form = useForm<FormValues>({
    resolver: zodResolver(conventionSchema),
    defaultValues: {
      nomConvention: "",
      natureFonds: "Propres",
    }
  });

  // Watch pour init les valeurs
  const initializedId = useRef<number | null>(null);
  useEffect(() => {
    if (convention && initializedId.current !== id) {
      initializedId.current = id;
      form.reset({
        nomConvention: convention.nomConvention,
        rattachement: convention.rattachement,
        responsableProjet: convention.responsableProjet,
        session: convention.session,
        dateVisa: convention.dateVisa?.split('T')[0] || null, // Handle dates from API if needed
        statutConvention: convention.statutConvention,
        decision: convention.decision,
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

  const onSubmit = (data: FormValues) => {
    // Nettoyer les chaines vides en null pour l'API
    const cleanData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v === "" ? null : v])
    );

    updateMutation.mutate({ id, data: cleanData }, {
      onSuccess: (updatedConvention) => {
        toast({
          title: "Convention mise à jour",
          description: "Les modifications ont été enregistrées avec succès.",
        });
        // On invalide les requetes du TDB car les dates de comites impactent les alertes
        queryClient.invalidateQueries({ queryKey: getGetConventionQueryKey(id) });
        queryClient.invalidateQueries({ queryKey: getGetResumeAlertesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListAlertesQueryKey() });
      },
      onError: (error) => {
        toast({
          variant: "destructive",
          title: "Erreur",
          description: "Impossible de mettre à jour la convention.",
        });
      }
    });
  };

  const handleDelete = () => {
    if (confirm("Êtes-vous sûr de vouloir supprimer cette convention ? Cette action est irréversible.")) {
      setIsDeleting(true);
      deleteMutation.mutate({ id }, {
        onSuccess: () => {
          toast({
            title: "Convention supprimée",
          });
          queryClient.invalidateQueries({ queryKey: getGetResumeAlertesQueryKey() });
          setLocation("/conventions");
        },
        onError: () => {
          setIsDeleting(false);
          toast({
            variant: "destructive",
            title: "Erreur",
            description: "Impossible de supprimer la convention.",
          });
        }
      });
    }
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

  if (!convention) return <div>Introuvable</div>;

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-300">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/conventions")} className="rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold">Fiche Convention</h1>
        <div className="ml-auto flex items-center gap-3">
          <AlerteBadge alerte={convention.alerte} className="text-base px-3 py-1 mr-4" />
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting}>
            <Trash2 className="w-4 h-4 mr-2" />
            Supprimer
          </Button>
          <Button onClick={form.handleSubmit(onSubmit)} disabled={updateMutation.isPending}>
            <Save className="w-4 h-4 mr-2" />
            {updateMutation.isPending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          
          {/* Titre Principal Large */}
          <Card className="border-t-4 border-t-primary shadow-md bg-card">
            <CardContent className="pt-6">
              <FormField
                control={form.control}
                name="nomConvention"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-bold uppercase tracking-wider text-primary">Objet de la convention (Arabe priorisé)</FormLabel>
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
                        <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="responsableProjet" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Responsable Projet</FormLabel>
                        <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="session" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Session</FormLabel>
                        <FormControl><Input {...field} value={field.value || ""} /></FormControl>
                      </FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="dateVisa" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date de Visa</FormLabel>
                        <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
                      </FormItem>
                    )} />
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
                      <FormLabel>Fréquence des réunions (Convention)</FormLabel>
                      <FormControl><Input {...field} value={field.value || ""} dir="auto" /></FormControl>
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
        </form>
      </Form>
    </div>
  );
}
