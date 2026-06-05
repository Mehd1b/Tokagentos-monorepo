/**
 * x402 page — top-up credits + agent-to-agent network. The centerpiece.
 *
 * Page composition only: the page head plus the five x402 sub-sections, each a
 * separate component under ../x402. AgentNetwork renders SettlementFeed itself,
 * so it is NOT composed here. Ported from
 * handoff_app/prototype/components/X402Page.jsx (X402Page).
 */
import { AgentNetwork } from "../x402/AgentNetwork";
import { ApiKeys } from "../x402/ApiKeys";
import { ServiceDirectory } from "../x402/ServiceDirectory";
import { TopUpPanel } from "../x402/TopUpPanel";
import { UsageChart } from "../x402/UsageChart";

export function X402Page() {
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
            <button type="button" className="btn btn-gold">
              Top up
            </button>
          </div>
        </div>

        <TopUpPanel />

        <AgentNetwork />

        <ServiceDirectory />

        <UsageChart />

        <ApiKeys />
      </div>
    </div>
  );
}
