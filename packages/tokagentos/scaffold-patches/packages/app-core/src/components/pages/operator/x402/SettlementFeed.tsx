import { useEffect, useRef, useState } from "react";
import { SETTLEMENT_TEMPLATES, type SettlementTemplate } from "../mock";
import { usePrefersReducedMotion } from "../usePrefersReducedMotion";

interface FeedTx extends SettlementTemplate {
  time: string;
  id: number;
}

function clockTime(): string {
  const ts = new Date();
  return `${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}:${String(ts.getSeconds()).padStart(2, "0")}`;
}

export function SettlementFeed({
  templates = SETTLEMENT_TEMPLATES,
}: {
  templates?: SettlementTemplate[];
} = {}) {
  const reduced = usePrefersReducedMotion();
  const [txs, setTxs] = useState<FeedTx[]>(() => {
    if (!reduced) return [];
    const time = clockTime();
    return Array.from({ length: 9 }, (_, i) => ({
      ...templates[i % templates.length],
      time,
      id: i,
    }));
  });
  const idRef = useRef(0);

  useEffect(() => {
    if (reduced) return;
    let i = 0;
    const push = () => {
      const t = templates[i % templates.length];
      const time = clockTime();
      setTxs((prev) =>
        [{ ...t, time, id: idRef.current++ }, ...prev].slice(0, 9),
      );
      i++;
    };
    push();
    push();
    const id = setInterval(push, 1600);
    return () => clearInterval(id);
  }, [reduced, templates]);

  return (
    <div className="a2a-feed">
      <div className="a2a-feed-head">
        <span
          className="mono"
          style={{ fontSize: 11, color: "var(--text-strong)" }}
        >
          Settlement stream
        </span>
        <span
          className="mono"
          style={{
            fontSize: 10,
            color: "var(--ok-bright)",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          <span
            className="dot-pulse"
            style={{
              background: "var(--ok-bright)",
              boxShadow: "0 0 6px var(--ok-bright)",
            }}
          />{" "}
          live
        </span>
      </div>
      <div className="a2a-feed-body">
        {txs.map((t, idx) => (
          <div
            key={t.id}
            className={`a2a-tx ${idx === 0 && !reduced ? "fresh" : ""}`}
            style={{ opacity: 1 - idx * 0.07 }}
          >
            <span className="a2a-tx-status">{t.dir === "in" ? "↙" : "↗"}</span>
            <div className="a2a-tx-route">
              <span
                className="a2a-tx-agent"
                style={{
                  color:
                    t.from === "treasurer"
                      ? "var(--gold-hi)"
                      : "var(--text-strong)",
                }}
              >
                {t.from}
              </span>
              <span className="a2a-tx-arrow">→</span>
              <span
                className="a2a-tx-agent"
                style={{
                  color:
                    t.to === "treasurer"
                      ? "var(--gold-hi)"
                      : "var(--text-strong)",
                }}
              >
                {t.to}
              </span>
              <span className="a2a-tx-svc">{t.svc}</span>
            </div>
            <span className="a2a-tx-amt">{t.amt}</span>
            <span className="a2a-tx-time">{t.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
