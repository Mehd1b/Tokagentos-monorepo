/**
 * x402 page — top-up credits + agent-to-agent network. The centerpiece.
 *
 * Page composition only: the page head plus the x402 sub-sections, each a
 * separate component under ../x402. AgentNetwork renders SettlementFeed itself,
 * so it is NOT composed here. Ported from
 * handoff_app/prototype/components/X402Page.jsx (X402Page).
 *
 * Top-up is NATIVE: "Top up" / "Deposit" open ../x402/TopupFlow, which runs the
 * real EIP-3009 quote → eth_signTypedData_v4 → settle flow in the operator's own
 * design via window.ethereum. It no longer borrows the old BillingPageView, so
 * nothing here depends on a page the operator is meant to replace. A successful
 * deposit bumps refreshKey to remount TopUpPanel and re-fetch the live balance.
 */
import { useState } from "react";
import { AgentNetwork } from "../x402/AgentNetwork";
import { ApiKeys } from "../x402/ApiKeys";
import { ServiceDirectory } from "../x402/ServiceDirectory";
import { TopUpPanel } from "../x402/TopUpPanel";
import { TopupFlow } from "../x402/TopupFlow";
import { UsageChart } from "../x402/UsageChart";

export function X402Page() {
  const [topupOpen, setTopupOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const openTopup = () => setTopupOpen(true);

  return (
    <div className="page">
      <div className="page-pad">
        <div className="page-head">
          <div>
            <div className="page-eyebrow">x402 · pay-per-call rail</div>
            <h1 className="page-title">Credits &amp; Agent Network</h1>
            <p className="page-sub">
              Fund LLM calls and agent-to-agent payments in PTON — no account,
              no subscription. Every call settles on-chain via EIP-3009 against
              your ClaudeVault balance.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="btn btn-ghost">
              Usage history
            </button>
            <button type="button" className="btn btn-gold" onClick={openTopup}>
              Top up
            </button>
          </div>
        </div>

        <TopUpPanel key={refreshKey} onTopUp={openTopup} />

        <AgentNetwork />

        <ServiceDirectory />

        <UsageChart />

        <ApiKeys />
      </div>

      {topupOpen && (
        <TopupFlow
          onClose={() => setTopupOpen(false)}
          onDeposited={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
