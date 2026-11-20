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
  documentType?: "convention" | "avenant" | "pv";
};

type UploadContext = {
  name: string;
  datePvComite?: string;
  documentType?: "convention" | "avenant" | "pv";
};
type PendingCompletion = UploadContext & { uploadId: string };
type CompletionResult = StoredDocument | { status: "pending"; uploadId: string; expiresAt: string };
type UploadStatus = {
  status: "pending" | "scanning" | "ready" | "rejected";
  expiresAt: string;
  document?: Omit<StoredDocument, "datePvComite" | "documentType"> & { generation?: string };
};

type Props = {
  id: string;
  field: DocumentField;
  documentType?: "convention" | "avenant" | "pv";
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

function savePendingUpload(key: string, pending: PendingCompletion): void {
  try { if (key) window.localStorage.setItem(key, JSON.stringify(pending)); } catch { /* Le suivi reste actif dans cette page. */ }
}

function clearPendingUpload(key: string): void {
  try { if (key) window.localStorage.removeItem(key); } catch { /* Le statut serveur reste la source de vérité. */ }
}

function mimePourNom(nom: string): string | null {
  return MIME_BY_EXTENSION[nom.slice(nom.lastIndexOf(".")).toLowerCase()] ?? null;
}

export function DocumentUploadField({
  id,
  field,
  documentType,
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
  const [retryCompletion, setRetryCompletion] = useState<(UploadContext & { objectPath: string }) | null>(null);
  const [validationStatus, setValidationStatus] = useState<"pending" | "scanning">("pending");
  const mounted = useRef(true);
  const uploadActive = useRef(false);
  const onChangeRef = useRef(onChange);
  const onUploadedRef = useRef(onUploaded);
  const pendingStorageKey = typeof window === "undefined" ? "" :
    `conventions:pending-document:${window.location.pathname}:${field}`;
  useEffect(() => {
    onChangeRef.current = onChange;
    onUploadedRef.current = onUploaded;
  }, [onChange, onUploaded]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (uploadActive.current) onUploadingChange?.(false);
    };
  }, []);
  useEffect(() => {
    if (!pendingStorageKey) return;
    try {
      const raw = window.localStorage.getItem(pendingStorageKey);
      if (!raw) return;
      const pending = JSON.parse(raw) as PendingCompletion;
      if (typeof pending.uploadId === "string" && typeof pending.name === "string") {
        setPendingCompletion(pending);
      } else {
        clearPendingUpload(pendingStorageKey);
      }
    } catch {
      clearPendingUpload(pendingStorageKey);
    }
  }, [pendingStorageKey]);

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
        credentials: "same-origin",
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        throw new Error(failure?.error ?? "Le téléversement du fichier a échoué.");
      }

      const completion = {
        objectPath: upload.objectPath,
        name: file.name,
        ...(field === "pv" ? { datePvComite } : {}),
        ...(documentType ? { documentType } : {}),
      };
      if (mounted.current) setRetryCompletion(completion);
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

  const accepterDocument = (stored: StoredDocument, context: UploadContext) => {
    if (!mounted.current) return;
    clearPendingUpload(pendingStorageKey);
    setPendingCompletion(null);
    setError("");
    onChangeRef.current(stored.objectPath);
    onUploadedRef.current?.({
      ...stored,
      datePvComite: context.datePvComite,
      documentType: context.documentType,
    });
    setUploadedName(stored.name);
  };

  const finaliserTeleversement = async (completion: UploadContext & { objectPath: string }) => {
    try {
      const result = await api<CompletionResult>("/storage/uploads/complete", {
        method: "POST",
        body: JSON.stringify({ objectPath: completion.objectPath, name: completion.name }),
      });
      if (!("objectPath" in result)) {
        const pending: PendingCompletion = {
          uploadId: result.uploadId,
          name: completion.name,
          ...(completion.datePvComite ? { datePvComite: completion.datePvComite } : {}),
          ...(completion.documentType ? { documentType: completion.documentType } : {}),
        };
        savePendingUpload(pendingStorageKey, pending);
        if (mounted.current) {
          setRetryCompletion(null);
          setPendingCompletion(pending);
          setValidationStatus("pending");
          setError("");
        }
        return;
      }
      setRetryCompletion(null);
      accepterDocument(result, completion);
    } catch (cause) {
      if (!mounted.current) return;
      if (cause instanceof ApiError && cause.code === "DOCUMENT_CHECK_UNAVAILABLE") {
        setError("Le contrôle de structure est temporairement indisponible. Réessayez la validation du document.");
        return;
      }
      setRetryCompletion(null);
      setPendingCompletion(null);
      setError(errorMessage(cause));
    }
  };

  const retryFinalisation = async () => {
    if (!retryCompletion || uploadActive.current) return;
    setIsUploading(true);
    uploadActive.current = true;
    onUploadingChange?.(true);
    setError("");
    try {
      await finaliserTeleversement(retryCompletion);
    } finally {
      uploadActive.current = false;
      if (mounted.current) {
        setIsUploading(false);
        onUploadingChange?.(false);
      }
    }
  };

  useEffect(() => {
    if (!pendingCompletion) return;
    let active = true;
    let checking = false;
    const verifier = async () => {
      if (checking) return;
      checking = true;
      try {
        const result = await api<UploadStatus>(`/storage/uploads/${encodeURIComponent(pendingCompletion.uploadId)}`);
        if (!active) return;
        if (result.status === "ready" && result.document) {
          accepterDocument(result.document, pendingCompletion);
        } else if (result.status === "rejected") {
          clearPendingUpload(pendingStorageKey);
          setPendingCompletion(null);
          setError("Le fichier n’a pas passé les contrôles de structure. Il n’est pas disponible.");
        } else {
          setValidationStatus(result.status === "scanning" ? "scanning" : "pending");
        }
      } catch (cause) {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 404) {
          clearPendingUpload(pendingStorageKey);
          setPendingCompletion(null);
          setError("Le délai de validation du dépôt a expiré. Sélectionnez à nouveau le fichier.");
        } else {
          setError("La vérification est temporairement indisponible; le fichier reste en attente.");
        }
      } finally {
        checking = false;
      }
    };
    void verifier();
    const timer = window.setInterval(() => void verifier(), 5_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [pendingCompletion?.uploadId, pendingStorageKey]);

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
          ? "Finalisation et contrôle de structure…"
          : "Téléversement et contrôle de la structure du document…"}
      </p>}
      {pendingCompletion && <p className="text-sm text-amber-700" role="status">
        {validationStatus === "scanning"
          ? "Contrôle de structure en cours pour un dépôt déjà engagé."
          : "Dépôt antérieur en attente de contrôle de structure; durée maximale restante : 24 h."}
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
      {retryCompletion && !isUploading && (
        <Button type="button" variant="outline" size="sm" onClick={() => void retryFinalisation()}>
          Réessayer la validation du document
        </Button>
      )}
    </div>
  );
}