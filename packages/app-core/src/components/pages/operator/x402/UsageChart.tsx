/**
 * Operator x402 — usage & spend analytics: 30-day spend bar chart + spend-by-model
 * breakdown. Ported from handoff_app/prototype/components/X402Lower.jsx
 * (UsageAnalytics).
 */
import { useMemo } from "react";
import {
  makeUsageSeries,
  SPEND_MODELS,
  type SpendModel,
  USAGE_TOTALS,
  type UsageTotals,
} from "../mock";

export function UsageChart({
  totals = USAGE_TOTALS,
  models = SPEND_MODELS,
}: {
  totals?: UsageTotals;
  models?: SpendModel[];
} = {}) {
  // 30-day spend bars (deterministic — see makeUsageSeries in mock).
  // Each bar carries a stable id so the chart key isn't the raw array index.
  const bars = useMemo(
    () => makeUsageSeries(30).map((value, i) => ({ value, id: `bar-${i}` })),
    [],
  );
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
        <div style={{ display: "flex", gap: 8 }}>
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
                {totals.total}{" "}
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
                {totals.usd}
              </div>
              <div
                className="mono"
                style={{
                  fontSize: 11,
                  color: "var(--ok-bright)",
                  marginTop: 4,
                }}
              >
                {totals.avg}
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
            {models.map((m) => (
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
    </>
  );
}
