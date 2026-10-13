import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { ApiError, errorMessage } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function FicheTechniqueButton({ conventionId }: { conventionId: number }) {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const download = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}api/conventions/${conventionId}/fiche-technique`, {
        credentials: "include", headers: { Accept: DOCX_TYPE },
      });
      if (!response.ok) {
        if (response.status === 401) window.dispatchEvent(new Event("conventions-session-expired"));
        const body = await response.json().catch(() => null);
        throw new ApiError(response.status, body?.error || "La fiche technique n'a pas pu être générée.");
      }
      if (!response.headers.get("Content-Type")?.includes(DOCX_TYPE)) {
        throw new ApiError(500, "Le serveur n'a pas renvoyé un document Word valide.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `fiche-technique-convention-${conventionId}.docx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast({ variant: "destructive", title: "Téléchargement impossible", description: errorMessage(error) });
    } finally {
      setLoading(false);
    }
  };

  return <Button type="button" variant="outline" size="sm" disabled={loading}
    onClick={() => void download()} title="Télécharger la fiche technique au format Word (.docx)"
    aria-label={`Télécharger la fiche technique Word de la convention ${conventionId}`} className="whitespace-nowrap">
    {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />}
    {loading ? "Génération…" : "Fiche technique"}
  </Button>;
}
