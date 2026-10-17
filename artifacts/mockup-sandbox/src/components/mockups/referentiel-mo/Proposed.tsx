import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  FolderTree,
  Landmark,
  Layers3,
  Pencil,
  Plus,
  Search,
  X,
  Waypoints,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import "./_group.css";

const initialMaitrises = [
  "Agence régionale d’exécution des projets",
  "Agence urbaine d’Agadir",
  "Agence du bassin hydraulique du Souss-Massa",
  "Centre régional d’investissement Souss-Massa",
  "Chambre de commerce, d’industrie et de services Souss-Massa",
  "Chambre d’agriculture de la région Souss-Massa",
  "Commune d’Agadir",
  "Commune d’Aït Melloul",
  "Commune de Biougra",
  "Commune de Dcheira El Jihadia",
  "Commune de Inezgane",
  "Commune de Taroudant",
  "Commune de Tata",
  "Commune de Tiznit",
  "Conseil régional Souss-Massa",
  "Direction régionale de l’Équipement",
  "Direction régionale de la Santé et de la Protection sociale",
  "Direction régionale de l’Artisanat",
  "Direction régionale de l’Agriculture",
  "Direction régionale des Eaux et Forêts",
  "Direction régionale de la Formation professionnelle",
  "Direction régionale de la Culture",
  "Établissement autonome de contrôle et de coordination des exportations",
  "Institut agronomique et vétérinaire Hassan II — complexe horticole",
  "Office national de l’électricité et de l’eau potable",
  "Office national du conseil agricole",
  "Office national des aéroports",
  "Régie autonome multiservices d’Agadir",
  "Société Al Omrane Souss-Massa",
  "Société de développement touristique Souss-Massa",
  "Université Ibn Zohr",
  "المجلس الإقليمي لتارودانت",
  "جمعية سوس ماسة للتنمية",
  "مؤسسة التعاون بين الجماعات",
];

const PAGE_SIZE = 20;

type Draft = { id: number | null; nom: string };

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("fr")
    .replace(/[یىئ]/g, "ي")
    .replace(/ک/g, "ك")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/[\u0640\u064B-\u0655\u0670]/g, "");
}

function OrganigrammePreview() {
  return (
    <div>
      <Card className="overflow-hidden rounded-xl border-[#dce2e2] bg-[#fffefa] shadow-[0_2px_10px_rgba(34,54,70,.035)]">
        <div className="border-b border-[#e3e7e5] px-5 py-5 sm:px-7">
          <div className="flex items-center gap-2">
            <FolderTree className="h-4 w-4 text-[#8c702f]" />
            <h2 className="text-base font-semibold text-[#263e52]">Organigramme</h2>
          </div>
          <p className="mt-1 text-xs text-[#78858b]">Directions, divisions et services.</p>
        </div>

        <div className="space-y-4 p-5 sm:p-7">
          <section className="overflow-hidden rounded-lg border border-[#e1e6e3]">
            <div className="bg-[#f8f8f4] px-4 py-3">
              <h3 className="text-sm font-semibold text-[#30495c]">Direction générale des services</h3>
              <p className="mt-1 text-xs text-[#78858b]">Services directement rattachés</p>
            </div>
            <div className="grid gap-2 p-4 sm:grid-cols-2">
              {["Coopération", "Juridique"].map((service) => (
                <div key={service} className="flex items-center gap-2 rounded-md bg-[#f8f8f4] px-3 py-2.5 text-sm text-[#526875]">
                  <Waypoints className="h-3.5 w-3.5 shrink-0 text-[#a17c37]" />
                  <span dir="auto">{service}</span>
                </div>
              ))}
            </div>
          </section>

          {[
            {
              direction: "Direction de l’aménagement du territoire",
              divisions: [
                {
                  nom: "Études et planification",
                  services: ["Urbanisme", "Suivi des projets"],
                },
                {
                  nom: "Développement territorial",
                  services: ["Coordination territoriale"],
                },
              ],
            },
            {
              direction: "Direction des finances",
              divisions: [
                {
                  nom: "Budget et programmation",
                  services: ["Préparation budgétaire", "Suivi financier"],
                },
              ],
            },
          ].map((direction) => (
            <section key={direction.direction} className="overflow-hidden rounded-lg border border-[#e1e6e3]">
              <div className="flex items-center gap-2 bg-[#f8f8f4] px-4 py-3">
                <Building2 className="h-4 w-4 shrink-0 text-[#315a79]" />
                <h3 className="text-sm font-semibold text-[#30495c]" dir="auto">{direction.direction}</h3>
              </div>
              <div className="space-y-3 p-4">
                {direction.divisions.map((division) => (
                  <div key={division.nom} className="border-l-2 border-[#b48b3e]/50 pl-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-[#526875]">
                      <Layers3 className="h-3.5 w-3.5 shrink-0 text-[#a17c37]" />
                      <span dir="auto">{division.nom}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 pl-5">
                      {division.services.map((service) => (
                        <span key={service} className="inline-flex items-center gap-1.5 rounded-md border border-[#e5e9e5] px-2.5 py-1.5 text-xs text-[#687985]">
                          <Waypoints className="h-3 w-3 text-[#89979a]" />
                          <span dir="auto">{service}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Card>

    </div>
  );
}

export function Proposed() {
  const [items, setItems] = useState(() => initialMaitrises.map((nom, index) => ({ id: index + 1, nom })));
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [activeSection, setActiveSection] = useState<"organisation" | "maitrises-ouvrage">("maitrises-ouvrage");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savedMessage, setSavedMessage] = useState("");

  const filtered = useMemo(() => {
    const term = normalizeSearchText(search.trim());
    return items
      .filter((item) => !term || normalizeSearchText(item.nom).includes(term))
      .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }, [items, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rangeStart = filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filtered.length);

  const openDraft = (item?: { id: number; nom: string }) => {
    setSavedMessage("");
    setDraft(item ? { id: item.id, nom: item.nom } : { id: null, nom: "" });
  };

  const saveDraft = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nom = draft?.nom.trim();
    if (!draft || !nom) return;
    if (draft.id === null) {
      const nextId = Math.max(0, ...items.map((item) => item.id)) + 1;
      setItems((current) => [...current, { id: nextId, nom }]);
      setSearch("");
      setPage(1);
      setSavedMessage("La maîtrise d’ouvrage a été ajoutée.");
    } else {
      setItems((current) => current.map((item) => (item.id === draft.id ? { ...item, nom } : item)));
      setSavedMessage("Le nom a été mis à jour.");
    }
    setDraft(null);
  };

  return (
    <main className="min-h-[100dvh] bg-[#f5f6f4] px-4 py-5 text-[#20354a] sm:px-8 sm:py-8 lg:px-12">
      <div className="mx-auto max-w-[1160px]">
        <div className="mb-7 flex items-center gap-2 text-[12px] font-medium text-[#71808c]">
          <span>Administration</span>
          <span className="text-[#b6a478]">/</span>
          <span className="text-[#294c6c]">Données de référence</span>
        </div>

        <header className="mb-8 flex flex-col justify-between gap-5 border-b border-[#dce1e2] pb-7 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#e8edf0] text-[#315a79]">
                <Landmark className="h-4 w-4" strokeWidth={1.8} />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#9a7530]">Référentiel partagé</span>
            </div>
            <h1 className="font-['Outfit'] text-[30px] font-semibold leading-tight tracking-[-.035em] text-[#1e3448] sm:text-[36px]">
              Référentiel
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[#657581]">
              Organigramme et maîtrises d’ouvrage consultés dans deux espaces distincts.
            </p>
          </div>
          {activeSection === "maitrises-ouvrage" && (
            <Button
              type="button"
              data-testid="button-add-maitrise"
              className="h-10 shrink-0 bg-[#244c6d] px-4 text-white shadow-sm hover:bg-[#193d5b]"
              onClick={() => openDraft()}
            >
              <Plus className="mr-2 h-4 w-4" />
              Ajouter une maîtrise
            </Button>
          )}
        </header>

        <div role="group" aria-label="Sections du référentiel" className="mb-6 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={activeSection === "organisation" ? "default" : "outline"}
            data-testid="button-view-organisation"
            aria-pressed={activeSection === "organisation"}
            onClick={() => setActiveSection("organisation")}
            className={activeSection === "organisation" ? "bg-[#244c6d] text-white hover:bg-[#193d5b]" : "border-[#d9e0df] bg-[#fffefa] text-[#526875]"}
          >
            <FolderTree className="mr-2 h-4 w-4" />
            Organigramme
          </Button>
          <Button
            type="button"
            variant={activeSection === "maitrises-ouvrage" ? "default" : "outline"}
            data-testid="button-view-maitrises"
            aria-pressed={activeSection === "maitrises-ouvrage"}
            onClick={() => setActiveSection("maitrises-ouvrage")}
            className={activeSection === "maitrises-ouvrage" ? "bg-[#244c6d] text-white hover:bg-[#193d5b]" : "border-[#d9e0df] bg-[#fffefa] text-[#526875]"}
          >
            <Building2 className="mr-2 h-4 w-4" />
            Maîtrises d’ouvrage
          </Button>
        </div>

        {activeSection === "organisation" ? <OrganigrammePreview /> : (
        <div>
          <Card className="overflow-hidden rounded-xl border-[#dce2e2] bg-[#fffefa] shadow-[0_2px_10px_rgba(34,54,70,.035)]">
            <div className="border-b border-[#e3e7e5] px-5 py-5 sm:px-7">
              <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-base font-semibold text-[#263e52]">Catalogue des organismes</h2>
                  <p className="mt-1 text-xs text-[#78858b]">Recherchez par nom pour retrouver rapidement une entrée.</p>
                </div>
                <div className="relative w-full sm:max-w-[320px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#87939a]" />
                  <Input
                    value={search}
                    data-testid="input-search-maitrise"
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                    aria-label="Rechercher une maîtrise d’ouvrage"
                    placeholder="Rechercher un organisme…"
                    className="h-10 border-[#d9e0df] bg-[#fffefa] pl-9 pr-9 text-sm placeholder:text-[#9ba5a8] focus-visible:ring-[#a87f37]/40"
                  />
                  {search && (
                    <button
                      type="button"
                      data-testid="button-clear-maitrise-search"
                      onClick={() => {
                        setSearch("");
                        setPage(1);
                      }}
                      aria-label="Effacer la recherche"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-[#74838a] hover:bg-[#edf0ed]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-[#687985]" aria-live="polite">
                  <span className="font-semibold text-[#294b67]" data-testid="text-maitrise-count">{filtered.length}</span>
                  {" "}{filtered.length === 1 ? "résultat" : "résultats"}
                  {search && <span> pour « {search} »</span>}
                </p>
                <div className="inline-flex items-center gap-1.5 rounded-full border border-[#e4e7e2] bg-[#f8f8f3] px-2.5 py-1 text-[11px] font-medium text-[#65747b]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#b38b43]" />
                  Liste commune aux deux champs MO
                </div>
              </div>
            </div>

            <div className="min-h-[456px]">
              {visibleItems.length ? (
                <>
                  <div className="hidden grid-cols-[minmax(0,1fr)_92px] items-center border-b border-[#e7eae7] bg-[#f8f8f4] px-7 py-2.5 text-[10px] font-semibold uppercase tracking-[.13em] text-[#8a9698] sm:grid">
                    <span>Nom de la maîtrise d’ouvrage</span>
                    <span className="text-right">Action</span>
                  </div>
                  <div className="divide-y divide-[#e9ece8]">
                    {visibleItems.map((item, index) => (
                      <div
                        key={item.id}
                        className="group grid grid-cols-[32px_minmax(0,1fr)_40px] items-center gap-3 px-5 py-[13px] transition-colors hover:bg-[#f8f8f3] sm:grid-cols-[36px_minmax(0,1fr)_92px] sm:px-7"
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#eef1ef] font-mono text-[10px] text-[#718087]">
                          {String((currentPage - 1) * PAGE_SIZE + index + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0">
                          <span className="block text-[13px] font-medium leading-5 text-[#30495c]" dir="auto">{item.nom}</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          data-testid={`button-rename-maitrise-${item.id}`}
                          aria-label={`Renommer ${item.nom}`}
                          onClick={() => openDraft(item)}
                          className="h-8 w-8 justify-self-end rounded-md text-[#6d7c82] hover:bg-[#eaf0f1] hover:text-[#244c6d] sm:w-auto sm:px-2.5"
                        >
                          <Pencil className="h-3.5 w-3.5 sm:mr-1.5" />
                          <span className="hidden text-xs sm:inline">Renommer</span>
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex min-h-[400px] flex-col items-center justify-center px-6 text-center">
                  <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#edf1ef] text-[#567186]">
                    <Search className="h-5 w-5" />
                  </span>
                  <h3 className="text-sm font-semibold text-[#30495c]">Aucun organisme trouvé</h3>
                  <p className="mt-1.5 max-w-xs text-xs leading-5 text-[#78858b]">
                    Essayez un autre terme ou effacez la recherche pour parcourir le catalogue.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="button-clear-maitrise-search-empty"
                    className="mt-4 border-[#d9e0df]"
                    onClick={() => {
                      setSearch("");
                      setPage(1);
                    }}
                  >
                    Effacer la recherche
                  </Button>
                </div>
              )}
            </div>

            <footer className="flex flex-col gap-3 border-t border-[#e3e7e5] bg-[#fbfbf8] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <p className="text-xs text-[#7a878c]">
                <span data-testid="text-maitrise-page-range">
                  {rangeStart}–{rangeEnd} sur {filtered.length} entrée{filtered.length > 1 ? "s" : ""}
                </span>
                <span className="ml-1 text-[#9aa3a4]">· catalogue complet : {items.length}</span>
              </p>
              <nav aria-label="Pagination du catalogue" className="flex items-center gap-1 self-end sm:self-auto">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  data-testid="button-previous-maitrise-page"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((current) => Math.max(1, Math.min(current, pageCount) - 1))}
                  className="h-8 border-[#dce2e1] px-2.5 text-[#536b79]"
                >
                  <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Précédent
                </Button>
                <span className="min-w-[76px] px-2 text-center font-mono text-[11px] text-[#61727c]">
                  {currentPage} <span className="text-[#a3aaa8]">/</span> {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  data-testid="button-next-maitrise-page"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage((current) => Math.min(pageCount, Math.min(current, pageCount) + 1))}
                  className="h-8 border-[#dce2e1] px-2.5 text-[#536b79]"
                >
                  Suivant <ArrowRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </nav>
            </footer>
          </Card>

        </div>
        )}
        {savedMessage && (
          <div role="status" className="fixed bottom-5 right-5 z-20 flex items-center gap-2 rounded-lg border border-[#cbdcd2] bg-[#f3f8f4] px-4 py-3 text-xs font-medium text-[#315e48] shadow-lg">
            <Check className="h-4 w-4" /> {savedMessage}
            <button type="button" aria-label="Fermer le message" onClick={() => setSavedMessage("")} className="ml-2 text-[#668275]"><X className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>

      <Dialog open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="border-[#d9e0de] bg-[#fffefa] sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="font-['Outfit'] text-xl text-[#243f55]">{draft?.id === null ? "Ajouter une maîtrise d’ouvrage" : "Renommer l’organisme"}</DialogTitle>
            <DialogDescription className="text-sm leading-5 text-[#748188]">
              Le nom sera disponible dans les deux champs MO. Cette maquette ne modifie aucune donnée réelle.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveDraft} className="mt-2 space-y-5">
            <div className="space-y-2">
              <label htmlFor="mo-name" className="text-xs font-semibold text-[#455b69]">Nom de l’organisme</label>
              <Input
                id="mo-name"
                autoFocus
                required
                maxLength={255}
                value={draft?.nom ?? ""}
                onChange={(event) => setDraft((current) => current ? { ...current, nom: event.target.value } : null)}
                placeholder="Saisir le nom complet"
                dir="auto"
                className="h-10 border-[#d9e0df] focus-visible:ring-[#a87f37]/40"
              />
              <p className="text-[11px] text-[#899397]">Jusqu’à 255 caractères. Les noms en arabe sont pris en charge.</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#e8ebe7] pt-4">
              <Button type="button" variant="outline" onClick={() => setDraft(null)} className="border-[#d9e0df] text-[#526875]">Annuler</Button>
              <Button type="submit" disabled={!draft?.nom.trim()} className="bg-[#244c6d] text-white hover:bg-[#193d5b]">
                <Check className="mr-1.5 h-4 w-4" /> Enregistrer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <div className="pointer-events-none fixed bottom-4 left-4 hidden items-center gap-1.5 text-[10px] font-medium tracking-wide text-[#9aa2a1] lg:flex">
        Région Souss-Massa <ChevronDown className="h-3 w-3" />
      </div>
    </main>
  );
}
