/**
 * x402 page — top-up credits + agent-to-agent network. The centerpiece.
 *
 * Page composition only: the page head plus the five x402 sub-sections, each a
 * separate component under ../x402. AgentNetwork renders SettlementFeed itself,
 * so it is NOT composed here. Ported from
 * handoff_app/prototype/components/X402Page.jsx (X402Page).
 *
 * Top-up reuses the existing, working billing page rather than reimplementing
 * the EIP-3009 deposit. `BillingPageView` is the sibling billing surface: in the
 * monorepo it's the React UI whose Top-up tab runs the real EIP-3009 sign+settle
 * (TopupView); in the published scaffold it's the same component name overlaid as
 * an iframe of the gateway's `/v1/billing/dashboard`. Either way "Top up" opens
 * the real deposit. Lazy so billing code isn't bundled until the modal opens.
 */
import { lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AgentNetwork } from "../x402/AgentNetwork";
import { ApiKeys } from "../x402/ApiKeys";
import { ServiceDirectory } from "../x402/ServiceDirectory";
import { TopUpPanel } from "../x402/TopUpPanel";
import { UsageChart } from "../x402/UsageChart";

const BillingPageView = lazy(() =>
  import("../../BillingPageView").then((m) => ({ default: m.BillingPageView })),
);

export function X402Page() {
  const [topupOpen, setTopupOpen] = useState(false);
  const openTopup = () => setTopupOpen(true);
  const closeTopup = () => setTopupOpen(false);

  useEffect(() => {
    if (!topupOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTopupOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [topupOpen]);

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

        <TopUpPanel onTopUp={openTopup} />

        <AgentNetwork />

        <ServiceDirectory />

        <UsageChart />

        <ApiKeys />
      </div>

      {topupOpen &&
        createPortal(
          // Rendered to document.body (outside .op-root) so the billing page
          // inherits the app's own theme tokens rather than the operator's
          // gold-on-jet palette.
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Top up credits"
            onClick={closeTopup}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 2000,
              background: "rgba(3, 3, 5, 0.72)",
              backdropFilter: "blur(2px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "relative",
                width: "min(1080px, 96vw)",
                height: "min(760px, 92vh)",
                background: "var(--bg, #0b0b0e)",
                color: "var(--text, #e6e6ea)",
                borderRadius: 14,
                overflow: "hidden",
                boxShadow: "0 24px 80px rgba(0, 0, 0, 0.6)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <button
                type="button"
                aria-label="Close top-up"
                onClick={closeTopup}
                style={{
                  position: "absolute",
                  top: 10,
                  right: 12,
                  zIndex: 2,
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  border: "1px solid rgba(255, 255, 255, 0.14)",
                  background: "rgba(255, 255, 255, 0.06)",
                  color: "inherit",
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
              {/* Flex column so a `flex:1` child (the scaffold's iframe
                  BillingPageView) gets a definite height instead of collapsing
                  to the ~150px iframe default; also gives the monorepo React
                  BillingPageView a real height so its internal scroll works. */}
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflow: "auto",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <Suspense
                  fallback={
                    <div
                      style={{ padding: 48, color: "var(--muted, #9a9aa4)" }}
                    >
                      Loading billing…
                    </div>
                  }
                >
                  <BillingPageView />
                </Suspense>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
