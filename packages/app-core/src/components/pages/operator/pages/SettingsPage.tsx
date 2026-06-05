/**
 * Operator Settings page — runtime config (.env mirror) + channel/behavior toggles.
 * Ported from handoff_app/prototype/components/Pages.jsx (SettingsPage).
 *
 * The env table defaults to {@link ENV_ROWS}; the three behavior toggles default to
 * {@link SETTING_TOGGLES}. Toggle on/off state is held in local component state,
 * seeded from each toggle's `on` flag, and is interactive (click to flip).
 */
import { useState } from "react";
import {
  ENV_ROWS,
  type EnvRow,
  SETTING_TOGGLES,
  type SettingToggle,
} from "../mock";

export function SettingsPage({
  env = ENV_ROWS,
  settings = SETTING_TOGGLES,
}: {
  env?: EnvRow[];
  settings?: SettingToggle[];
} = {}) {
  const [toggles, setToggles] = useState<Record<SettingToggle["id"], boolean>>(
    () =>
      settings.reduce(
        (acc, s) => {
          acc[s.id] = s.on;
          return acc;
        },
        {} as Record<SettingToggle["id"], boolean>,
      ),
  );

  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head">
          <div>
            <div className="page-eyebrow">configuration</div>
            <h1 className="page-title">Settings</h1>
            <p className="page-sub">
              Runtime config, LLM providers, and messaging channels. Mirrors
              your{" "}
              <span className="mono" style={{ color: "var(--gold-hi)" }}>
                .env
              </span>
              .
            </p>
          </div>
        </div>

        <div className="sec-head" style={{ marginTop: 0 }}>
          <div className="sec-title">
            <span className="num">ENV</span> Environment
          </div>
        </div>
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {env.map((e) => (
            <div key={e.k} className="env-row">
              <span className="env-key">{e.k}</span>
              <span className="env-eq">=</span>
              <span className="env-val">{e.v}</span>
              <span
                className="env-status"
                style={{ color: e.ok ? "var(--ok-bright)" : "var(--muted)" }}
              >
                {e.ok ? "✓" : "—"}
              </span>
            </div>
          ))}
        </div>

        <div className="sec-head">
          <div className="sec-title">
            <span className="num">CH</span> Channels &amp; behavior
          </div>
        </div>
        <div className="card">
          {settings.map((s) => (
            <div key={s.id} className="setting-row">
              <div>
                <div className="setting-name">{s.name}</div>
                <div className="setting-desc">{s.desc}</div>
              </div>
              <button
                type="button"
                className={`toggle ${toggles[s.id] ? "on" : ""}`}
                onClick={() => setToggles((t) => ({ ...t, [s.id]: !t[s.id] }))}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
