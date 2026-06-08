/**
 * x402 page — the inline, real-data billing surface.
 *
 * Composition only. The page holds the funding-wallet address, the selected
 * top-up chain (persisted in sessionStorage), and a refreshKey bumped after a
 * successful deposit so the balance re-fetches. Everything is inline (no modal):
 * a wallet/network row, a 2-col balance + native EIP-3009 top-up card, the active
 * model picker, usage analytics and API keys — each a self-contained sibling
 * under ../x402, driven only by live /v1/* data.
 */
import { useState } from "react";
import { ApiKeys } from "../x402/ApiKeys";
import { BalanceCard } from "../x402/BalanceCard";
import { ModelPicker } from "../x402/ModelPicker";
import { NetworkSwitcher } from "../x402/NetworkSwitcher";
import { TopUpCard } from "../x402/TopUpCard";
import { UsageChart } from "../x402/UsageChart";
import { WalletConnectBar } from "../x402/WalletConnectBar";

/** Read the persisted top-up chain, defaulting to Base (8453). */
function initialChainId(): number {
  try {
    return Number(sessionStorage.getItem("op.x402.chain")) || 8453;
  } catch {
    return 8453;
  }
}

export function X402Page() {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number>(initialChainId);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head">
          <div>
            <div className="page-eyebrow">x402 · pay-per-call rail</div>
            <h1 className="page-title">Credits &amp; Billing</h1>
            <p className="page-sub">
              Fund LLM calls and agent-to-agent payments in PTON — no account,
              no subscription. Every call settles on-chain via EIP-3009 against
              your ClaudeVault balance.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() =>
              document
                .getElementById("usage-history")
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            Usage history
          </button>
        </div>

        {/* Wallet + network row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            flexWrap: "wrap",
            marginBottom: 18,
          }}
        >
          <WalletConnectBar address={address} onConnect={setAddress} />
          <NetworkSwitcher
            chainId={chainId}
            onChange={setChainId}
            address={address}
          />
        </div>

        {/* Balance + top-up */}
        <div className="x402-grid">
          <BalanceCard chainId={chainId} refreshKey={refreshKey} />
          <TopUpCard
            address={address}
            chainId={chainId}
            onDeposited={() => setRefreshKey((k) => k + 1)}
          />
        </div>

        <ModelPicker />

        <UsageChart />

        <ApiKeys />
      </div>
    </div>
  );
}
