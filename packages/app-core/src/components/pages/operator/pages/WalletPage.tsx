/**
 * Operator Wallet page — trust-boundary mode picker + per-chain balances.
 * Ported from handoff_app/prototype/components/Pages.jsx (WalletPage).
 */
import { useState } from "react";
import {
  CHAIN_BALANCES,
  type ChainBalance,
  OPERATOR_ADDRESS_SHORT,
  WALLET_MODES,
  WALLET_TOTAL_USD,
  type WalletMode,
  type WalletModeInfo,
} from "../mock";

export function WalletPage({
  modes = WALLET_MODES,
  chains = CHAIN_BALANCES,
  total = WALLET_TOTAL_USD,
}: {
  modes?: Record<WalletMode, WalletModeInfo>;
  chains?: ChainBalance[];
  total?: string;
} = {}) {
  const [mode, setMode] = useState<WalletMode>("vault");
  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head">
          <div>
            <div className="page-eyebrow">built-in wallet</div>
            <h1 className="page-title">Wallet</h1>
            <p className="page-sub">
              The agent's wallet is part of the runtime. Set the trust boundary
              for every on-chain action.
            </p>
          </div>
          <button type="button" className="btn btn-ghost">
            <span className="mono">{OPERATOR_ADDRESS_SHORT}</span> ↗
          </button>
        </div>

        <div className="wallet-modes">
          {(Object.entries(modes) as [WalletMode, WalletModeInfo][]).map(
            ([k, v]) => (
              // biome-ignore lint/a11y/noStaticElementInteractions: prototype uses a clickable card div (.wmode) — markup ported verbatim for pixel fidelity
              // biome-ignore lint/a11y/useKeyWithClickEvents: prototype uses a clickable card div (.wmode) — markup ported verbatim for pixel fidelity
              <div
                key={k}
                className={`wmode ${mode === k ? "is-active" : ""}`}
                onClick={() => setMode(k)}
              >
                <div className="wmode-top">
                  <span className="wmode-name">{v.name}</span>
                  <span className="chip mute">{v.tag}</span>
                </div>
                <div className="wmode-desc">{v.desc}</div>
              </div>
            ),
          )}
        </div>

        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 16,
            }}
          >
            <div className="card-label" style={{ margin: 0 }}>
              Balances · 5 chains
            </div>
            <div
              className="mono"
              style={{ fontSize: 20, color: "var(--gold-hi)" }}
            >
              {total}
            </div>
          </div>
          <div className="chain-grid">
            {chains.map((c) => (
              <div key={c.name} className="chain-row">
                <div className="chain-id">
                  <span
                    className="chain-dot"
                    style={{
                      background: c.color,
                      boxShadow: `0 0 8px ${c.color}`,
                    }}
                  />
                  <span className="chain-name">{c.name}</span>
                  <span className="chain-short">{c.short}</span>
                </div>
                <span className="chain-amt">
                  {c.amt}
                  <em>{c.sym}</em>
                </span>
                <span className="chain-usd">{c.usd}</span>
                <button type="button" className="btn btn-ghost btn-sm">
                  Send
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
