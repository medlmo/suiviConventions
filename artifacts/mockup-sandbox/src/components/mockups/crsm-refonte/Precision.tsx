import "./_group.css";
import "./_precision.css";
import Dashboard from "./_Dashboard";
import { AppLayout } from "./_Layout";

export function Precision() {
  return (
    <div className="crsm-preview crsm-precision min-h-screen">
      <AppLayout><Dashboard /></AppLayout>
    </div>
  );
}
