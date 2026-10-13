import { useState, type ReactNode } from "react";

type Props = { href: string; name?: string; className?: string; children: ReactNode };

/** Les erreurs de quarantaine restent dans la fiche, au lieu d'ouvrir une page JSON. */
export function DocumentDownloadLink({ href, name, className, children }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const download = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(href, { credentials: "include" });
      if (!response.ok) {
        if (response.status === 401) window.dispatchEvent(new Event("conventions-session-expired"));
        const details = await response.json().catch(() => null);
        throw new Error(details?.error || "Le document n'est pas disponible au téléchargement.");
      }
      if (!["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
        .some(type => response.headers.get("Content-Type")?.startsWith(type))) {
        throw new Error("Le serveur n'a pas retourné un document valide.");
      }
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const encodedName = /filename\*=UTF-8''([^;]+)/iu.exec(disposition)?.[1];
      const filename = encodedName ? decodeURIComponent(encodedName) : name || "document";
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename.replace(/[\\/\u0000-\u001f\u007f]/gu, "_");
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Téléchargement impossible.");
    } finally { setBusy(false); }
  };
  return <div>
    <button type="button" className={className} disabled={busy} onClick={() => void download()}>
      {busy ? "Téléchargement…" : children}
    </button>
    {busy && <p role="status" className="text-xs text-muted-foreground">Téléchargement du document…</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
