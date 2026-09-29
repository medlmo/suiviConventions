import { useRef, useState } from "react";
import { api, ApiError, errorMessage } from "../hooks/use-auth";
import { Input } from "./ui/input";

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
};

type Props = {
  id: string;
  field: DocumentField;
  value?: string | null;
  persistedValue?: string | null;
  conventionId?: number;
  onChange: (value: string | null) => void;
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
  value,
  persistedValue,
  conventionId,
  onChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [uploadedName, setUploadedName] = useState("");

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
    setError("");
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

      const stored = await api<StoredDocument>("/storage/uploads/complete", {
        method: "POST",
        body: JSON.stringify({ objectPath: upload.objectPath, name: file.name }),
      });
      onChange(stored.objectPath);
      setUploadedName(stored.name);
    } catch (uploadError) {
      setError(uploadError instanceof ApiError ? errorMessage(uploadError) :
        uploadError instanceof Error ? uploadError.message : "Le téléversement du fichier a échoué.");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
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
        disabled={isUploading}
        aria-label="Choisir un fichier PDF ou Word de 10 Mo maximum"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void uploadFile(file);
        }}
      />
      <p className="text-xs text-muted-foreground">PDF ou Word (.doc, .docx) — 10 Mo maximum.</p>
      {isUploading && <p className="text-sm text-muted-foreground" role="status">Téléversement et vérification du fichier…</p>}
      {!isUploading && isStoredFile && uploadedName && (
        <p className="text-sm text-muted-foreground">Fichier chargé : {uploadedName}</p>
      )}
      {!isUploading && isPersisted && (
        <a
          className="text-sm font-medium text-primary underline underline-offset-4"
          href={`/api/conventions/${conventionId}/documents/${field}`}
        >
          Télécharger le fichier enregistré
        </a>
      )}
      {!isUploading && value && !isStoredFile && (
        <p className="text-sm text-muted-foreground">
          Une ancienne référence est conservée. Choisissez un fichier pour la remplacer.
        </p>
      )}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}