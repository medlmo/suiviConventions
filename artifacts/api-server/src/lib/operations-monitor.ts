import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

const WINDOW_MS = 5 * 60_000;
const BUCKET_MS = 60_000;
const BUCKETS = [50, 100, 250, 500, 1_000, 2_000, 5_000, 10_000, 30_000, 60_000, 120_000];

type DependencyStatus = "unknown" | "ready" | "unavailable";
interface DependencyHealth {
  status: DependencyStatus;
  checkedAt: string | null;
  latencyMs: number | null;
}
interface RequestBucket {
  startedAt: number;
  total: number;
  serverErrors: number;
  rejected: number;
  slow: number;
  latencies: number[];
}
interface AlertCandidate {
  code: string;
  severity: "warning" | "critical";
  title: string;
  description: string;
  signal: string;
}

const buckets = new Map<number, RequestBucket>();
const activeAlerts = new Map<string, { since: string; candidate: AlertCandidate }>();
let databaseHealth: DependencyHealth = { status: "unknown", checkedAt: null, latencyMs: null };
let antivirusHealth: DependencyHealth = { status: "unknown", checkedAt: null, latencyMs: null };
let databaseProbe: Promise<DependencyHealth> | undefined;

function emptyBucket(startedAt: number): RequestBucket {
  return {
    startedAt, total: 0, serverErrors: 0, rejected: 0, slow: 0,
    latencies: Array(BUCKETS.length + 1).fill(0) as number[],
  };
}

function pruneBuckets(now: number): void {
  for (const startedAt of buckets.keys()) {
    if (startedAt < now - WINDOW_MS - BUCKET_MS) buckets.delete(startedAt);
  }
}

/** Store bounded, aggregate-only request data; never retain user IDs or URLs. */
export function recordHttpRequest(input: {
  route: string;
  status: number;
  durationMs: number;
}): void {
  if (["/healthz", "/readyz", "/healthz/antivirus", "/admin/operations"].includes(input.route)) return;
  const now = Date.now();
  const startedAt = Math.floor(now / BUCKET_MS) * BUCKET_MS;
  const bucket = buckets.get(startedAt) ?? emptyBucket(startedAt);
  buckets.set(startedAt, bucket);
  bucket.total++;
  if (input.status >= 500) bucket.serverErrors++;
  else if (input.status >= 400) bucket.rejected++;
  if (input.durationMs >= 2_000) bucket.slow++;
  const index = BUCKETS.findIndex(bound => input.durationMs <= bound);
  bucket.latencies[index < 0 ? BUCKETS.length : index]++;
  pruneBuckets(now);
  refreshServiceAlerts(now);
}

export function recordAntivirusReadiness(ready: boolean, latencyMs: number): void {
  antivirusHealth = {
    status: ready ? "ready" : "unavailable",
    checkedAt: new Date().toISOString(),
    latencyMs: Math.round(latencyMs),
  };
  refreshServiceAlerts(Date.now());
}

/** Liveness remains separate; this short cached probe checks DB reachability. */
export async function checkDatabaseReadiness(): Promise<DependencyHealth> {
  const now = Date.now();
  if (databaseHealth.checkedAt &&
    now - new Date(databaseHealth.checkedAt).getTime() < 5_000) return databaseHealth;
  if (databaseProbe) return databaseProbe;

  const started = performance.now();
  databaseProbe = (async () => {
    try {
      await db.execute(sql`SELECT 1`);
      databaseHealth = {
        status: "ready",
        checkedAt: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - started),
      };
    } catch {
      databaseHealth = {
        status: "unavailable",
        checkedAt: new Date().toISOString(),
        latencyMs: Math.round(performance.now() - started),
      };
    }
    refreshServiceAlerts(Date.now());
    return databaseHealth;
  })();
  try {
    return await databaseProbe;
  } finally {
    databaseProbe = undefined;
  }
}

function percentile(histogram: number[], total: number, fraction: number): number | null {
  if (!total) return null;
  const target = Math.ceil(total * fraction);
  let observed = 0;
  for (let index = 0; index < histogram.length; index++) {
    observed += histogram[index]!;
    if (observed >= target) return BUCKETS[index] ?? BUCKETS[BUCKETS.length - 1]!;
  }
  return BUCKETS[BUCKETS.length - 1]!;
}

function refreshAlerts(candidates: AlertCandidate[], now: string) {
  const current = new Set(candidates.map(alert => alert.code));
  for (const [code] of activeAlerts) {
    if (!current.has(code)) {
      logger.info({ event: "operations.alert.resolved", alertCode: code }, "Operational alert resolved");
      activeAlerts.delete(code);
    }
  }
  for (const candidate of candidates) {
    if (!activeAlerts.has(candidate.code)) {
      activeAlerts.set(candidate.code, { since: now, candidate });
      const fields = {
        event: "operations.alert.triggered",
        alertCode: candidate.code,
        severity: candidate.severity,
        signal: candidate.signal,
      };
      if (candidate.severity === "critical") logger.error(fields, candidate.title);
      else logger.warn(fields, candidate.title);
    } else {
      activeAlerts.get(candidate.code)!.candidate = candidate;
    }
  }
  return [...activeAlerts.entries()].map(([code, active]) => ({
    id: code,
    severity: active.candidate.severity,
    title: active.candidate.title,
    description: active.candidate.description,
    since: active.since,
  }));
}

function aggregateRequests(now: number) {
  pruneBuckets(now);
  const windowBuckets = [...buckets.values()].filter(bucket => bucket.startedAt >= now - WINDOW_MS);
  const requests = windowBuckets.reduce((total, bucket) => total + bucket.total, 0);
  const serverErrors = windowBuckets.reduce((total, bucket) => total + bucket.serverErrors, 0);
  const rejected = windowBuckets.reduce((total, bucket) => total + bucket.rejected, 0);
  const slow = windowBuckets.reduce((total, bucket) => total + bucket.slow, 0);
  const histogram = Array(BUCKETS.length + 1).fill(0) as number[];
  for (const bucket of windowBuckets) {
    bucket.latencies.forEach((count, index) => { histogram[index] += count; });
  }
  const p50LatencyMs = percentile(histogram, requests, 0.50);
  const p95LatencyMs = percentile(histogram, requests, 0.95);
  const p99LatencyMs = percentile(histogram, requests, 0.99);
  const errorRatePercent = requests ? Math.round(serverErrors / requests * 10_000) / 100 : 0;
  return {
    requests, serverErrors, rejected, slow, errorRatePercent,
    p50LatencyMs, p95LatencyMs, p99LatencyMs,
  };
}

function currentAlertCandidates(metrics: ReturnType<typeof aggregateRequests>): AlertCandidate[] {
  const candidates: AlertCandidate[] = [];
  if (databaseHealth.status === "unavailable") {
    candidates.push({
      code: "database_unavailable", severity: "critical",
      title: "Base de données indisponible",
      description: "Le serveur n’arrive pas à joindre la base de données.",
      signal: "readiness probe",
    });
  }
  if (antivirusHealth.status === "unavailable") {
    candidates.push({
      code: "antivirus_unavailable", severity: "critical",
      title: "Analyse antivirus indisponible",
      description: "Les nouveaux documents ne peuvent pas être validés tant que l’analyse antivirus est indisponible.",
      signal: "antivirus readiness",
    });
  }
  if (metrics.requests >= 20 && metrics.errorRatePercent >= 5) {
    candidates.push({
      code: "http_error_rate", severity: "critical",
      title: "Taux élevé d’erreurs serveur",
      description: `${metrics.serverErrors} réponses serveur en erreur sur ${metrics.requests} requêtes pendant les cinq dernières minutes.`,
      signal: `${metrics.errorRatePercent}%`,
    });
  }
  if (metrics.requests >= 20 && metrics.p95LatencyMs !== null && metrics.p95LatencyMs >= 2_000) {
    candidates.push({
      code: "http_latency_p95", severity: "warning",
      title: "Temps de réponse dégradé",
      description: `Le 95e percentile dépasse deux secondes sur les cinq dernières minutes.`,
      signal: `${metrics.p95LatencyMs} ms`,
    });
  }
  return candidates;
}

function refreshServiceAlerts(now: number): void {
  refreshAlerts(currentAlertCandidates(aggregateRequests(now)), new Date(now).toISOString());
}

export function getOperationsSnapshot(antivirus: DependencyHealth) {
  const now = Date.now();
  antivirusHealth = antivirus;
  const metrics = aggregateRequests(now);
  const generatedAt = new Date(now).toISOString();
  return {
    generatedAt,
    uptimeSeconds: Math.floor(process.uptime()),
    scope: "instance" as const,
    windowMinutes: 5 as const,
    database: databaseHealth,
    antivirus: antivirusHealth,
    requests: {
      total: metrics.requests,
      serverErrors: metrics.serverErrors,
      rejected: metrics.rejected,
      slow: metrics.slow,
      errorRatePercent: metrics.errorRatePercent,
      p50LatencyMs: metrics.p50LatencyMs,
      p95LatencyMs: metrics.p95LatencyMs,
      p99LatencyMs: metrics.p99LatencyMs,
    },
    alerts: refreshAlerts(currentAlertCandidates(metrics), generatedAt),
  };
}
