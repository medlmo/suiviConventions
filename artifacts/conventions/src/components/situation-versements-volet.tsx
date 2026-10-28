import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Landmark, Plus, Trash2 } from "lucide-react";
import { parseMontant } from "@/components/suivi-financier-editor";
import { dateCalendaireValide } from "@/components/avancement-physique-volet";

export type VersementBrouillon = {
  annee: number;
  montantProgramme: string;
  tranches: { montant: string; dateVersement: string }[];
};

export type VersementApi = {
  annee: number;
  montantProgramme: number;
  montantVerse: number;
  tranches: { montant: number; dateVersement: string | Date }[];
};

export const VERSEMENTS_MAX_LIGNES = 301;

export function versBrouillonVersements(values?: VersementApi[] | null): VersementBrouillon[] {
  return [...(values ?? [])]
    .sort((a, b) => a.annee - b.annee)
    .map((v) => {
      const historique = v as typeof v & { dateDernierVersement?: string | Date | null };
      const tranches = "tranches" in v && Array.isArray(v.tranches)
        ? v.tranches.map((t) => ({
            montant: String(t.montant),
            dateVersement: t.dateVersement instanceof Date ? t.dateVersement.toISOString().slice(0, 10) : t.dateVersement,
          }))
        : historique.montantVerse > 0 && historique.dateDernierVersement
          ? [{
              montant: String(historique.montantVerse),
              dateVersement: historique.dateDernierVersement instanceof Date
                ? historique.dateDernierVersement.toISOString().slice(0, 10)
                : historique.dateDernierVersement,
            }]
          : [];
      return {
        annee: v.annee,
        montantProgramme: String(v.montantProgramme),
        tranches,
      };
    });
}

/** À n'appeler qu'après validation par erreursVersements. */
export function versApiVersements(draft: VersementBrouillon[]): VersementApi[] {
  return [...draft].sort((a, b) => a.annee - b.annee).map((v) => {
    const tranches = v.tranches.map((t) => ({
      montant: parseMontant(t.montant) ?? 0,
      dateVersement: t.dateVersement,
    }));
    const verse = tranches.reduce((total, t) => total + t.montant, 0);
    return {
      annee: v.annee,
      montantProgramme: parseMontant(v.montantProgramme) ?? 0,
      montantVerse: verse,
      tranches,
    };
  });
}

export function erreursVersements(draft: VersementBrouillon[]): string[] {
  const erreurs: string[] = [];
  if (draft.length > VERSEMENTS_MAX_LIGNES) erreurs.push(`Situation des versements : ${VERSEMENTS_MAX_LIGNES} années au maximum.`);
  const vues = new Set<number>();
  for (const v of draft) {
    const a = v.annee;
    if (!Number.isInteger(a) || a < 1900 || a > 2200) erreurs.push(`Versements : année ${a} hors de l'intervalle 1900–2200.`);
    if (vues.has(a)) erreurs.push(`Versements : l'année ${a} figure plusieurs fois.`);
    vues.add(a);
    if (v.montantProgramme.trim() === "") erreurs.push(`Versements ${a} : montant programmé obligatoire (saisissez 0 si nul).`);
    else if (parseMontant(v.montantProgramme) === null) erreurs.push(`Versements ${a} : montant programmé invalide (0 à 9 999 999 999 999,99 MAD, 2 décimales max).`);
    if (v.tranches.length > 100) erreurs.push(`Versements ${a} : 100 tranches au maximum.`);
    v.tranches.forEach((t, index) => {
      const tranche = index + 1;
      const montant = t.montant.trim() === "" ? undefined : parseMontant(t.montant);
      if (montant === undefined) erreurs.push(`Versements ${a}, tranche ${tranche} : montant obligatoire.`);
      else if (montant === null || montant <= 0) erreurs.push(`Versements ${a}, tranche ${tranche} : montant invalide ou nul (0 à 9 999 999 999 999,99 MAD, 2 décimales max).`);
      const date = t.dateVersement.trim();
      if (!date) erreurs.push(`Versements ${a}, tranche ${tranche} : date de versement obligatoire.`);
      else if (!dateCalendaireValide(date)) erreurs.push(`Versements ${a}, tranche ${tranche} : date de versement invalide (AAAA-MM-JJ).`);
      else if (Number(date.slice(0, 4)) !== a) erreurs.push(`Versements ${a}, tranche ${tranche} : la date doit appartenir à cette année.`);
    });
    const montantVerse = totalVerse(v);
    if (montantVerse > 9999999999999.99) erreurs.push(`Versements ${a} : le total versé dépasse la limite autorisée.`);
  }
  return erreurs;
}

const fmt = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => { const [a, m, j] = d.split("-"); return a && m && j ? `${j}/${m}/${a}` : d; };

type Taux = { valeur: number } | { indisponible: string };
function totalVerse(v: VersementBrouillon): number {
  const centimes = v.tranches.reduce((total, tranche) => {
    const montant = parseMontant(tranche.montant);
    return total + (montant === null ? 0 : Math.round(montant * 100));
  }, 0);
  return centimes / 100;
}

function calculTaux(v: VersementBrouillon): Taux {
  const p = parseMontant(v.montantProgramme);
  if (p === null) return { indisponible: "Montant programmé non renseigné ou invalide." };
  if (p === 0) return { indisponible: "Montant programmé nul : division par zéro impossible." };
  // Calcul en centimes pour éviter les erreurs d'arrondi flottant.
  return { valeur: (Math.round(totalVerse(v) * 100) / Math.round(p * 100)) * 100 };
}

function CelluleMontant({ brut }: { brut: string }) {
  const n = parseMontant(brut);
  if (brut.trim() === "") return <span className="text-muted-foreground">—</span>;
  return <>{n !== null ? fmt.format(n) : brut}</>;
}

type Props = {
  value: VersementBrouillon[];
  onChange: (value: VersementBrouillon[]) => void;
  readOnly: boolean;
  erreurs: string[];
};

export function SituationVersementsVolet({ value, onChange, readOnly, erreurs }: Props) {
  const [nouvelleAnnee, setNouvelleAnnee] = useState("");
  const [erreurAnnee, setErreurAnnee] = useState("");
  const [confirmation, setConfirmation] = useState<number | null>(null);
  const lignes = [...value].sort((a, b) => a.annee - b.annee);

  const ajouter = () => {
    const s = nouvelleAnnee.trim();
    const n = Number(s);
    if (!/^\d{4}$/.test(s) || n < 1900 || n > 2200) return setErreurAnnee("Année entière entre 1900 et 2200.");
    if (value.some((v) => v.annee === n)) return setErreurAnnee("Cette année existe déjà.");
    if (value.length >= VERSEMENTS_MAX_LIGNES) return setErreurAnnee(`${VERSEMENTS_MAX_LIGNES} années au maximum.`);
    onChange([...value, { annee: n, montantProgramme: "", tranches: [] }].sort((a, b) => a.annee - b.annee));
    setNouvelleAnnee(""); setErreurAnnee("");
  };

  const retirerDirect = (annee: number) => onChange(value.filter((v) => v.annee !== annee));
  const retirer = (v: VersementBrouillon) => {
    const saisi = v.montantProgramme.trim() !== "" || v.tranches.some((t) => t.montant.trim() !== "" || t.dateVersement.trim() !== "");
    if (saisi) setConfirmation(v.annee); else retirerDirect(v.annee);
  };

  const maj = (annee: number, patch: Partial<VersementBrouillon>) =>
    onChange(value.map((v) => (v.annee === annee ? { ...v, ...patch } : v)));
  const ajouterTranche = (annee: number) =>
    onChange(value.map((v) => v.annee === annee ? { ...v, tranches: [...v.tranches, { montant: "", dateVersement: "" }] } : v));
  const majTranche = (annee: number, index: number, patch: Partial<VersementBrouillon["tranches"][number]>) =>
    onChange(value.map((v) => v.annee === annee
      ? { ...v, tranches: v.tranches.map((t, i) => i === index ? { ...t, ...patch } : t) }
      : v));
  const retirerTranche = (annee: number, index: number) =>
    onChange(value.map((v) => v.annee === annee
      ? { ...v, tranches: v.tranches.filter((_, i) => i !== index) }
      : v));

  return (
    <Card id="situation-versements" className="shadow-sm scroll-mt-6" data-testid="card-situation-versements">
      <CardHeader className="bg-muted/30 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Landmark className="w-5 h-5 text-secondary" />
          Situation des versements
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-4">
        {erreurs.length > 0 && (
          <div role="alert" data-testid="status-erreurs-versements" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive space-y-1">
            {erreurs.map((e) => <p key={e} className="flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{e}</p>)}
          </div>
        )}

        {!readOnly && (
          <div className="space-y-1">
            <label htmlFor="nouvelle-annee-versement" className="text-sm font-medium">Ajouter une année</label>
            <div className="flex gap-2">
              <Input id="nouvelle-annee-versement" data-testid="input-nouvelle-annee-versement" inputMode="numeric" maxLength={4}
                className="w-28" placeholder="2025" value={nouvelleAnnee} aria-invalid={!!erreurAnnee}
                onChange={(e) => { setNouvelleAnnee(e.target.value); setErreurAnnee(""); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ajouter(); } }} />
              <Button type="button" variant="outline" data-testid="button-ajouter-annee-versement" onClick={ajouter}>
                <Plus className="w-4 h-4 mr-1" />Année
              </Button>
            </div>
            {erreurAnnee && <p className="text-xs text-destructive" data-testid="text-erreur-annee-versement">{erreurAnnee}</p>}
          </div>
        )}

        {lignes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground" data-testid="empty-versements">
            <p className="font-medium text-foreground">Aucune situation des versements renseignée.</p>
            <p className="mt-1">
              {readOnly
                ? "Les montants programmés et versés par la Région n'ont pas encore été saisis pour cette convention."
                : "Ajoutez une année pour saisir le montant programmé et les tranches de versement de la Région."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-max text-sm border-collapse" data-testid="table-versements">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-start font-semibold px-3 py-2 border-b border-border w-20">Année</th>
                  <th className="text-end font-semibold px-3 py-2 border-b border-s border-border min-w-[170px]">Total programmé (MAD)</th>
                  <th className="text-start font-semibold px-3 py-2 border-b border-s border-border min-w-[300px]">Tranches de versement</th>
                  <th className="text-end font-semibold px-3 py-2 border-b border-s border-border min-w-[150px]">Total versé (MAD)</th>
                  <th className="text-end font-semibold px-3 py-2 border-b border-s border-border min-w-[140px] bg-accent/60">Taux de versement</th>
                  {!readOnly && <th className="border-b border-border w-10"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {lignes.map((v) => {
                  const taux = calculTaux(v);
                  const progInv = v.montantProgramme.trim() !== "" && parseMontant(v.montantProgramme) === null;
                  const verse = totalVerse(v);
                  const ko = "border-destructive focus-visible:ring-destructive";
                  return (
                    <tr key={v.annee} className="hover:bg-muted/20" data-testid={`row-versement-${v.annee}`}>
                      <td className="px-3 py-2 border-b border-border font-semibold tabular-nums align-top">{v.annee}</td>
                      <td className="px-3 py-2 border-b border-s border-border text-end tabular-nums align-top">
                        {readOnly ? <span data-testid={`text-programme-${v.annee}`}><CelluleMontant brut={v.montantProgramme} /></span> : (
                          <Input value={v.montantProgramme} inputMode="decimal" placeholder="Obligatoire" aria-invalid={progInv}
                            aria-label={`Montant programmé ${v.annee} (MAD)`} data-testid={`input-programme-${v.annee}`}
                            className={`text-end tabular-nums ${progInv ? ko : ""}`}
                            onChange={(e) => maj(v.annee, { montantProgramme: e.target.value })} />
                        )}
                      </td>
                      <td className="px-3 py-2 border-b border-s border-border align-top">
                        <div className="space-y-2">
                          {v.tranches.length === 0 && readOnly && <span className="text-muted-foreground">—</span>}
                          {v.tranches.map((tranche, index) => {
                            const trancheMontant = tranche.montant.trim() === "" ? null : parseMontant(tranche.montant);
                            const date = tranche.dateVersement.trim();
                            const invalideMontant = trancheMontant === null || trancheMontant <= 0;
                            const invalideDate = !date || !dateCalendaireValide(date) || Number(date.slice(0, 4)) !== v.annee;
                            return (
                              <div key={index} className="flex flex-wrap items-center gap-2" data-testid={`row-tranche-${v.annee}-${index + 1}`}>
                                {readOnly ? (
                                  <>
                                    <span className="tabular-nums">{date ? fmtDate(date) : "—"}</span>
                                    <span className="text-muted-foreground">·</span>
                                    <span className="tabular-nums"><CelluleMontant brut={tranche.montant} /> MAD</span>
                                  </>
                                ) : (
                                  <>
                                    <Input type="date" value={tranche.dateVersement}
                                      aria-label={`Date de versement ${v.annee}, tranche ${index + 1}`}
                                      data-testid={`input-date-versement-${v.annee}-${index + 1}`}
                                      aria-invalid={invalideDate} className={`w-40 ${invalideDate && date ? ko : ""}`}
                                      onChange={(e) => majTranche(v.annee, index, { dateVersement: e.target.value })} />
                                    <Input value={tranche.montant} inputMode="decimal" placeholder="Montant (MAD)"
                                      aria-label={`Montant de la tranche ${index + 1} en ${v.annee}`}
                                      data-testid={`input-montant-tranche-${v.annee}-${index + 1}`}
                                      aria-invalid={invalideMontant} className={`w-36 text-end tabular-nums ${invalideMontant && tranche.montant ? ko : ""}`}
                                      onChange={(e) => majTranche(v.annee, index, { montant: e.target.value })} />
                                    <Button type="button" variant="ghost" size="icon"
                                      aria-label={`Retirer la tranche ${index + 1} de ${v.annee}`}
                                      data-testid={`button-retirer-tranche-${v.annee}-${index + 1}`}
                                      className="text-muted-foreground hover:text-destructive"
                                      onClick={() => retirerTranche(v.annee, index)}><Trash2 className="w-4 h-4" /></Button>
                                  </>
                                )}
                              </div>
                            );
                          })}
                          {!readOnly && (
                            <Button type="button" variant="outline" size="sm" data-testid={`button-ajouter-tranche-${v.annee}`}
                              disabled={v.tranches.length >= 100} onClick={() => ajouterTranche(v.annee)}>
                              <Plus className="w-4 h-4 me-1" />Ajouter une tranche
                            </Button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2 border-b border-s border-border text-end tabular-nums align-top">
                        <span data-testid={`text-verse-${v.annee}`}>{fmt.format(verse)}</span>
                      </td>
                      <td className="px-3 py-2 border-b border-s border-border text-end tabular-nums bg-accent/30 align-top" data-testid={`text-taux-versement-${v.annee}`}>
                        {"valeur" in taux ? (
                          <div className="space-y-0.5">
                            <span className={`font-semibold ${taux.valeur > 100 ? "text-destructive" : "text-primary"}`}>
                              {taux.valeur.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %
                            </span>
                            {taux.valeur > 100 && (
                              <p className="flex items-center justify-end gap-1 text-xs text-destructive whitespace-nowrap">
                                <AlertTriangle className="w-3.5 h-3.5" />Versé supérieur au programmé
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground" title={taux.indisponible}>
                            —<span className="block text-xs whitespace-normal max-w-[160px] ms-auto">{taux.indisponible}</span>
                          </span>
                        )}
                      </td>
                      {!readOnly && (
                        <td className="px-1 py-2 border-b border-border align-top">
                          <Button type="button" variant="ghost" size="icon" aria-label={`Retirer l'année ${v.annee}`}
                            data-testid={`button-retirer-versement-${v.annee}`} className="text-muted-foreground hover:text-destructive"
                            onClick={() => retirer(v)}><Trash2 className="w-4 h-4" /></Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <AlertDialog open={confirmation !== null} onOpenChange={(o) => { if (!o) setConfirmation(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmer le retrait</AlertDialogTitle>
              <AlertDialogDescription>
                L'année {confirmation} contient des données saisies. Elles seront retirées à l'enregistrement de la fiche.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <Button type="button" variant="destructive" data-testid="button-confirmer-retrait-versement"
                onClick={() => { if (confirmation !== null) retirerDirect(confirmation); setConfirmation(null); }}>Retirer</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
