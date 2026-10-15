import type { AvancementPhysiqueEntree } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, AlertTriangle, History, Plus, X } from "lucide-react";

export type BrouillonAvancement = { dateConstat: string; taux: string; commentaire: string };

export const COMMENTAIRE_MAX = 2000;

export function natureAvancementEligible(nature: string | null | undefined): boolean {
  const n = (nature ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  return n === "infrastructure" || n === "prestation" || n === "prestations";
}

export function dateCalendaireValide(valeur: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  if (!m) return false;
  const [a, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(a, mo - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === mo - 1 && d.getUTCDate() === j;
}

/** Retourne le taux numérique si valide (0..100, 2 décimales max), sinon null. */
export function parseTaux(brut: string): number | null {
  const s = brut.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

export function trierConstats(historique: AvancementPhysiqueEntree[]): AvancementPhysiqueEntree[] {
  return [...historique].sort((a, b) =>
    a.dateConstat !== b.dateConstat
      ? (a.dateConstat < b.dateConstat ? 1 : -1)
      : (Date.parse(b.enregistreLe) || 0) - (Date.parse(a.enregistreLe) || 0));
}

const fmtTaux = (t: number) => `${t.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`;
const dateDuJour = () => {
  const parties = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Casablanca", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const valeur = (type: string) => parties.find(partie => partie.type === type)?.value ?? "";
  return `${valeur("year")}-${valeur("month")}-${valeur("day")}`;
};
const fmtDate = (d: string) => {
  const [a, m, j] = d.split("T")[0].split("-");
  return a && m && j ? `${j}/${m}/${a}` : d;
};
const fmtHorodatage = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
};

function Barre({ taux }: { taux: number }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Taux d'avancement physique estimé" aria-valuemin={0} aria-valuemax={100} aria-valuenow={taux}>
      <div className="h-full rounded-full bg-secondary transition-transform duration-500 origin-left" style={{ width: "100%", transform: `scaleX(${Math.min(100, Math.max(0, taux)) / 100})` }} />
    </div>
  );
}

type Erreurs = { racine?: string; dateConstat?: string; taux?: string; commentaire?: string };

export function AvancementPhysiqueVolet({
  historique, brouillon, onChange, readOnly, erreurs,
}: {
  historique: AvancementPhysiqueEntree[];
  brouillon: BrouillonAvancement | null;
  onChange: (b: BrouillonAvancement | null) => void;
  readOnly: boolean;
  erreurs: Erreurs;
}) {
  const tries = trierConstats(historique);
  const courant = tries[0] ?? null;
  const maj = (patch: Partial<BrouillonAvancement>) => brouillon && onChange({ ...brouillon, ...patch });

  return (
    <Card id="avancement-physique" className="shadow-sm scroll-mt-6" data-testid="card-avancement-physique">
      <CardHeader className="bg-muted/30 pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="w-5 h-5 text-secondary" />
          Avancement physique du projet
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-[220px] flex-1 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Taux courant</p>
            {courant ? (
              <>
                <p className="text-3xl font-bold text-primary tabular-nums" data-testid="text-taux-courant">{fmtTaux(courant.taux)}</p>
                <Barre taux={courant.taux} />
                <p className="text-xs text-muted-foreground">Constat du {fmtDate(courant.dateConstat)} par {courant.auteur}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="text-taux-courant">Non renseigné : aucun constat enregistré.</p>
            )}
          </div>
          {!readOnly && !brouillon && (
            <Button type="button" variant="outline" data-testid="button-actualiser-avancement"
              onClick={() => onChange({ dateConstat: dateDuJour(), taux: "", commentaire: "" })}>
              <Plus className="w-4 h-4 mr-2" />Actualiser
            </Button>
          )}
        </div>

        {brouillon && !readOnly && (
          <div className="rounded-lg border border-secondary/40 bg-accent/40 p-4 space-y-4" data-testid="form-avancement-brouillon">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-primary">Nouveau constat (enregistré avec la fiche)</p>
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} data-testid="button-annuler-avancement">
                <X className="w-4 h-4 mr-1" />Annuler
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="space-y-1.5 text-sm font-medium">
                <span>Date du constat</span>
                <Input type="date" value={brouillon.dateConstat} onChange={(e) => maj({ dateConstat: e.target.value })} aria-invalid={!!erreurs.dateConstat} data-testid="input-avancement-date" />
                {erreurs.dateConstat && <span className="block text-sm text-destructive">{erreurs.dateConstat}</span>}
              </label>
              <label className="space-y-1.5 text-sm font-medium">
                <span>Taux estimé (%)</span>
                <Input inputMode="decimal" placeholder="0 à 100" value={brouillon.taux} onChange={(e) => maj({ taux: e.target.value })} aria-invalid={!!erreurs.taux} data-testid="input-avancement-taux" />
                {erreurs.taux && <span className="block text-sm text-destructive">{erreurs.taux}</span>}
              </label>
            </div>
            <label className="block space-y-1.5 text-sm font-medium">
              <span>Commentaire (facultatif)</span>
              <Textarea dir="auto" value={brouillon.commentaire} onChange={(e) => maj({ commentaire: e.target.value })} className="min-h-[70px]" data-testid="input-avancement-commentaire" />
              <span className={`block text-xs ${brouillon.commentaire.length > COMMENTAIRE_MAX ? "text-destructive" : "text-muted-foreground"}`}>{brouillon.commentaire.length} / {COMMENTAIRE_MAX}</span>
              {erreurs.commentaire && <span className="block text-sm text-destructive">{erreurs.commentaire}</span>}
            </label>
          </div>
        )}
        {erreurs.racine && <p role="alert" className="flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="w-4 h-4" />{erreurs.racine}</p>}

        <div className="space-y-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><History className="w-4 h-4" />Historique des constats</p>
          {tries.length === 0 ? (
            <div className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground" data-testid="empty-avancement">
              Aucun avancement physique n'a encore été constaté pour ce projet.
            </div>
          ) : (
            <ol className="relative space-y-3 border-l-2 border-border pl-5">
              {tries.map((e) => (
                <li key={e.id} className="relative" data-testid={`row-avancement-${e.id}`}>
                  <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-card bg-secondary" />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">{fmtDate(e.dateConstat)}</span>
                    <span className="font-bold text-primary tabular-nums">{fmtTaux(e.taux)}</span>
                  </div>
                  <div className="mt-1.5"><Barre taux={e.taux} /></div>
                  {e.commentaire && <p dir="auto" className="mt-1.5 whitespace-pre-wrap text-sm">{e.commentaire}</p>}
                  <p className="mt-1 text-xs text-muted-foreground">Saisi par {e.auteur} le {fmtHorodatage(e.enregistreLe)}</p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
