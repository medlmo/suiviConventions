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
  montantVerse: string;
  dateDernierVersement: string;
};

export type VersementApi = {
  annee: number;
  montantProgramme: number;
  montantVerse: number;
  dateDernierVersement: string | null;
};

export const VERSEMENTS_MAX_LIGNES = 301;

export function versBrouillonVersements(values?: VersementApi[] | null): VersementBrouillon[] {
  return [...(values ?? [])]
    .sort((a, b) => a.annee - b.annee)
    .map((v) => ({
      annee: v.annee,
      montantProgramme: String(v.montantProgramme),
      montantVerse: String(v.montantVerse),
      dateDernierVersement: v.dateDernierVersement ?? "",
    }));
}

/** À n'appeler qu'après validation par erreursVersements. */
export function versApiVersements(draft: VersementBrouillon[]): VersementApi[] {
  return [...draft].sort((a, b) => a.annee - b.annee).map((v) => {
    const verse = parseMontant(v.montantVerse) ?? 0;
    const date = v.dateDernierVersement.trim();
    return {
      annee: v.annee,
      montantProgramme: parseMontant(v.montantProgramme) ?? 0,
      montantVerse: verse,
      dateDernierVersement: verse > 0 && date ? date : null,
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
    const verse = v.montantVerse.trim() === "" ? undefined : parseMontant(v.montantVerse);
    if (verse === undefined) erreurs.push(`Versements ${a} : montant versé obligatoire (saisissez 0 si aucun versement).`);
    else if (verse === null) erreurs.push(`Versements ${a} : montant versé invalide (0 à 9 999 999 999 999,99 MAD, 2 décimales max).`);
    const date = v.dateDernierVersement.trim();
    if (date && !dateCalendaireValide(date)) erreurs.push(`Versements ${a} : date du dernier versement invalide (AAAA-MM-JJ).`);
    if (typeof verse === "number" && verse > 0 && !date) erreurs.push(`Versements ${a} : date du dernier versement obligatoire lorsqu'un montant a été versé.`);
    if (verse === 0 && date) erreurs.push(`Versements ${a} : aucune date ne doit être saisie lorsque le montant versé est nul.`);
  }
  return erreurs;
}

const fmt = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => { const [a, m, j] = d.split("-"); return a && m && j ? `${j}/${m}/${a}` : d; };

type Taux = { valeur: number } | { indisponible: string };
function calculTaux(v: VersementBrouillon): Taux {
  const p = parseMontant(v.montantProgramme);
  const s = parseMontant(v.montantVerse);
  if (p === null) return { indisponible: "Montant programmé non renseigné ou invalide." };
  if (p === 0) return { indisponible: "Montant programmé nul : division par zéro impossible." };
  if (s === null) return { indisponible: "Montant versé non renseigné ou invalide." };
  // Calcul en centimes pour éviter les erreurs d'arrondi flottant.
  return { valeur: (Math.round(s * 100) / Math.round(p * 100)) * 100 };
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
    onChange([...value, { annee: n, montantProgramme: "", montantVerse: "", dateDernierVersement: "" }].sort((a, b) => a.annee - b.annee));
    setNouvelleAnnee(""); setErreurAnnee("");
  };

  const retirerDirect = (annee: number) => onChange(value.filter((v) => v.annee !== annee));
  const retirer = (v: VersementBrouillon) => {
    const saisi = [v.montantProgramme, v.montantVerse, v.dateDernierVersement].some((x) => x.trim() !== "");
    if (saisi) setConfirmation(v.annee); else retirerDirect(v.annee);
  };

  const maj = (annee: number, patch: Partial<VersementBrouillon>) =>
    onChange(value.map((v) => (v.annee === annee ? { ...v, ...patch } : v)));

  return (
    <Card id="situation-versements" className="shadow-sm scroll-mt-6" data-testid="card-situation-versements">
      <CardHeader className="bg-muted/30 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Landmark className="w-5 h-5 text-secondary" />
          Situation des versements
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Versements de la Région Souss-Massa uniquement, par année. Les montants programmés sont saisis ici, indépendamment du montage financier.
        </p>
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
                : "Ajoutez une année pour saisir le montant programmé, le montant versé par la Région et la date du dernier versement."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-max text-sm border-collapse" data-testid="table-versements">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-start font-semibold px-3 py-2 border-b border-border w-20">Année</th>
                  <th className="text-end font-semibold px-3 py-2 border-b border-s border-border min-w-[170px]">Total programmé (MAD)</th>
                  <th className="text-end font-semibold px-3 py-2 border-b border-s border-border min-w-[170px]">Total versé (MAD)</th>
                  <th className="text-start font-semibold px-3 py-2 border-b border-s border-border min-w-[160px]">Date du dernier versement</th>
                  <th className="text-end font-semibold px-3 py-2 border-b border-s border-border min-w-[140px] bg-accent/60">Taux de versement</th>
                  {!readOnly && <th className="border-b border-border w-10"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {lignes.map((v) => {
                  const taux = calculTaux(v);
                  const progInv = v.montantProgramme.trim() !== "" && parseMontant(v.montantProgramme) === null;
                  const verse = parseMontant(v.montantVerse);
                  const verseInv = v.montantVerse.trim() !== "" && verse === null;
                  const date = v.dateDernierVersement.trim();
                  const dateInv = (date !== "" && !dateCalendaireValide(date)) || (verse !== null && verse > 0 && !date) || (verse === 0 && date !== "");
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
                      <td className="px-3 py-2 border-b border-s border-border text-end tabular-nums align-top">
                        {readOnly ? <span data-testid={`text-verse-${v.annee}`}><CelluleMontant brut={v.montantVerse} /></span> : (
                          <Input value={v.montantVerse} inputMode="decimal" placeholder="Obligatoire" aria-invalid={verseInv}
                            aria-label={`Montant versé ${v.annee} (MAD)`} data-testid={`input-verse-${v.annee}`}
                            className={`text-end tabular-nums ${verseInv ? ko : ""}`}
                            onChange={(e) => maj(v.annee, { montantVerse: e.target.value })} />
                        )}
                      </td>
                      <td className="px-3 py-2 border-b border-s border-border tabular-nums align-top">
                        {readOnly ? (
                          <span data-testid={`text-date-versement-${v.annee}`}>{date ? fmtDate(date) : <span className="text-muted-foreground">—</span>}</span>
                        ) : (
                          <Input type="date" value={v.dateDernierVersement} aria-invalid={dateInv}
                            aria-label={`Date du dernier versement ${v.annee}`} data-testid={`input-date-versement-${v.annee}`}
                            disabled={verse === 0 && date === ""} className={dateInv ? ko : ""}
                            onChange={(e) => maj(v.annee, { dateDernierVersement: e.target.value })} />
                        )}
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
        <p className="text-xs text-muted-foreground">
          Montants en MAD, 2 décimales maximum ; saisissez 0 pour un montant nul. Taux = versé ÷ programmé × 100.
          La date du dernier versement est requise dès qu'un montant a été versé et doit rester vide sinon.
        </p>

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
