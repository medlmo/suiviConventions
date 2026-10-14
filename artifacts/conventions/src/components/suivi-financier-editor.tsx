import { useState } from "react";
import type { SuiviFinancier } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Plus, Trash2, X } from "lucide-react";

/** Brouillon éditable : une cellule vide signifie « non renseigné », jamais zéro. */
export type SuiviFinancierBrouillon = {
  annees: number[];
  lignes: { partenaire: string; montants: Record<string, string> }[];
};

export const MONTANT_REGEX = /^\d{1,13}([.,]\d{1,2})?$/;
export const MONTANT_MAX = 9999999999999.99;

export function parseMontant(valeur: string): number | null {
  const v = valeur.trim().replace(/\s/g, "");
  if (!v || !MONTANT_REGEX.test(v)) return null;
  const n = Number(v.replace(",", "."));
  // Même contrôle strict que le serveur : aucune tolérance sur les décimales.
  return Number.isFinite(n) && n >= 0 && n <= MONTANT_MAX && Number(n.toFixed(2)) === n ? n : null;
}

export function versBrouillon(suivi?: SuiviFinancier | null): SuiviFinancierBrouillon {
  return {
    annees: [...(suivi?.annees ?? [])].sort((a, b) => a - b),
    lignes: (suivi?.lignes ?? []).map((ligne) => ({
      partenaire: ligne.partenaire,
      montants: Object.fromEntries(ligne.contributions.map((c) => [String(c.annee), String(c.montant)])),
    })),
  };
}

export function versApi(brouillon: SuiviFinancierBrouillon): SuiviFinancier {
  const annees = [...brouillon.annees].sort((a, b) => a - b);
  return {
    annees,
    lignes: brouillon.lignes.map((ligne) => ({
      partenaire: ligne.partenaire,
      contributions: annees.flatMap((annee) => {
        const n = parseMontant(ligne.montants[String(annee)] ?? "");
        return n === null ? [] : [{ annee, montant: n }];
      }),
    })),
  };
}

const fmt = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtEntier = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const mad = (centimes: bigint) =>
  `${fmtEntier.format(centimes / 100n)},${String(centimes % 100n).padStart(2, "0")} MAD`;

function somme(valeurs: string[]): bigint | null {
  const nombres = valeurs.map(parseMontant).filter((n): n is number => n !== null);
  return nombres.length ? nombres.reduce((total, n) => total + BigInt(Math.round(n * 100)), 0n) : null;
}

type Props = {
  value: SuiviFinancierBrouillon;
  onChange: (value: SuiviFinancierBrouillon) => void;
  partenairesEligibles: string[];
  readOnly?: boolean;
  erreurs?: string[];
};

export function SuiviFinancierEditor({ value, onChange, partenairesEligibles, readOnly, erreurs = [] }: Props) {
  const [nouvelleAnnee, setNouvelleAnnee] = useState("");
  const [erreurAnnee, setErreurAnnee] = useState("");
  const [confirmation, setConfirmation] = useState<{ message: string; action: () => void } | null>(null);
  const annees = [...value.annees].sort((a, b) => a - b);
  const utilises = new Set(value.lignes.map((l) => l.partenaire));
  const disponibles = partenairesEligibles.filter((p) => !utilises.has(p));

  const ajouterAnnee = () => {
    const n = Number(nouvelleAnnee);
    if (!Number.isInteger(n) || n < 1900 || n > 2200) return setErreurAnnee("Année entière entre 1900 et 2200.");
    if (value.annees.includes(n)) return setErreurAnnee("Cette année existe déjà.");
    onChange({ ...value, annees: [...value.annees, n].sort((a, b) => a - b) });
    setNouvelleAnnee(""); setErreurAnnee("");
  };

  const retirerAnnee = (annee: number) => {
    const cle = String(annee);
    const faire = () => onChange({
      annees: value.annees.filter((a) => a !== annee),
      lignes: value.lignes.map((l) => {
        const { [cle]: _retire, ...reste } = l.montants;
        return { ...l, montants: reste };
      }),
    });
    if (value.lignes.some((l) => (l.montants[cle] ?? "").trim() !== "")) {
      setConfirmation({ message: `La colonne ${annee} contient des montants saisis. Ils seront retirés à l'enregistrement.`, action: faire });
    } else faire();
  };

  const retirerLigne = (index: number) => {
    const ligne = value.lignes[index];
    const faire = () => onChange({ ...value, lignes: value.lignes.filter((_, i) => i !== index) });
    if (Object.values(ligne.montants).some((m) => m.trim() !== "")) {
      setConfirmation({ message: `La ligne « ${ligne.partenaire || "sans partenaire"} » contient des montants saisis. Ils seront retirés à l'enregistrement.`, action: faire });
    } else faire();
  };

  const majCellule = (index: number, annee: number, montant: string) =>
    onChange({ ...value, lignes: value.lignes.map((l, i) => i === index ? { ...l, montants: { ...l.montants, [String(annee)]: montant } } : l) });

  const majPartenaire = (index: number, partenaire: string) =>
    onChange({ ...value, lignes: value.lignes.map((l, i) => i === index ? { ...l, partenaire } : l) });

  const totalGeneral = somme(value.lignes.flatMap((l) => annees.map((a) => l.montants[String(a)] ?? "")));

  return (
    <div className="space-y-4">
      {erreurs.length > 0 && (
        <div role="alert" data-testid="status-erreurs-suivi" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive space-y-1">
          {erreurs.map((e) => <p key={e} className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{e}</p>)}
        </div>
      )}

      {!readOnly && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="nouvelle-annee" className="text-sm font-medium">Ajouter une année</label>
            <div className="flex gap-2">
              <Input id="nouvelle-annee" data-testid="input-nouvelle-annee" type="text" inputMode="numeric" maxLength={4}
                className="w-28" value={nouvelleAnnee} placeholder="2025"
                onChange={(e) => { setNouvelleAnnee(e.target.value); setErreurAnnee(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ajouterAnnee(); } }} />
              <Button type="button" variant="outline" data-testid="button-ajouter-annee" onClick={ajouterAnnee}>
                <Plus className="w-4 h-4 mr-1" />Année
              </Button>
            </div>
            {erreurAnnee && <p className="text-xs text-destructive">{erreurAnnee}</p>}
          </div>
          <div className="space-y-1">
            <span className="text-sm font-medium block">Ajouter un partenaire</span>
            <Select value="" disabled={disponibles.length === 0}
              onValueChange={(p) => onChange({ ...value, lignes: [...value.lignes, { partenaire: p, montants: {} }] })}>
              <SelectTrigger className="w-64" data-testid="select-ajouter-partenaire">
                <SelectValue placeholder={partenairesEligibles.length === 0 ? "Aucun partenaire dans la fiche" : disponibles.length === 0 ? "Tous les partenaires sont ajoutés" : "Choisir un partenaire"} />
              </SelectTrigger>
              <SelectContent>
                {disponibles.map((p) => <SelectItem key={p} value={p}><span dir="auto">{p}</span></SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {value.lignes.length === 0 && annees.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          Aucun montage financier renseigné.
          {!readOnly && " Ajoutez des années et des partenaires (issus de la fiche) pour saisir les contributions."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-max text-sm border-collapse" data-testid="table-suivi-financier">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-start font-semibold px-3 py-2 border-b border-border min-w-[220px]">Partenaire</th>
                {annees.map((a) => (
                  <th key={a} className="font-semibold px-3 py-2 border-b border-s border-border text-end min-w-[160px]">
                    <span className="inline-flex items-center gap-1">
                      {a}
                      {!readOnly && (
                        <button type="button" aria-label={`Retirer l'année ${a}`} data-testid={`button-retirer-annee-${a}`}
                          className="rounded p-0.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => retirerAnnee(a)}><X className="w-3.5 h-3.5" /></button>
                      )}
                    </span>
                  </th>
                ))}
                <th className="font-semibold px-3 py-2 border-b border-s border-border text-end min-w-[160px] bg-accent/60">Total</th>
                {!readOnly && <th className="border-b border-border w-10" />}
              </tr>
            </thead>
            <tbody>
              {value.lignes.map((ligne, i) => {
                const horsFiche = !partenairesEligibles.includes(ligne.partenaire);
                const doublon = value.lignes.findIndex((l) => l.partenaire === ligne.partenaire) !== i;
                const total = somme(annees.map((a) => ligne.montants[String(a)] ?? ""));
                return (
                  <tr key={i} className={horsFiche || doublon ? "bg-destructive/5" : "hover:bg-muted/20"} data-testid={`row-financier-${i}`}>
                    <td className="px-3 py-2 border-b border-border align-top">
                      {readOnly ? (
                        <span dir="auto" className="font-medium">{ligne.partenaire}</span>
                      ) : (
                        <Select value={ligne.partenaire} onValueChange={(p) => majPartenaire(i, p)}>
                          <SelectTrigger className={horsFiche || doublon ? "border-destructive" : ""} data-testid={`select-partenaire-${i}`}>
                            <SelectValue placeholder="Choisir" />
                          </SelectTrigger>
                          <SelectContent>
                            {horsFiche && ligne.partenaire && <SelectItem value={ligne.partenaire}><span dir="auto">{ligne.partenaire}</span> (hors fiche)</SelectItem>}
                            {partenairesEligibles.filter((p) => p === ligne.partenaire || !utilises.has(p)).map((p) => (
                              <SelectItem key={p} value={p}><span dir="auto">{p}</span></SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {horsFiche && <p className="mt-1 text-xs text-destructive">Partenaire retiré de la fiche : réaffectez la ligne ou retirez-la.</p>}
                      {doublon && <p className="mt-1 text-xs text-destructive">Partenaire en double.</p>}
                    </td>
                    {annees.map((a) => {
                      const brut = ligne.montants[String(a)] ?? "";
                      const invalide = brut.trim() !== "" && parseMontant(brut) === null;
                      return (
                        <td key={a} className="px-3 py-2 border-b border-s border-border text-end tabular-nums align-top">
                          {readOnly ? (
                            brut.trim() === "" ? <span className="text-muted-foreground">—</span> : (parseMontant(brut) !== null ? fmt.format(parseMontant(brut)!) : brut)
                          ) : (
                            <Input value={brut} inputMode="decimal" placeholder="Non renseigné" aria-invalid={invalide}
                              aria-label={`Contribution de ${ligne.partenaire} en ${a} (MAD)`}
                              data-testid={`input-montant-${i}-${a}`}
                              className={`text-end tabular-nums ${invalide ? "border-destructive focus-visible:ring-destructive" : ""}`}
                              onChange={(e) => majCellule(i, a, e.target.value)} />
                          )}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 border-b border-s border-border text-end tabular-nums font-medium bg-accent/30 align-top whitespace-nowrap" data-testid={`text-total-ligne-${i}`}>
                      {total === null ? <span className="text-muted-foreground">—</span> : mad(total)}
                    </td>
                    {!readOnly && (
                      <td className="px-1 py-2 border-b border-border align-top">
                        <Button type="button" variant="ghost" size="icon" aria-label="Retirer la ligne" data-testid={`button-retirer-ligne-${i}`}
                          className="text-muted-foreground hover:text-destructive" onClick={() => retirerLigne(i)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-accent/60 font-semibold">
              <tr>
                <td className="px-3 py-2">Total annuel</td>
                {annees.map((a) => {
                  const t = somme(value.lignes.map((l) => l.montants[String(a)] ?? ""));
                  return <td key={a} className="px-3 py-2 border-s border-border text-end tabular-nums whitespace-nowrap" data-testid={`text-total-annee-${a}`}>{t === null ? "—" : mad(t)}</td>;
                })}
                <td className="px-3 py-2 border-s border-border text-end tabular-nums whitespace-nowrap text-primary" data-testid="text-total-general">{totalGeneral === null ? "—" : mad(totalGeneral)}</td>
                {!readOnly && <td />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">Montants en MAD, 2 décimales maximum. Une cellule vide reste « non renseignée » ; saisissez 0 pour une contribution nulle.</p>

      <AlertDialog open={!!confirmation} onOpenChange={(o) => { if (!o) setConfirmation(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer le retrait</AlertDialogTitle>
            <AlertDialogDescription>{confirmation?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button type="button" variant="destructive" data-testid="button-confirmer-retrait"
              onClick={() => { confirmation?.action(); setConfirmation(null); }}>Retirer</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
