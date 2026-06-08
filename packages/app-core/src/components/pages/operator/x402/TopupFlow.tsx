/**
 * Native EIP-3009 top-up flow for the operator x402 page.
 *
 * Replaces the borrowed billing BillingPageView/TopupView: amount + chain →
 * POST /v1/topup/quote → eth_signTypedData_v4 (window.ethereum, no ethers) →
 * POST /v1/topup/settle, all self-contained so it ships into the scaffold.
 * Rendered INSIDE .op-root (no portal) so operator.css applies. The modal is a
 * fixed overlay; the panel uses the operator's card/btn/chip classes.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchTopupQuote,
  type SettleOutcome,
  settleTopup,
  type TopupQuote,
} from "../client-billing";
import {
  connectWallet,
  formatAttoPtonAmount,
  hasInjectedWallet,
  SignatureRejectedError,
  signTransferWithAuthorization,
  switchWalletChain,
  TOPUP_CHAINS,
  topupIdToNonce,
  walletChainId,
} from "../eip712";

const PRESETS = ["10", "25", "100", "250"];
const CHAIN_IDS = [8453, 1] as const;
type Phase = "idle" | "quoting" | "ready" | "depositing" | "done" | "error";

export function TopupFlow({
  onClose,
  onDeposited,
}: {
  onClose: () => void;
  onDeposited?: () => void;
}) {
  const [amountUsd, setAmountUsd] = useState("25");
  const [chainId, setChainId] = useState<number>(8453);
  const [quote, setQuote] = useState<TopupQuote | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [secsLeft, setSecsLeft] = useState(0);
  const [requoteNonce, setRequoteNonce] = useState(0);

  const walletPresent = hasInjectedWallet();
  const busy = phase === "depositing";

  // Esc to close (unless mid-deposit).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  // Debounced quote on amount/chain change (not while depositing/done).
  const quoteSeq = useRef(0);
  useEffect(() => {
    if (phase === "depositing" || phase === "done") return;
    const usd = Number.parseFloat(amountUsd);
    if (!Number.isFinite(usd) || usd <= 0) {
      setQuote(null);
      setPhase("idle");
      return;
    }
    const seq = ++quoteSeq.current;
    setPhase("quoting");
    setError(null);
    const t = setTimeout(() => {
      fetchTopupQuote(usd, chainId)
        .then((q) => {
          if (seq === quoteSeq.current) {
            setQuote(q);
            setPhase("ready");
          }
        })
        .catch((e) => {
          if (seq === quoteSeq.current) {
            setQuote(null);
            setPhase("error");
            setError(e instanceof Error ? e.message : "Quote failed.");
          }
        });
    }, 400);
    return () => clearTimeout(t);
    // phase intentionally omitted to avoid re-quoting on every transition;
    // requoteNonce lets the expired-quote "Refresh" button force a re-quote.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see comment
  }, [amountUsd, chainId, requoteNonce]);

  // Quote expiry countdown.
  useEffect(() => {
    if (!quote) return;
    const tick = () =>
      setSecsLeft(
        Math.max(
          0,
          Math.floor((new Date(quote.expiresAt).getTime() - Date.now()) / 1000),
        ),
      );
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [quote]);

  const expired = quote != null && secsLeft <= 0 && phase !== "done";
  const ptonOut = quote ? formatAttoPtonAmount(BigInt(quote.amountPton)) : "—";

  const onDeposit = useCallback(async () => {
    if (!quote || expired) return;
    setPhase("depositing");
    setError(null);
    setTxHash(null);
    try {
      const address = await connectWallet();
      const current = await walletChainId();
      if (current !== quote.chainId) await switchWalletChain(quote.chainId);
      const { signature, authorization } = await signTransferWithAuthorization({
        address,
        domain: quote.domain,
        to: quote.vaultAddress,
        valueAttoPton: quote.amountPton,
        nonceHex: topupIdToNonce(quote.topupId),
      });
      const outcome: SettleOutcome = await settleTopup(
        quote.topupId,
        quote.chainId,
        authorization,
        signature,
      );
      if (outcome.ok) {
        setTxHash(outcome.txHash ?? null);
        setPhase("done");
        onDeposited?.();
      } else {
        setError(outcome.error ?? "Settlement failed.");
        setPhase("error");
      }
    } catch (e) {
      setError(
        e instanceof SignatureRejectedError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Deposit failed.",
      );
      setPhase("error");
    }
  }, [quote, expired, onDeposited]);

  const explorer =
    chainId === 1 ? "https://etherscan.io/tx/" : "https://basescan.org/tx/";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Top up credits"
      onClick={() => !busy && onClose()}
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
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(460px, 96vw)", position: "relative" }}
      >
        <button
          type="button"
          aria-label="Close"
          onClick={() => !busy && onClose()}
          className="btn btn-ghost"
          style={{
            position: "absolute",
            top: 12,
            right: 12,
            padding: "4px 10px",
          }}
        >
          ✕
        </button>

        <div className="card-label">
          <span style={{ color: "var(--gold)" }}>◆</span> Top up · swap → PTON
        </div>

        {phase === "done" ? (
          <div style={{ padding: "12px 0" }}>
            <div
              className="chip ok"
              style={{ display: "inline-flex", marginBottom: 12 }}
            >
              ✓ credited
            </div>
            <div
              style={{
                fontSize: 22,
                color: "var(--text-strong)",
                fontWeight: 600,
              }}
            >
              +{ptonOut}{" "}
              <em style={{ fontStyle: "normal", color: "var(--muted)" }}>
                PTON
              </em>
            </div>
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)" }}>
              {txHash ? (
                <a
                  href={`${explorer}${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  view transaction ↗
                </a>
              ) : (
                "settled on-chain"
              )}
            </div>
            <button
              type="button"
              className="btn btn-gold btn-lg"
              style={{ marginTop: 16, width: "100%" }}
              onClick={onClose}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Chain selector */}
            <div className="topup-tokens" style={{ marginTop: 8 }}>
              {CHAIN_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  className={`token-btn ${chainId === id ? "is-active" : ""}`}
                  onClick={() => setChainId(id)}
                  disabled={busy}
                >
                  <span className="token-sym">{TOPUP_CHAINS[id]?.name}</span>
                </button>
              ))}
            </div>

            {/* Amount */}
            <div className="amount-field" style={{ marginTop: 12 }}>
              <input
                value={amountUsd}
                onChange={(e) =>
                  setAmountUsd(e.target.value.replace(/[^0-9.]/g, ""))
                }
                placeholder="0.00"
                inputMode="decimal"
                disabled={busy}
              />
              <span className="suffix">USD</span>
            </div>
            <div className="amount-presets">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="preset"
                  onClick={() => setAmountUsd(p)}
                  disabled={busy}
                >
                  ${p}
                </button>
              ))}
            </div>

            {/* Quote */}
            <div
              className="swap-meta"
              style={{
                marginTop: 14,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <div className="swap-out">
                <div className="k">you receive</div>
                <div className="v">
                  {phase === "quoting" ? "…" : ptonOut} PTON
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  className="mono"
                  style={{
                    fontSize: 10,
                    color: "var(--muted)",
                    textTransform: "uppercase",
                  }}
                >
                  quote
                </div>
                <div
                  className="mono"
                  style={{
                    fontSize: 13,
                    color: expired ? "var(--gold-hi)" : "var(--silver)",
                  }}
                >
                  {quote
                    ? expired
                      ? "expired"
                      : `${Math.floor(secsLeft / 60)}:${(secsLeft % 60).toString().padStart(2, "0")}`
                    : "—"}
                </div>
              </div>
            </div>

            {error && (
              <div
                style={{
                  marginTop: 12,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "rgba(243,186,47,0.10)",
                  border: "1px solid var(--border-strong)",
                  fontSize: 12,
                  color: "var(--gold-hi)",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="button"
              className="btn btn-gold btn-lg"
              style={{ marginTop: 14, width: "100%" }}
              onClick={
                expired ? () => setRequoteNonce((n) => n + 1) : onDeposit
              }
              disabled={busy || !quote || phase === "quoting"}
            >
              {!walletPresent
                ? "Connect a Web3 wallet to deposit"
                : busy
                  ? "Signing & settling…"
                  : expired
                    ? "Refresh quote"
                    : `Deposit $${amountUsd || "0"} → PTON`}
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
          </>
        )}
      </div>
    </div>
  );
}
