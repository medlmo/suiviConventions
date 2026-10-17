import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import "./_group.css";

const demoMaitrises = [
  "Agence régionale d’exécution des projets",
  "Agence urbaine d’Agadir",
  "Centre régional d’investissement Souss-Massa",
  "Commune d’Agadir",
  "Commune d’Aït Melloul",
  "Commune de Taroudant",
  "Commune de Tiznit",
  "Direction régionale de l’Équipement",
  "Office national de l’électricité et de l’eau potable",
  "Université Ibn Zohr",
  "Agence du bassin hydraulique du Souss-Massa",
  "Société Al Omrane Souss-Massa",
  "Commune de Tata",
  "Commune de Biougra",
];

export function Current() {
  return (
    <div className="min-h-screen bg-background p-5 text-foreground sm:p-6">
      <div className="mx-auto max-w-md">
        <p className="mb-3 text-xs text-muted-foreground">
          Échantillon de démonstration — disposition actuelle
        </p>
        <Card className="overflow-hidden shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 p-5">
            <div>
              <h2 className="text-lg font-semibold">Maîtrises d’ouvrage</h2>
              <p className="text-sm text-muted-foreground">
                Liste commune aux deux champs MO
              </p>
            </div>
            <Button size="sm" variant="outline" type="button">
              <Plus className="mr-1 h-4 w-4" /> Ajouter
            </Button>
          </div>
          <CardContent className="p-4 sm:p-5">
            <div className="divide-y">
              {demoMaitrises.map((nom) => (
                <div key={nom} className="flex items-center gap-3 py-2.5">
                  <span className="flex-1 text-sm" dir="auto">
                    {nom}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    type="button"
                    aria-label={`Renommer ${nom}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
