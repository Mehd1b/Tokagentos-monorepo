/**
 * Operator x402 — usage & spend analytics: 30-day spend bar chart + spend-by-model
 * breakdown, plus a recent-calls table and a per-API-key rollup. Ported from
 * handoff_app/prototype/components/X402Lower.jsx (UsageAnalytics) and extended
 * with the /v1/usage/calls + /v1/usage/keys seams.
 */
import { useCallback, useMemo } from "react";
import {
  fetchUsageCalls,
  fetchUsageKeys,
  fetchUsageSummary,
  formatAttoPtonString,
  type UsageCall,
  type UsageKeyRow,
  useLive,
} from "../client-billing";
import {
  makeUsageSeries,
  SPEND_MODELS,
  type SpendModel,
  USAGE_TOTALS,
  type UsageTotals,
} from "../mock";

/** Bar-fill gradients applied to live spend-by-model rows, by position. */
const MODEL_COLORS = [
  "linear-gradient(90deg, #f0b90b, #f3ba2f)",
  "linear-gradient(90deg, #d8a000, #f0b90b)",
  "linear-gradient(90deg, #4dd2a1, #03a66d)",
  "linear-gradient(90deg, #60a5fa, #3b82f6)",
];

/** Grid template for the recent-calls table (head + body share it). */
const CALLS_COLS = "0.7fr 1.3fr 0.9fr auto 0.7fr";
/** Grid template for the by-API-key table. */
const KEYS_COLS = "1.5fr 0.6fr 1fr auto";

/** Compact relative time, e.g. "2m", "3h", "5d" — self-contained (no dayjs). */
function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/** Group thousands for raw token counts, e.g. 12840 → "12,840". */
function fmtTokens(n: number): string {
  return (Number.isFinite(n) ? n : 0).toLocaleString("en-US");
}

/** Map a call status to a chip tone — ok / info / mute. */
function statusChip(status: string): "ok" | "info" | "mute" {
  const s = status.toLowerCase();
  if (s === "ok" || s === "success" || s === "200" || s === "settled")
    return "ok";
  if (s === "pending" || s === "reserved" || s === "processing") return "info";
  return "mute";
}

/** Deterministic, empty-safe mock for the recent-calls table. */
const MOCK_CALLS: UsageCall[] = [
  {
    id: "c-1",
    ts: new Date(Date.now() - 2 * 60_000).toISOString(),
    model: "claude-sonnet-4-5",
    inputTokens: 1840,
    outputTokens: 612,
    costUsd: 0.021,
    costPton: "41600000000000000",
    status: "ok",
    apiKeyId: "k-prod",
  },
  {
    id: "c-2",
    ts: new Date(Date.now() - 11 * 60_000).toISOString(),
    model: "claude-opus-4-7",
    inputTokens: 5120,
    outputTokens: 2304,
    costUsd: 0.144,
    costPton: "285000000000000000",
    status: "ok",
    apiKeyId: "k-research",
  },
  {
    id: "c-3",
    ts: new Date(Date.now() - 47 * 60_000).toISOString(),
    model: "gpt-5.2",
    inputTokens: 980,
    outputTokens: 140,
    costUsd: 0.004,
    costPton: "7900000000000000",
    status: "pending",
    apiKeyId: "k-ci",
  },
  {
    id: "c-4",
    ts: new Date(Date.now() - 3 * 3_600_000).toISOString(),
    model: "llama-4-405b",
    inputTokens: 3210,
    outputTokens: 88,
    costUsd: 0.0,
    costPton: "0",
    status: "error",
    apiKeyId: "k-ci",
  },
];

/** Deterministic, empty-safe mock for the by-API-key rollup. */
const MOCK_KEYS: UsageKeyRow[] = [
  {
    apiKeyId: "k-prod",
    name: "treasurer · prod",
    callCount: 1284,
    totalInputTokens: 2_410_000,
    totalOutputTokens: 812_400,
    totalCostUsd: 96.4,
    totalCostPton: "190900000000000000000",
  },
  {
    apiKeyId: "k-research",
    name: "research worker",
    callCount: 612,
    totalInputTokens: 1_180_000,
    totalOutputTokens: 540_200,
    totalCostUsd: 52.1,
    totalCostPton: "103200000000000000000",
  },
  {
    apiKeyId: "k-ci",
    name: "ci · smoke tests",
    callCount: 88,
    totalInputTokens: 64_200,
    totalOutputTokens: 9_140,
    totalCostUsd: 3.7,
    totalCostPton: "7300000000000000000",
  },
];

export function UsageChart({
  totals = USAGE_TOTALS,
  models = SPEND_MODELS,
}: {
  totals?: UsageTotals;
  models?: SpendModel[];
} = {}) {
  // 30-day spend bars (deterministic mock — stable bar ids so the chart key
  // isn't the raw array index).
  const mockBars = useMemo(
    () => makeUsageSeries(30).map((value, i) => ({ value, id: `bar-${i}` })),
    [],
  );

  // Live usage & spend (GET /v1/usage/summary); falls back to mock when the
  // gateway is unavailable / unauthenticated. byModel / byDay are used only
  // when the gateway returns them.
  const usageFetcher = useCallback(() => fetchUsageSummary(), []);
  const usage = useLive(usageFetcher);
  const u = usage.data;

  // Recent calls (GET /v1/usage/calls) — small page, newest first.
  const callsFetcher = useCallback(() => fetchUsageCalls(12), []);
  const callsLive = useLive(callsFetcher);
  const calls: UsageCall[] =
    callsLive.data && callsLive.data.calls.length > 0
      ? callsLive.data.calls
      : MOCK_CALLS;

  // Per-API-key rollup (GET /v1/usage/keys).
  const keysFetcher = useCallback(() => fetchUsageKeys(), []);
  const keysLive = useLive(keysFetcher);
  const keyRows: UsageKeyRow[] =
    keysLive.data && keysLive.data.items.length > 0
      ? keysLive.data.items
      : MOCK_KEYS;

  const shownTotals: UsageTotals = u
    ? {
        total: formatAttoPtonString(u.totalCostPton),
        usd: `≈ $${Number(u.totalCostUsd).toFixed(2)}`,
        avg: `${
          u.callCount > 0
            ? (Number(u.totalCostPton) / 1e18 / u.callCount).toFixed(3)
            : "0.000"
        } / call avg`,
      }
    : totals;

  const totalPton = u ? Number(u.totalCostPton) || 1 : 1;
  const shownModels: SpendModel[] =
    u?.byModel && u.byModel.length > 0
      ? u.byModel.map((m, i) => ({
          name: m.model,
          pct: Math.round((Number(m.costPton) / totalPton) * 100),
          color: MODEL_COLORS[i % MODEL_COLORS.length],
        }))
      : models;

  const bars =
    u?.byDay && u.byDay.length > 0
      ? u.byDay.map((d, i) => ({ value: Math.max(2, d.calls), id: `bar-${i}` }))
      : mockBars;
  const max = Math.max(...bars.map((b) => b.value));

  return (
    <>
      <div className="sec-head">
        <div>
          <div className="sec-title">
            <span className="num">USE</span> Usage &amp; spend
          </div>
          <div className="sec-sub">
            PTON spent per day across LLM and agent-to-agent calls · last 30
            days.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {usage.live ? (
            <span className="chip ok">live</span>
          ) : (
            <span className="chip mute">⟩ example values</span>
          )}
          <span className="chip mute">30d</span>
          <span className="chip mute">90d</span>
        </div>
      </div>

      <div className="usage-grid">
        <div className="card usage-chart-card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
            }}
          >
            <div>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                total · 30d
              </div>
              <div
                className="mono"
                style={{
                  fontSize: 28,
                  color: "var(--text-strong)",
                  marginTop: 4,
                }}
              >
                {shownTotals.total}{" "}
                <span style={{ fontSize: 14, color: "var(--gold-hi)" }}>
                  PTON
                </span>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                className="mono"
                style={{ fontSize: 11, color: "var(--muted)" }}
              >
                {shownTotals.usd}
              </div>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  color: "var(--ok-bright)",
                  marginTop: 4,
                }}
              >
                {shownTotals.avg}
              </div>
            </div>
          </div>

          <div className="chart-wrap">
            <svg
              viewBox="0 0 600 180"
              width="100%"
              height="180"
              preserveAspectRatio="none"
              style={{ overflow: "visible" }}
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="bar-g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f3ba2f" />
                  <stop offset="100%" stopColor="#d8a000" />
                </linearGradient>
              </defs>
              {bars.map((bar, i) => {
                const bw = 600 / bars.length;
                const h = (bar.value / max) * 150;
                return (
                  <rect
                    key={bar.id}
                    x={i * bw + 2}
                    y={160 - h}
                    width={bw - 4}
                    height={h}
                    rx={2}
                    fill="url(#bar-g)"
                    opacity={
                      i === bars.length - 1 ? 1 : 0.55 + (i / bars.length) * 0.3
                    }
                  />
                );
              })}
              <line
                x1="0"
                y1="160"
                x2="600"
                y2="160"
                stroke="var(--border)"
                strokeWidth="1"
              />
            </svg>
          </div>
        </div>

        <div className="card">
          <div className="card-label">Spend by model</div>
          <div className="usage-models">
            {shownModels.map((m) => (
              <div key={m.name} className="model-row">
                <div className="model-row-top">
                  <span className="model-name">{m.name}</span>
                  <span className="model-pct">{m.pct}%</span>
                </div>
                <div className="model-bar">
                  <div style={{ width: `${m.pct}%`, background: m.color }} />
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 18,
              paddingTop: 14,
              borderTop: "1px dashed var(--border)",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span
              className="mono"
              style={{ fontSize: 11, color: "var(--muted)" }}
            >
              routed via LiteLLM
            </span>
            <span
              className="mono"
              style={{ fontSize: 11, color: "var(--silver)" }}
            >
              8 models
            </span>
          </div>
        </div>
      </div>

      {/* ── Recent calls ──────────────────────────────────────────────────
          Anchor target for the page's "Usage history" affordance. */}
      <div id="usage-history" className="sec-head" style={{ marginTop: 28 }}>
        <div>
          <div className="sec-title">
            <span className="num">LOG</span> Recent calls
          </div>
          <div className="sec-sub">
            Per-call usage history — model, tokens and PTON settled on-chain.
          </div>
        </div>
        {callsLive.live ? (
          <span className="chip ok">live</span>
        ) : (
          <span className="chip mute">⟩ example values</span>
        )}
      </div>

      <div className="svc-table">
        <div
          className="svc-row head"
          style={{ gridTemplateColumns: CALLS_COLS }}
        >
          <span>Time</span>
          <span>Model</span>
          <span>Tokens (in / out)</span>
          <span>Cost</span>
          <span>Status</span>
        </div>
        {calls.length === 0 ? (
          <div
            className="svc-row"
            style={{ gridTemplateColumns: "1fr", color: "var(--muted)" }}
          >
            <span className="mono" style={{ fontSize: 12 }}>
              No calls yet — usage appears here as your agents spend.
            </span>
          </div>
        ) : (
          calls.map((c) => (
            <div
              key={c.id}
              className="svc-row"
              style={{ gridTemplateColumns: CALLS_COLS }}
            >
              <span className="svc-latency" title={c.ts}>
                {relTime(c.ts)} ago
              </span>
              <span className="svc-name-main mono" style={{ fontSize: 12 }}>
                {c.model}
              </span>
              <span className="svc-endpoint">
                {fmtTokens(c.inputTokens)}{" "}
                <span style={{ color: "var(--muted)" }}>/</span>{" "}
                {fmtTokens(c.outputTokens)}
              </span>
              <span className="svc-price">
                {formatAttoPtonString(c.costPton)}{" "}
                <span style={{ color: "var(--muted)", fontSize: 10 }}>
                  PTON
                </span>
              </span>
              <span>
                <span className={`chip ${statusChip(c.status)}`}>
                  {c.status}
                </span>
              </span>
            </div>
          ))
        )}
      </div>

      {/* ── By API key ────────────────────────────────────────────────────── */}
      <div className="sec-head" style={{ marginTop: 28 }}>
        <div>
          <div className="sec-title">
            <span className="num">KEY</span> By API key
          </div>
          <div className="sec-sub">
            Usage rolled up per HMAC key — calls, tokens and total PTON spent.
          </div>
        </div>
        {keysLive.live ? (
          <span className="chip ok">live</span>
        ) : (
          <span className="chip mute">⟩ example values</span>
        )}
      </div>

      <div className="svc-table">
        <div
          className="svc-row head"
          style={{ gridTemplateColumns: KEYS_COLS }}
        >
          <span>Key</span>
          <span>Calls</span>
          <span>Tokens (in / out)</span>
          <span>Total cost</span>
        </div>
        {keyRows.length === 0 ? (
          <div
            className="svc-row"
            style={{ gridTemplateColumns: "1fr", color: "var(--muted)" }}
          >
            <span className="mono" style={{ fontSize: 12 }}>
              No keyed usage yet.
            </span>
          </div>
        ) : (
          keyRows.map((k, i) => (
            <div
              key={k.apiKeyId ?? `unkeyed-${i}`}
              className="svc-row"
              style={{ gridTemplateColumns: KEYS_COLS }}
            >
              <div className="svc-name">
                <div>
                  <div className="svc-name-main">{k.name ?? "unnamed key"}</div>
                  <div className="svc-name-sub">
                    {k.apiKeyId
                      ? `sk-ai-••••${k.apiKeyId.slice(-4)}`
                      : "no key (session)"}
                  </div>
                </div>
              </div>
              <span className="svc-latency">{fmtTokens(k.callCount)}</span>
              <span className="svc-endpoint">
                {fmtTokens(k.totalInputTokens)}{" "}
                <span style={{ color: "var(--muted)" }}>/</span>{" "}
                {fmtTokens(k.totalOutputTokens)}
              </span>
              <span className="svc-price">
                {formatAttoPtonString(k.totalCostPton)}{" "}
                <span style={{ color: "var(--muted)", fontSize: 10 }}>
                  PTON
                </span>
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
