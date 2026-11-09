import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { ApiError, errorMessage } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export function ExportConventionsButton({ url }: { url: string }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const download = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch(url, { credentials: "include", headers: { Accept: XLSX_TYPE } });
      if (!response.ok) {
        if (response.status === 401) window.dispatchEvent(new Event("conventions-session-expired"));
        const body = await response.json().catch(() => null);
        throw new ApiError(response.status, body?.error || "L'export n'a pas pu être téléchargé.");
      }
      if (!response.headers.get("Content-Type")?.includes(XLSX_TYPE)) {
        throw new Error("Le serveur n'a pas renvoyé un fichier Excel valide.");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `conventions-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      toast({ variant: "destructive", title: "Export impossible", description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  };
  return <Button type="button" variant="outline" disabled={loading} onClick={() => void download()}>
    {loading ? <Loader2 className="mr-2 w-4 h-4 animate-spin" /> : <Download className="mr-2 w-4 h-4" />}
    {loading ? "Génération…" : "Export Excel (.xlsx)"}
  </Button>;
}
