/**
 * Operator console — live billing-gateway data (real-data seam).
 *
 * Self-contained same-origin calls to the billing gateway `/v1/*` routes,
 * mirroring the production billing views (CreditsView / UsageView / KeysView)
 * which `fetch("/v1/...", { credentials: "include" })`. Deliberately does NOT
 * touch TokagentClient / client.ts — the operator components import these
 * helpers/hooks directly and fall back to mock data when the gateway is
 * unavailable or the caller is unauthenticated.
 *
 * Wired seams (have a real backend today):
 *   - ClaudeVault balance      → GET /v1/credits/me
 *   - Usage & spend            → GET /v1/usage/summary
 *   - API keys (list/mint/revoke) → /v1/keys
 * The A2A network graph + service directory have no backend yet and stay mock.
 */
import { useCallback, useEffect, useState } from "react";

// ── low-level fetch ─────────────────────────────────────────────────────────
async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

/** Format an atto-PTON (1e18) decimal string as "1,284.07" (2 dp, grouped). */
export function formatAttoPtonString(atto: string): string {
  try {
    const v = BigInt(atto);
    const whole = v / 10n ** 18n;
    const frac = (v - whole * 10n ** 18n) / 10n ** 16n; // 0–99
    return `${whole.toLocaleString("en-US")}.${frac.toString().padStart(2, "0")}`;
  } catch {
    return atto;
  }
}

function shortDate(iso: string | null): string {
  if (!iso) return "never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ── credits ─────────────────────────────────────────────────────────────────
export interface CreditsResponse {
  balance: string;
  reserved: string;
  accrued: string;
  backing?: string;
  chainId?: number;
}

export function fetchCredits(chainId?: number): Promise<CreditsResponse> {
  const q = chainId ? `?chainId=${chainId}` : "";
  return getJson<CreditsResponse>(`/v1/credits/me${q}`);
}

// ── usage ───────────────────────────────────────────────────────────────────
export interface UsageModelRow {
  model: string;
  calls: number;
  costPton: string;
}
export interface UsageDayRow {
  day: string;
  calls: number;
}
export interface UsageSummaryResponse {
  totalCostUsd: string;
  totalCostPton: string;
  callCount: number;
  byModel?: UsageModelRow[];
  byDay?: UsageDayRow[];
}

export function fetchUsageSummary(params?: {
  since?: string;
  until?: string;
}): Promise<UsageSummaryResponse> {
  const qs = new URLSearchParams();
  if (params?.since) qs.set("since", params.since);
  if (params?.until) qs.set("until", params.until);
  const q = qs.toString() ? `?${qs.toString()}` : "";
  return getJson<UsageSummaryResponse>(`/v1/usage/summary${q}`);
}

// ── api keys ────────────────────────────────────────────────────────────────
export interface ApiKeyRowResponse {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export async function fetchApiKeys(): Promise<ApiKeyRowResponse[]> {
  const { keys } = await getJson<{ keys: ApiKeyRowResponse[] }>("/v1/keys");
  return keys;
}

export function mintApiKey(
  name: string,
  chainId?: number,
): Promise<{ id: string; key: string; name: string; createdAt: string }> {
  return getJson("/v1/keys", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, ...(chainId ? { chainId } : {}) }),
  });
}

export async function revokeApiKey(id: string): Promise<void> {
  await getJson<unknown>(`/v1/keys/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

/** Map a real key row to the operator `ApiKeyEntry` display shape. */
export function apiKeyRowToEntry(row: ApiKeyRowResponse): {
  id: string;
  name: string;
  val: string;
  meta: string;
  live: boolean;
} {
  const meta = `created ${shortDate(row.createdAt)} · last used ${shortDate(
    row.lastUsedAt,
  )}`;
  return {
    id: row.id,
    name: row.name,
    // The list endpoint never returns the secret (shown once on mint), so we
    // render a stable masked label derived from the key id.
    val: `sk-ai-••••${row.id.slice(-4)}`,
    meta,
    live: row.revokedAt === null,
  };
}

// ── hooks ───────────────────────────────────────────────────────────────────
/** Fetch once on mount; `live` is true only when real data loaded. */
export function useLive<T>(fetcher: () => Promise<T>): {
  data: T | null;
  live: boolean;
  reload: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [nonce, setNonce] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` is a manual refetch trigger (reload()); `fetcher` is expected stable (useCallback).
  useEffect(() => {
    let cancelled = false;
    fetcher()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fetcher, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, live: data !== null, reload };
}
