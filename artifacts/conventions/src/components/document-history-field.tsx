import { useState } from "react";
import type { ConventionDocument, ConventionDocumentInput } from "@workspace/api-client-react";
import { DocumentUploadField } from "./document-upload-field";
import { DocumentDownloadLink } from "./document-download-link";
import { Button } from "./ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "./ui/alert-dialog";

type Props = {
  conventionId?: number;
  category: "convention" | "pv";
  documents: ConventionDocument[];
  pending: (ConventionDocumentInput & { name: string })[];
  editable: boolean;
  onAdd: (document: ConventionDocumentInput & { name: string }) => void;
  onRemove: (objectPath: string) => void;
  removedPaths?: string[];
  onRemoveSaved?: (objectPath: string) => void;
  onUploadingChange: (uploading: boolean) => void;
};

const libelles = { convention: "Convention", avenant: "Avenant", pv: "PV de comité" };

export function DocumentHistoryField({
  conventionId, category, documents, pending, editable, onAdd, onRemove, onUploadingChange,
  removedPaths = [], onRemoveSaved,
}: Props) {
  const correspond = (type: string) => category === "pv" ? type === "pv" : type !== "pv";
  const enregistres = documents.filter(document => correspond(document.type));
  const brouillons = pending.filter(document => correspond(document.type));
  const [type, setType] = useState<"convention" | "avenant">(
    enregistres.some(document => document.type === "convention") ? "avenant" : "convention",
  );
  const [uploading, setUploading] = useState(false);
  const [documentARetirer, setDocumentARetirer] = useState<ConventionDocument | null>(null);

  return <section className="space-y-3" aria-label={category === "pv" ? "Historique des PV des comités" : "Convention et avenants"}>
    <h3 className="text-sm font-medium">{category === "pv" ? "PV des comités — historique" : "Convention et avenants"}</h3>
    {!enregistres.length && !brouillons.length && <p className="text-xs text-muted-foreground">Aucun document enregistré.</p>}
    <ul className="space-y-2">
      {[...enregistres].reverse().map(document => <li key={`${document.type}-${document.objectPath}`} className="rounded-md border p-3 text-sm space-y-1">
        <div className="font-medium">{libelles[document.type]}</div>
        {conventionId != null && document.objectPath.startsWith("/objects/documents/") ? (
          <DocumentDownloadLink name={document.name} className="text-primary underline underline-offset-4 break-all"
            href={`${import.meta.env.BASE_URL}api/conventions/${conventionId}/documents/${category === "pv" ? "pv" : "documentConvention"}?objectPath=${encodeURIComponent(document.objectPath)}`}>
            {document.name} — Télécharger
          </DocumentDownloadLink>
        ) : <p className="break-all text-muted-foreground">Référence historique : {document.objectPath}</p>}
        <p className="text-xs text-muted-foreground">{document.addedAt
          ? `Ajouté le ${new Date(document.addedAt).toLocaleString("fr-FR")}`
          : "Document antérieur — date d’ajout non renseignée"}</p>
        {editable && onRemoveSaved && (
          removedPaths.includes(document.objectPath) ? <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-destructive">Sera retiré à l’enregistrement</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => onRemoveSaved(document.objectPath)}>Annuler le retrait</Button>
          </div> : <Button type="button" size="sm" variant="ghost" className="text-destructive"
            onClick={() => setDocumentARetirer(document)}>Retirer ce fichier</Button>
        )}
      </li>)}
      {brouillons.map(document => <li key={document.objectPath} className="rounded-md border border-dashed p-3 text-sm">
        <p className="font-medium">{libelles[document.type]} : {document.name}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">À enregistrer avec la fiche</span>
          {editable && <button type="button" className="text-xs underline" onClick={() => onRemove(document.objectPath)}>Retirer cet ajout</button>}
        </div>
      </li>)}
    </ul>
    {editable && <div className="space-y-2">
      {category === "convention" && <label className="flex items-center gap-2 text-sm">
        Document à ajouter
        <select className="h-9 rounded-md border bg-background px-2" value={type} disabled={uploading}
          onChange={event => setType(event.target.value as "convention" | "avenant")}>
          <option value="convention">Convention</option><option value="avenant">Avenant</option>
        </select>
      </label>}
      <DocumentUploadField id={`ajout-document-${category}`} field={category === "pv" ? "pv" : "documentConvention"}
        value={null} onChange={() => {}}
        onUploaded={document => onAdd({ objectPath: document.objectPath, name: document.name, type: category === "pv" ? "pv" : type })}
        onUploadingChange={active => { setUploading(active); onUploadingChange(active); }} />
      <p className="text-xs text-muted-foreground">Chaque ajout conserve tous les documents précédents. {conventionId != null
        ? "Cliquez sur « Enregistrer » pour le conserver dans la fiche."
        : "Les fichiers seront enregistrés à la création de la convention."}</p>
    </div>}
    <AlertDialog open={!!documentARetirer} onOpenChange={open => { if (!open) setDocumentARetirer(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Retirer ce fichier de la fiche ?</AlertDialogTitle>
          <AlertDialogDescription>
            « {documentARetirer?.name} » sera retiré de la liste des documents après avoir cliqué sur « Enregistrer ».
            Le fichier ne sera pas supprimé physiquement du stockage. Vous pouvez annuler ce retrait avant l’enregistrement.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={() => {
            if (documentARetirer) onRemoveSaved?.(documentARetirer.objectPath);
            setDocumentARetirer(null);
          }}>Confirmer le retrait</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}
