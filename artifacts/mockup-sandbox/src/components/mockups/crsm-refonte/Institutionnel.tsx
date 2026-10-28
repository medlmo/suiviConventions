import "./_group.css";
import "./_institutionnel.css";
import Dashboard from "./_Dashboard";
import { AppLayout } from "./_Layout";

export function Institutionnel() {
  return (
    <div className="crsm-preview crsm-institutionnel min-h-screen">
      <AppLayout><Dashboard /></AppLayout>
    </div>
  );
}
