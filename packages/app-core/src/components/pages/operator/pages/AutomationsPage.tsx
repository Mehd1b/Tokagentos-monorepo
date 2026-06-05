/**
 * Operator Automations page — scheduled & on-chain-triggered rules.
 * Ported from handoff_app/prototype/components/Pages.jsx (AutomationsPage).
 */
import { useState } from "react";
import { AUTOMATIONS, type AutomationEntry } from "../mock";

export function AutomationsPage({
  automations = AUTOMATIONS,
}: {
  automations?: AutomationEntry[];
} = {}) {
  const [on, setOn] = useState<boolean[]>(() => automations.map((a) => a.on));
  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head">
          <div>
            <div className="page-eyebrow">scheduled &amp; triggered</div>
            <h1 className="page-title">Automations</h1>
            <p className="page-sub">
              Rules the agent runs on its own — on a schedule or when an
              on-chain condition fires.
            </p>
          </div>
          <button type="button" className="btn btn-gold">
            + New automation
          </button>
        </div>

        <div className="auto-grid">
          {automations.map((a, i) => (
            <div key={a.name} className="auto-card">
              <div className="auto-top">
                <span className="auto-name">
                  <span className="auto-glyph">{a.glyph}</span> {a.name}
                </span>
                <button
                  type="button"
                  className={`toggle ${on[i] ? "on" : ""}`}
                  onClick={() =>
                    setOn((prev) => prev.map((v, j) => (j === i ? !v : v)))
                  }
                />
              </div>
              <div className="auto-trigger">{a.trigger}</div>
              <div className="auto-foot">
                <span>{a.last}</span>
                <span
                  style={{ color: on[i] ? "var(--ok-bright)" : "var(--muted)" }}
                >
                  {on[i] ? "● armed" : "○ paused"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
