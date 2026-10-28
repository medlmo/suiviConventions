import { Alerte } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function AlerteBadge({ alerte, className }: { alerte: Alerte; className?: string }) {
  const colors = {
    rouge: "bg-[#dc2626] hover:bg-[#dc2626]/90 text-white border-transparent",
    orange: "bg-[#ea580c] hover:bg-[#ea580c]/90 text-white border-transparent",
    jaune: "bg-[#eab308] hover:bg-[#eab308]/90 text-white border-transparent",
    vert: "bg-[#16a34a] hover:bg-[#16a34a]/90 text-white border-transparent",
    gris: "bg-[#64748b] hover:bg-[#64748b]/90 text-white border-transparent",
  };

  const colorClass = colors[alerte.couleur] || "bg-gray-500 text-white";

  return (
    <Badge className={cn("font-medium whitespace-nowrap shadow-sm", colorClass, className)}>
      {alerte.libelle}
    </Badge>
  );
}
