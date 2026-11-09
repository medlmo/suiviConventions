import { useQuery } from "@tanstack/react-query";
import { api } from "@/hooks/use-auth";

export interface ServiceReadiness {
  status: "ready" | "unavailable";
}

export interface OperationsAlert {
  id: string;
  severity: "warning" | "critical";
  title: string;
  description: string;
  since: string;
}

export interface OperationsSnapshot {
  generatedAt: string;
  uptimeSeconds: number;
  scope: "instance";
  windowMinutes: 5;
  database: { status: "unknown" | "ready" | "unavailable"; checkedAt: string | null; latencyMs: number | null };
  antivirus: { status: "unknown" | "ready" | "unavailable"; checkedAt: string | null; latencyMs: number | null };
  requests: {
    total: number;
    serverErrors: number;
    rejected: number;
    slow: number;
    errorRatePercent: number;
    p50LatencyMs: number | null;
    p95LatencyMs: number | null;
    p99LatencyMs: number | null;
  };
  alerts: OperationsAlert[];
}

export function useServiceReadiness() {
  return useQuery({
    queryKey: ["system", "readiness"],
    queryFn: async (): Promise<ServiceReadiness> => {
      const response = await fetch(`${import.meta.env.BASE_URL}api/readyz`, {
        credentials: "include",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const body = await response.json().catch(() => null) as ServiceReadiness | null;
      if (response.status === 503 && body?.status === "unavailable") return body;
      if (!response.ok || (body?.status !== "ready" && body?.status !== "unavailable")) {
        throw new Error("État du service indisponible.");
      }
      return body;
    },
    staleTime: 0,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useOperationsSnapshot(enabled = true) {
  return useQuery({
    queryKey: ["admin", "operations"],
    queryFn: () => api<OperationsSnapshot>("/admin/operations"),
    enabled,
    staleTime: 10_000,
    refetchInterval: enabled ? 30_000 : false,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
