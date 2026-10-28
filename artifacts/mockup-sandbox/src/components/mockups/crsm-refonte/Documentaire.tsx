import "./_group.css";
import "./_documentaire.css";
import Dashboard from "./_Dashboard";
import { AppLayout } from "./_Layout";

export function Documentaire() {
  return (
    <div className="crsm-preview crsm-documentaire min-h-screen">
      <AppLayout><Dashboard /></AppLayout>
    </div>
  );
}
