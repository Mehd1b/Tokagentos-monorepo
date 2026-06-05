/**
 * x402 · Agent-to-agent network — live mesh graph + settlement feed + stats.
 * Ported from handoff_app/prototype/components/AgentNetwork.jsx (AgentNetwork).
 *
 * Data (nodes, edges, stats) defaults to the operator mock constants so real
 * gateway data can be wired later; presentational copy stays inline. JS-driven
 * motion (edge activation, node pulse) is gated by usePrefersReducedMotion.
 */
import { useEffect, useState } from "react";
import {
  A2A_EDGES,
  A2A_NODES,
  A2A_STATS,
  type A2ANode,
  type A2AStat,
} from "../mock";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";
import { SettlementFeed } from "./SettlementFeed";

export function AgentNetwork({
  nodes = A2A_NODES,
  edges = A2A_EDGES,
  stats = A2A_STATS,
}: {
  nodes?: A2ANode[];
  edges?: [string, string][];
  stats?: A2AStat[];
} = {}) {
  const reduced = usePrefersReducedMotion();
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const [activeEdge, setActiveEdge] = useState(0);
  const [pulsingNode, setPulsingNode] = useState<string | null>(null);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      const e = Math.floor(Math.random() * edges.length);
      setActiveEdge(e);
      setPulsingNode(edges[e][1]);
      setTimeout(() => setPulsingNode(null), 1200);
    }, 1600);
    return () => clearInterval(id);
  }, [reduced, edges]);

  return (
    <>
      <div className="sec-head">
        <div>
          <div className="sec-title">
            <span className="num">A2A</span> Agent-to-agent network
          </div>
          <div className="sec-sub">
            Your agent discovers, calls, and pays other agents' services
            per-request — and earns when they call yours.
          </div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm">
          + Register a service
        </button>
      </div>

      <div className="a2a-grid">
        {/* Network graph */}
        <div className="a2a-net">
          <div className="a2a-net-head">
            <span
              className="mono"
              style={{
                fontSize: 10,
                color: "var(--muted)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              live mesh · 6 peers
            </span>
            <div className="a2a-net-legend">
              <span className="a2a-leg">
                <span className="d" style={{ background: "var(--gold)" }} />{" "}
                outbound
              </span>
              <span className="a2a-leg">
                <span
                  className="d"
                  style={{ background: "var(--ok-bright)" }}
                />{" "}
                inbound
              </span>
            </div>
          </div>

          <svg
            className="a2a-svg"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {edges.map(([a, b], i) => {
              const A = byId[a];
              const B = byId[b];
              const isActive = i === activeEdge;
              return (
                <g key={`${a}-${b}`}>
                  <line
                    x1={A.x}
                    y1={A.y}
                    x2={B.x}
                    y2={B.y}
                    stroke={
                      isActive
                        ? "rgba(240,185,11,0.6)"
                        : "rgba(138,138,148,0.18)"
                    }
                    strokeWidth={isActive ? 0.5 : 0.3}
                    strokeDasharray="1.2 1.2"
                    vectorEffect="non-scaling-stroke"
                  />
                  {isActive && (
                    <circle
                      r="0.9"
                      fill="#f3ba2f"
                      vectorEffect="non-scaling-stroke"
                    >
                      <animate
                        attributeName="cx"
                        from={A.x}
                        to={B.x}
                        dur="1.2s"
                      />
                      <animate
                        attributeName="cy"
                        from={A.y}
                        to={B.y}
                        dur="1.2s"
                      />
                    </circle>
                  )}
                </g>
              );
            })}
          </svg>

          {nodes.map((n) => (
            <div
              key={n.id}
              className={`a2a-node ${n.self ? "self" : ""} ${pulsingNode === n.id ? "pulsing" : ""}`}
              style={{ left: `${n.x}%`, top: `${n.y}%` }}
            >
              <div className="a2a-node-disc">
                <span className="a2a-node-glyph">{n.glyph}</span>
              </div>
              <span className="a2a-node-label">{n.label}</span>
              <span className="a2a-node-price">{n.price}</span>
            </div>
          ))}
        </div>

        {/* Live settlement feed */}
        <SettlementFeed />
      </div>

      {/* Stats */}
      <div className="a2a-stats">
        {stats.map((s) => (
          <div key={s.label} className="a2a-stat">
            <div
              className={
                s.tone === "gold" ? "v gold" : s.tone === "ok" ? "v ok" : "v"
              }
            >
              {s.value}
              {s.unit && (
                <span style={{ fontSize: 13, color: "var(--muted)" }}>
                  {s.unit}
                </span>
              )}
            </div>
            <div className="k">{s.label}</div>
            <div
              className="delta"
              style={
                s.deltaTone === "muted" ? { color: "var(--muted)" } : undefined
              }
            >
              {s.delta}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
