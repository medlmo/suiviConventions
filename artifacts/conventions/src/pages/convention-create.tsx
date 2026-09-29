import { useLocation } from "wouter";
import { 
  useCreateConvention,
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
import { useToast } from "@/hooks/use-toast";
import { DocumentUploadField } from "@/components/document-upload-field";
import { useAuth, errorMessage } from "@/hooks/use-auth";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { RattachementSelect, ServiceSelect } from "@/components/organisation-selects";
import { ArrowLeft, Save, CalendarIcon, FileText, Info, Wallet } from "lucide-react";

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

export default function ConventionCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const createMutation = useCreateConvention();

  const form = useForm<FormValues>({
    resolver: zodResolver(conventionSchema),
    defaultValues: {
      nomConvention: "",
      statutConvention: "En cours",
      natureFonds: "Propres",
      rattachement: user?.role === "chef_division" || user?.role === "chef_service" ? user.division : null,
      responsableProjet: user?.role === "chef_service" ? user.service : null,
    }
  });
  const rattachementChoisi = form.watch("rattachement");

  const onSubmit = (data: FormValues) => {
    if (!user || user.role === "directeur") return;
    if ((user.role === "chef_division" || user.role === "chef_service") && data.rattachement !== user.division) {
      toast({ variant: "destructive", title: "Rattachement non autorisé", description: "Choisissez votre division." }); return;
    }
    if (user.role === "chef_service" && data.responsableProjet !== user.service) {
      toast({ variant: "destructive", title: "Service non autorisé", description: "Choisissez votre service." }); return;
    }
    const cleanData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, v === "" ? null : v])
    );
    
    // Type casting pour l'input
    createMutation.mutate({ data: cleanData as any }, {
      onSuccess: (newConvention) => {
        toast({
          title: "Convention créée",
          description: "La convention a été enregistrée avec succès.",
        });
        queryClient.invalidateQueries({ queryKey: getGetResumeAlertesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListAlertesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListConventionsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetAgendaQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetOptionsFiltresQueryKey() });
        setLocation(`/conventions/${newConvention.id}`);
      },
      onError: (error) => {
        if ((error as { status?: number }).status === 401) window.dispatchEvent(new Event("conventions-session-expired"));
        toast({
          variant: "destructive",
          title: "Erreur",
          description: errorMessage(error),
        });
      }
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20 animate-in fade-in duration-300">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/conventions")} className="rounded-full">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Nouvelle Convention</h1>
          <p className="text-muted-foreground text-sm">Ajoutez une nouvelle convention au suivi.</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          <Card className="border-t-4 border-t-primary shadow-sm bg-card">
            <CardContent className="pt-6">
              <FormField
                control={form.control}
                name="nomConvention"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-base font-bold uppercase tracking-wider text-primary">Objet de la convention (arabe) *</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        dir="auto"
                        placeholder="Ex: اتفاقية شراكة مع العصبة المغربية..."
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
                    <FormLabel className="text-base font-bold uppercase tracking-wider text-primary">Objet de la convention (français)</FormLabel>
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

          <Card className="shadow-sm">
            <CardHeader className="bg-muted/30 pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Info className="w-5 h-5 text-secondary" />
                Informations Clés
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="rattachement" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rattachement (Direction/Division)</FormLabel>
                    <RattachementSelect
                      value={field.value}
                      onValueChange={(valeur) => {
                        field.onChange(valeur);
                        form.setValue("responsableProjet", null, { shouldDirty: true });
                      }}
                    />
                  </FormItem>
                )} />
                <FormField control={form.control} name="responsableProjet" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsable du projet</FormLabel>
                    <ServiceSelect
                      rattachement={rattachementChoisi}
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  </FormItem>
                )} />
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
                <FormField control={form.control} name="competence" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Compétence</FormLabel>
                    <Select
                      value={field.value || ""}
                      onValueChange={field.onChange}
                    >
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
                <FormField control={form.control} name="session" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Session</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
                  </FormItem>
                )} />
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
                        <SelectItem value="Infrastructure">Infrastructure</SelectItem>
                        <SelectItem value="Subventions">Subventions</SelectItem>
                        <SelectItem value="Prestations">Prestations</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={form.control} name="dateVisa" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date de visa</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader className="bg-muted/30 pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Wallet className="w-5 h-5 text-secondary" />
                Budget & Maîtrise d'ouvrage
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="enveloppeBudgetaire" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Enveloppe budgétaire (MAD)</FormLabel>
                    <FormControl><Input type="number" min="0" step="0.01" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="contributionRegion" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contribution de la Région (MAD)</FormLabel>
                    <FormControl><Input type="number" min="0" step="0.01" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="maitriseOuvrage" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Maîtrise d'ouvrage</FormLabel>
                    <FormControl><Input {...field} value={field.value || ""} dir="auto" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="maitriseOuvrageDeleguee" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Maîtrise d'ouvrage déléguée</FormLabel>
                    <FormControl><Input {...field} value={field.value || ""} dir="auto" /></FormControl>
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>
          
          <Card className="shadow-sm border-orange-200">
            <CardHeader className="bg-orange-50/50 pb-4 border-b border-orange-100">
              <CardTitle className="flex items-center gap-2 text-lg text-orange-900">
                <CalendarIcon className="w-5 h-5 text-orange-600" />
                Comité & Échéances (Initialisation)
              </CardTitle>
              <CardDescription>
                Ces dates déclencheront les alertes du tableau de bord.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-red-50/30 p-5 rounded-lg border border-red-100">
                <FormField control={form.control} name="prochaineEcheance" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-bold text-red-900">Date Prochaine Échéance</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value || ""} className="border-red-200 focus-visible:ring-red-500" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="prochaineEcheanceNote" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Note sur l'échéance</FormLabel>
                    <FormControl><Input {...field} value={field.value || ""} dir="auto" placeholder="Si la date n'est pas connue..." /></FormControl>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="dernierComite" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dernier comité tenu</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="dernierComiteNote" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mention (si aucune date)</FormLabel>
                    <FormControl><Input {...field} value={field.value || ""} dir="auto" placeholder="Ex : لم يعقد اي اجتماع" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="prochainComite" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prochain comité programmé</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value || ""} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="presidenceComite" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Présidence du comité</FormLabel>
                    <FormControl><Input {...field} value={field.value || ""} dir="auto" /></FormControl>
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="membresComite" render={({ field }) => (
                <FormItem>
                  <FormLabel>Membres du comité</FormLabel>
                  <FormControl><Textarea {...field} value={field.value || ""} dir="auto" className="min-h-[80px]" /></FormControl>
                </FormItem>
              )} />
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="documentConvention" render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="documentConvention">Convention</FormLabel>
                    <DocumentUploadField
                      id="documentConvention"
                      field="documentConvention"
                      value={field.value}
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
                      onChange={field.onChange}
                    />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="commentaires" render={({ field }) => (
                <FormItem>
                  <FormLabel>Commentaires</FormLabel>
                  <FormControl><Textarea {...field} value={field.value || ""} dir="auto" className="min-h-[100px]" /></FormControl>
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-4">
            <Button type="button" variant="outline" onClick={() => setLocation("/conventions")}>
              Annuler
            </Button>
            <Button type="submit" size="lg" disabled={createMutation.isPending} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm">
              <Save className="w-5 h-5 mr-2" />
              {createMutation.isPending ? "Création..." : "Créer la convention"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
