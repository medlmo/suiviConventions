import { useEffect, useRef, useState } from "react";
import { api, ApiError, errorMessage } from "../hooks/use-auth";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { DocumentDownloadLink } from "./document-download-link";

type DocumentField = "documentConvention" | "pv";

type UploadUrl = {
  uploadURL: string;
  objectPath: string;
};

type StoredDocument = {
  objectPath: string;
  name: string;
  contentType: string;
  size: number;
  datePvComite?: string;
};

type PendingCompletion = { objectPath: string; name: string; datePvComite?: string };

type Props = {
  id: string;
  field: DocumentField;
  datePvComite?: string;
  value?: string | null;
  persistedValue?: string | null;
  conventionId?: number;
  onChange: (value: string | null) => void;
  onUploaded?: (document: StoredDocument) => void;
  onUploadingChange?: (uploading: boolean) => void;
};

const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function mimePourNom(nom: string): string | null {
  return MIME_BY_EXTENSION[nom.slice(nom.lastIndexOf(".")).toLowerCase()] ?? null;
}

export function DocumentUploadField({
  id,
  field,
  datePvComite,
  value,
  persistedValue,
  conventionId,
  onChange,
  onUploaded,
  onUploadingChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadedName, setUploadedName] = useState("");
  const [pendingCompletion, setPendingCompletion] = useState<PendingCompletion | null>(null);
  const mounted = useRef(true);
  const uploadActive = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (uploadActive.current) onUploadingChange?.(false);
    };
  }, []);

  const uploadFile = async (file: File) => {
    const contentType = mimePourNom(file.name);
    if (!contentType) {
      setError("Formats acceptés : PDF ou Word (.doc, .docx).");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    if (file.size < 1 || file.size > MAX_SIZE_BYTES) {
      setError("Le fichier doit peser au maximum 10 Mo.");
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setIsUploading(true);
    uploadActive.current = true;
    onUploadingChange?.(true);
    setError("");
    setPendingCompletion(null);
    try {
      const upload = await api<UploadUrl>("/storage/uploads/request-url", {
        method: "POST",
        body: JSON.stringify({ name: file.name, size: file.size, contentType }),
      });
      const response = await fetch(upload.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": contentType },
        body: file,
        credentials: "omit",
      });
      if (!response.ok) {
        throw new Error("Le téléversement du fichier a échoué.");
      }

      const completion = {
        objectPath: upload.objectPath,
        name: file.name,
        ...(field === "pv" ? { datePvComite } : {}),
      };
      if (mounted.current) setPendingCompletion(completion);
      await finaliserTeleversement(completion);
    } catch (uploadError) {
      if (mounted.current) setError(uploadError instanceof ApiError ? errorMessage(uploadError) :
        uploadError instanceof Error ? uploadError.message : "Le téléversement du fichier a échoué.");
    } finally {
      uploadActive.current = false;
      if (mounted.current) {
        setIsUploading(false);
        onUploadingChange?.(false);
      }
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const finaliserTeleversement = async (completion: PendingCompletion) => {
    try {
      const stored = await api<StoredDocument>("/storage/uploads/complete", {
        method: "POST",
        body: JSON.stringify({ objectPath: completion.objectPath, name: completion.name }),
      });
      if (mounted.current) {
        setPendingCompletion(null);
        setError("");
        onChange(stored.objectPath);
        onUploaded?.({ ...stored, datePvComite: completion.datePvComite });
        setUploadedName(stored.name);
      }
    } catch (cause) {
      if (!mounted.current) return;
      if (cause instanceof ApiError &&
        (cause.code === "ANALYSIS_UNAVAILABLE" || cause.code === "ANALYSIS_BUSY")) {
        setPendingCompletion(completion);
        setError(cause.code === "ANALYSIS_UNAVAILABLE"
          ? "L’antivirus est temporairement indisponible. Votre fichier est conservé ; réessayez l’analyse sans le téléverser à nouveau."
          : "Une autre analyse est en cours. Votre fichier est conservé ; réessayez dans quelques instants.");
        return;
      }
      setPendingCompletion(null);
      setError(errorMessage(cause));
    }
  };

  const retryFinalisation = async () => {
    if (!pendingCompletion || uploadActive.current) return;
    setIsUploading(true);
    uploadActive.current = true;
    onUploadingChange?.(true);
    setError("");
    try {
      await finaliserTeleversement(pendingCompletion);
    } finally {
      uploadActive.current = false;
      if (mounted.current) {
        setIsUploading(false);
        onUploadingChange?.(false);
      }
    }
  };

  const isStoredFile = Boolean(value?.startsWith("/objects/documents/"));
  const isPersisted = isStoredFile && value === persistedValue && conventionId != null;

  return (
    <div className="space-y-2">
      <Input
        ref={inputRef}
        id={id}
        type="file"
        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        disabled={isUploading || Boolean(pendingCompletion)}
        aria-label="Choisir un fichier PDF ou Word de 10 Mo maximum"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void uploadFile(file);
        }}
      />
      <p className="text-xs text-muted-foreground">PDF ou Word (.doc, .docx) — 10 Mo maximum.</p>
      {isUploading && <p className="text-sm text-muted-foreground" role="status">
        {pendingCompletion
          ? "Finalisation et analyse antimalware… Le fichier reste en quarantaine jusqu’à validation."
          : "Téléversement, contrôle du document et analyse antimalware… Le fichier reste en quarantaine jusqu’à validation."}
      </p>}
      {!isUploading && isStoredFile && uploadedName && (
        <p className="text-sm text-muted-foreground">Fichier chargé : {uploadedName}</p>
      )}
      {!isUploading && isPersisted && (
        <DocumentDownloadLink
          className="text-sm font-medium text-primary underline underline-offset-4"
          href={`${import.meta.env.BASE_URL}api/conventions/${conventionId}/documents/${field}`}
        >
          Télécharger le fichier enregistré
        </DocumentDownloadLink>
      )}
      {!isUploading && value && !isStoredFile && (
        <p className="text-sm text-muted-foreground">
          Une ancienne référence est conservée. Choisissez un fichier pour la remplacer.
        </p>
      )}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      {pendingCompletion && !isUploading && (
        <Button type="button" variant="outline" size="sm" onClick={() => void retryFinalisation()}>
          Réessayer l’analyse
        </Button>
      )}
    </div>
  );
}