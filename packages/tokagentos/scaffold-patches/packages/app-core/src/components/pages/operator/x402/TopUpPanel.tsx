/**
 * x402 · Balance + Top-up — the centerpiece interaction.
 *
 * Ported from handoff_app/prototype/components/X402Page.jsx (TopUpRow): a 2-col
 * grid pairing the live ClaudeVault balance card with a swap → PTON top-up form.
 * Token list, presets, PTON rate, vault address, and balance values come from
 * "../mock" so real balances/quotes can be wired in later.
 */
import { useCallback, useState } from "react";
import { KeyMark } from "../brand/KeyMark";
import { fetchCredits, formatAttoPtonString, useLive } from "../client-billing";
import {
  PTON_PER_USD,
  TOPUP_PRESETS,
  TOPUP_TOKENS,
  type TopUpToken,
  VAULT_ADDRESS,
  VAULT_ADDRESS_SHORT,
  VAULT_BALANCE,
  type VaultBalance,
} from "../mock";

export function TopUpPanel({
  tokens = TOPUP_TOKENS,
  presets = TOPUP_PRESETS,
  ptonPerUsd = PTON_PER_USD,
  balance = VAULT_BALANCE,
  vaultAddress = VAULT_ADDRESS,
  vaultAddressShort = VAULT_ADDRESS_SHORT,
  onTopUp,
}: {
  tokens?: TopUpToken[];
  presets?: readonly string[];
  ptonPerUsd?: number;
  balance?: VaultBalance;
  vaultAddress?: string;
  vaultAddressShort?: string;
  /**
   * Opens the real top-up flow. Wired by X402Page to the working billing page
   * (EIP-3009 deposit), so the button performs a real deposit rather than the
   * swap form here, which is an illustrative preview of the route.
   */
  onTopUp?: () => void;
} = {}) {
  const [tok, setTok] = useState(tokens[0].sym);
  const [amount, setAmount] = useState("250");
  const token = tokens.find((t) => t.sym === tok) ?? tokens[0];
  const usd = Number.parseFloat(amount || "0") * token.rate;
  // PTON ≈ USD / TON price; TON ~$0.50 → mock 1 USD = ~2 PTON minus margin
  const ptonOut = usd * ptonPerUsd;

  // Live ClaudeVault balance (GET /v1/credits/me); falls back to mock when the
  // gateway is unavailable / unauthenticated.
  const creditsFetcher = useCallback(() => fetchCredits(), []);
  const credits = useLive(creditsFetcher);
  const liveAmount = credits.data
    ? formatAttoPtonString(credits.data.balance)
    : null;
  // reserved (held against in-flight calls) + accrued (settled-but-unswept):
  // surfaced under the balance only when the gateway returns live credits.
  const liveReserved = credits.data
    ? formatAttoPtonString(credits.data.reserved)
    : null;
  const liveAccrued = credits.data
    ? formatAttoPtonString(credits.data.accrued)
    : null;

  return (
    <div className="x402-grid">
      {/* Balance */}
      <div className="card accent bal-card">
        <div className="bal-top">
          <div className="card-label">
            <KeyMark size={14} /> ClaudeVault balance
          </div>
          {credits.live ? (
            <span className="chip ok">
              <span
                className="dot-pulse"
                style={{
                  background: "var(--ok-bright)",
                  boxShadow: "0 0 6px var(--ok-bright)",
                }}
              />{" "}
              live · mainnet
            </span>
          ) : (
            <span className="chip mute">⟩ example values</span>
          )}
        </div>
        <div className="bal-amount">
          {liveAmount ?? balance.amount} <em>PTON</em>
        </div>
        <div className="bal-usd">
          {credits.live ? "funds LLM + agent-to-agent calls" : balance.usd}
        </div>

        {/* reserved + accrued breakdown — live only (gateway returned credits) */}
        {liveReserved !== null && liveAccrued !== null && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 12,
            }}
          >
            <span
              className="chip mute"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              reserved
              <span className="mono" style={{ color: "var(--silver)" }}>
                {liveReserved} PTON
              </span>
            </span>
            <span
              className="chip mute"
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              accrued
              <span className="mono" style={{ color: "var(--silver)" }}>
                {liveAccrued} PTON
              </span>
            </span>
          </div>
        )}

        <div className="bal-bar">
          <div style={{ width: `${balance.spentPct}%` }} />
        </div>
        <div className="bal-bar-foot">
          <span>{balance.spentLabel}</span>
          <span>{balance.autoTopUpLabel}</span>
        </div>

        <div className="bal-vault">
          <div className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
            <span
              style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}
            >
              vault
            </span>
          </div>
          <a href={`https://etherscan.io/address/${vaultAddress}`}>
            {vaultAddressShort} <span style={{ color: "var(--muted)" }}>↗</span>
          </a>
        </div>
      </div>

      {/* Top-up */}
      <div className="card topup">
        <div className="card-label">Top up · swap → PTON</div>

        <div className="topup-tokens">
          {tokens.map((t) => (
            <button
              key={t.sym}
              type="button"
              className={`token-btn ${tok === t.sym ? "is-active" : ""}`}
              onClick={() => setTok(t.sym)}
            >
              <span className="token-ic" style={{ background: t.color }}>
                {t.sym[0]}
              </span>
              <span className="token-sym">{t.sym}</span>
              <span className="token-bal">{t.bal}</span>
            </button>
          ))}
        </div>

        <div className="amount-field">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            inputMode="decimal"
          />
          <span className="suffix">{tok}</span>
        </div>
        <div className="amount-presets">
          {presets.map((p) => (
            <button
              key={p}
              type="button"
              className="preset"
              onClick={() => setAmount(p)}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="swap-route">
          <div className="swap-row">
            <div className="swap-steps">
              <span className="swap-node">{tok}</span>
              <span className="swap-arrow">→</span>
              <span className="swap-node">TON</span>
              <span className="swap-arrow">→</span>
              <span className="swap-node final">PTON</span>
            </div>
            <span className="gasless-tag">
              <span
                className="dot-pulse"
                style={{
                  background: "var(--ok-bright)",
                  boxShadow: "0 0 6px var(--ok-bright)",
                }}
              />{" "}
              gasless
            </span>
          </div>
          <div className="swap-meta">
            <div className="swap-out">
              <div className="k">you receive</div>
              <div className="v">
                {ptonOut.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })}{" "}
                PTON
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                className="mono"
                style={{
                  fontSize: 10,
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                ≈ value
              </div>
              <div
                className="mono"
                style={{ fontSize: 14, color: "var(--silver)" }}
              >
                ${usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="btn btn-gold btn-lg"
          style={{ marginTop: 14, width: "100%" }}
          onClick={onTopUp}
        >
          Deposit {amount || "0"} {tok} → PTON
        </button>
        <div
          className="mono"
          style={{
            fontSize: 10,
            color: "var(--muted)",
            textAlign: "center",
            marginTop: 10,
          }}
        >
          one signature · EIP-3009 · no gas from your wallet
        </div>
      </div>
    </div>
  );
}
