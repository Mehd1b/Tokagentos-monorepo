/**
 * Operator Wallet page — trust-boundary mode picker + per-chain balances.
 * Ported from handoff_app/prototype/components/Pages.jsx (WalletPage).
 *
 * Live: per-chain balances, total USD, chain count and the header address chip
 * come from the agent's same-origin wallet routes (GET /api/wallet/balances,
 * GET /api/wallet/addresses) via the operator `useLive` seam, falling back to
 * mock data when the routes are unavailable / unauthenticated / RPC unconfigured
 * (the routes return `{ evm: null, solana: null }`). Deliberately does NOT touch
 * TokagentClient / client.ts — mirroring the billing seam, the fetchers below
 * are self-contained same-origin `fetch` calls.
 *
 * Not live (no honest backend): the trust-boundary mode picker (WALLET_MODES)
 * is local UI state, and the per-row "Send" button has no one-click backend
 * (the only real transfer path is steward/BSC-gated) — both stay presentational.
 */
import type {
  EvmChainBalance,
  WalletAddresses,
  WalletBalancesResponse,
} from "@tokagentos/shared/contracts";
import { useCallback, useState } from "react";
import { CHAIN_CONFIGS, resolveChainKey } from "../../../inventory/chainConfig";
import { useLive } from "../client-billing";
import {
  CHAIN_BALANCES,
  type ChainBalance,
  OPERATOR_ADDRESS_SHORT,
  WALLET_MODES,
  WALLET_TOTAL_USD,
  type WalletMode,
  type WalletModeInfo,
} from "../mock";

// ── live data seam (same-origin agent routes; mirrors client-billing.ts) ─────
async function getWalletJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return (await res.json()) as T;
}

function fetchWalletBalances(): Promise<WalletBalancesResponse> {
  return getWalletJson<WalletBalancesResponse>("/api/wallet/balances");
}

function fetchWalletAddresses(): Promise<WalletAddresses> {
  return getWalletJson<WalletAddresses>("/api/wallet/addresses");
}

/** Parse a decimal USD string ("1,328.42" / "1328.42") to a number, 0 on NaN. */
function parseUsd(value: string | null | undefined): number {
  if (!value) return 0;
  const n = Number.parseFloat(value.replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Trim a long balance string to a compact, readable amount. */
function formatAmt(raw: string): string {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n)) return raw;
  if (n === 0) return "0";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/**
 * Operator chain-dot colours. The operator console only loads operator.css
 * (scoped under `.op-root`), which defines `--eth/--base/--arb/--op/--pol` —
 * NOT the `--color-chain-*` vars from the main app's styles.css. So we map the
 * canonical chainConfig key to the operator's own palette to preserve the
 * gold-on-jet design. Unknown chains fall back to the gold accent.
 */
const OP_CHAIN_COLORS: Record<string, string> = {
  ethereum: "var(--eth)",
  base: "var(--base)",
  arbitrum: "var(--arb)",
  optimism: "var(--op)",
  polygon: "var(--pol)",
  solana: "#9945ff",
  bsc: "#f0b90b",
};

function chainColor(chainName: string): string {
  const key = resolveChainKey(chainName);
  return (key && OP_CHAIN_COLORS[key]) || "var(--gold)";
}

/** Sum native + token USD for one EVM chain. */
function evmChainUsd(c: EvmChainBalance): number {
  return (
    parseUsd(c.nativeValueUsd) +
    c.tokens.reduce((s, t) => s + parseUsd(t.valueUsd), 0)
  );
}

interface WalletRows {
  chains: ChainBalance[];
  total: string;
  count: number;
}

/** Map the live wallet-balances response to the operator widget shapes. */
function walletBalancesToRows(resp: WalletBalancesResponse): WalletRows {
  const rows: ChainBalance[] = [];
  let totalUsd = 0;

  for (const c of resp.evm?.chains ?? []) {
    if (c.error !== null) continue; // skip per-chain RPC failures
    const usd = evmChainUsd(c);
    totalUsd += usd;
    const key = resolveChainKey(c.chain);
    const name = key ? CHAIN_CONFIGS[key].name.toLowerCase() : c.chain;
    rows.push({
      name,
      short:
        (key ? CHAIN_CONFIGS[key].nativeSymbol : c.nativeSymbol) || c.chain,
      color: chainColor(c.chain),
      amt: formatAmt(c.nativeBalance),
      sym: c.nativeSymbol,
      usd: formatUsd(usd),
    });
  }

  if (resp.solana) {
    const usd =
      parseUsd(resp.solana.solValueUsd) +
      resp.solana.tokens.reduce((s, t) => s + parseUsd(t.valueUsd), 0);
    totalUsd += usd;
    rows.push({
      name: "solana",
      short: "SOL",
      color: OP_CHAIN_COLORS.solana,
      amt: formatAmt(resp.solana.solBalance),
      sym: "SOL",
      usd: formatUsd(usd),
    });
  }

  return { chains: rows, total: formatUsd(totalUsd), count: rows.length };
}

/** Shorten a full address to "0xA9c1…3E4f" form. */
function shortenAddress(addr: string | null): string | null {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function WalletPage({
  modes = WALLET_MODES,
  chains: chainsProp = CHAIN_BALANCES,
  total: totalProp = WALLET_TOTAL_USD,
}: {
  modes?: Record<WalletMode, WalletModeInfo>;
  chains?: ChainBalance[];
  total?: string;
} = {}) {
  const [mode, setMode] = useState<WalletMode>("vault");

  // Live per-chain balances + total + chain count (GET /api/wallet/balances).
  const balancesFetcher = useCallback(() => fetchWalletBalances(), []);
  const { data: balData } = useLive(balancesFetcher);
  // Only treat as live when the response actually carries chain data — the
  // route returns `{ evm: null, solana: null }` when RPC is unconfigured.
  const liveRows =
    balData && (balData.evm?.chains?.length || balData.solana)
      ? walletBalancesToRows(balData)
      : null;
  const isLive = liveRows !== null;
  const chains = liveRows ? liveRows.chains : chainsProp;
  const total = liveRows ? liveRows.total : totalProp;
  const chainCount = liveRows ? liveRows.count : chainsProp.length;

  // Live operator address (GET /api/wallet/addresses) for the header chip.
  const addressFetcher = useCallback(() => fetchWalletAddresses(), []);
  const { data: addrData } = useLive(addressFetcher);
  const operatorAddress =
    shortenAddress(addrData?.evmAddress ?? null) ?? OPERATOR_ADDRESS_SHORT;
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
            <span className="mono">{operatorAddress}</span> ↗
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
            <div
              className="card-label"
              style={{
                margin: 0,
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
            >
              Balances · {chainCount} chain{chainCount === 1 ? "" : "s"}
              {isLive ? (
                <span className="chip ok">live</span>
              ) : (
                <span className="chip mute">⟩ example values</span>
              )}
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
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled
                  title="Send · preview — routed through the steward/vault flow (backend coming)"
                >
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
