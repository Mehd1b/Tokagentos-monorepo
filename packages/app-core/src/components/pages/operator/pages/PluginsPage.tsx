/**
 * Operator Plugins page — runtime extensions you can mount into the agent.
 * Ported from handoff_app/prototype/components/Shell.jsx (PluginsPage).
 */
import { useState } from "react";
import { PLUGINS, type PluginEntry } from "../mock";

export function PluginsPage({
  plugins = PLUGINS,
}: {
  plugins?: PluginEntry[];
} = {}) {
  const [toggles, setToggles] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(plugins.map((p) => [p.name, p.on])),
  );
  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head">
          <div>
            <div className="page-eyebrow">runtime extensions</div>
            <h1 className="page-title">Plugins</h1>
            <p className="page-sub">
              Mount features into the agent — DeFi actions, channels, the
              billing rail. Toggle to load.
            </p>
          </div>
          <button type="button" className="btn btn-ghost">
            Browse registry ↗
          </button>
        </div>
        <div className="auto-grid">
          {plugins.map((p) => (
            <div key={p.name} className="auto-card">
              <div className="auto-top">
                <span className="auto-name">
                  <span className="auto-glyph">🧩</span> @tokagent/{p.name}
                </span>
                <button
                  type="button"
                  className={`toggle ${toggles[p.name] ? "on" : ""}`}
                  onClick={() =>
                    setToggles((t) => ({ ...t, [p.name]: !t[p.name] }))
                  }
                />
              </div>
              <div className="auto-foot" style={{ marginTop: 4 }}>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--muted-strong)",
                    fontFamily: "DM Sans, sans-serif",
                  }}
                >
                  {p.desc}
                </span>
                <span className="chip mute">{p.kind}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
