import { Alerte } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function AlerteBadge({ alerte, className }: { alerte: Alerte; className?: string }) {
  // Teintes claires + texte foncé : contraste lisible en petit corps, sémantique conservée.
  const colors = {
    rouge: "bg-[#fde8e6] hover:bg-[#fde8e6] text-[#9b1c1c] border-[#f3b9b3]",
    orange: "bg-[#fdecdc] hover:bg-[#fdecdc] text-[#8a3a07] border-[#f2c39c]",
    jaune: "bg-[#fbf3d2] hover:bg-[#fbf3d2] text-[#6b4e05] border-[#e8d48a]",
    vert: "bg-[#e3f2e6] hover:bg-[#e3f2e6] text-[#1d5e2c] border-[#a9d3b2]",
    gris: "bg-[#eceef1] hover:bg-[#eceef1] text-[#3d4756] border-[#cdd2d9]",
  };

  const colorClass = colors[alerte.couleur] || "bg-[#eceef1] text-[#3d4756] border-[#cdd2d9]";

  return (
    <Badge className={cn("font-medium whitespace-nowrap rounded-sm", colorClass, className)}>
      {alerte.libelle}
    </Badge>
  );
}
