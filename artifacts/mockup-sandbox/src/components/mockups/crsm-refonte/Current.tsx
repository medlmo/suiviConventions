import "./_group.css";
import Dashboard from "./_Dashboard";
import { AppLayout } from "./_Layout";

export function Current() {
  return (
    <div className="crsm-preview min-h-screen">
      <AppLayout><Dashboard /></AppLayout>
    </div>
  );
}
