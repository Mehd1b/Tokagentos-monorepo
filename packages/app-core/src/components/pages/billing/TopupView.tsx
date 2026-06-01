/**
 * TopupView — EIP-3009 sign + settle top-up flow.
 *
 * Flow (Decision Z41):
 *   1. User enters USD amount → POST /v1/topup/quote (returns amounts + EIP-712 domain inline)
 *   2. UI builds EIP-3009 TransferWithAuthorization typed data using quote.domain
 *   3. User's ethers v6 signer signs via signer.signTypedData(domain, types, message)
 *   4. UI decomposes signature → POST /v1/topup/settle { topupId, signature: {v,r,s} }
 *
 * Note: The backend's POST /v1/topup/quote handler (topup-routes.ts:223-231) embeds
 * the EIP-712 domain in its response, so a separate GET /v1/topup/info call is unnecessary.
 * This saves one round-trip per top-up.
 *
 * Uses ethers v6 (existing dep — Decision Z39). No wagmi / viem added.
 */

import {
  Badge,
  Banner,
  Button,
  CopyButton,
  Input,
  PagePanel,
  SegmentedControl,
} from "@tokagentos/ui";
import type { BrowserProvider, Eip1193Provider, JsonRpcSigner } from "ethers";
import { useCallback, useEffect, useState } from "react";
import {
  buildTransferWithAuthMessage,
  decomposeSignature,
  formatAttoPton,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
  topupIdToNonce,
} from "./eip712-utils.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TopupInfo {
  chainId: number;
  vaultAddress: `0x${string}`;
  ptonAddress: `0x${string}`;
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: `0x${string}`;
  };
}

interface QuoteResult {
  topupId: string;
  chainId: number;
  amountPton: string;
  amountUsd: number;
  tonUsd: number;
  expiresAt: string;
  vaultAddress: `0x${string}`;
  ptonAddress: `0x${string}`;
  domain: TopupInfo["domain"];
}

interface SettleResult {
  txHash: string;
  ok: boolean;
}

// ---------------------------------------------------------------------------
// Chain selector
// ---------------------------------------------------------------------------

/** Base = 8453 (default/live), Ethereum = 1. */
type SupportedChainId = 8453 | 1;

/**
 * The SegmentedControl component is generic over `T extends string`, so its
 * option values are the stringified chain ids. We map back to numeric ids at
 * the boundary (`numericChainId`) for all wallet / backend interactions.
 */
type ChainIdString = "8453" | "1";

const CHAINS: Record<
  SupportedChainId,
  { name: string; short: string; hex: `0x${string}` }
> = {
  8453: { name: "Base", short: "Base", hex: "0x2105" },
  1: { name: "Ethereum", short: "Ethereum", hex: "0x1" },
};

function numericChainId(id: ChainIdString): SupportedChainId {
  return id === "1" ? 1 : 8453;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function secondsRemaining(expiresAt: string): number {
  return Math.max(
    0,
    Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000),
  );
}

function fmtCountdown(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Truncate an address to `0x1234…cdef` for display. */
function truncAddr(a?: string): string {
  return a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : (a ?? "—");
}

/**
 * Obtain an ethers v6 signer from window.ethereum.
 * Returns null with an error message if no injected wallet is available.
 */
async function getEthersSigner(): Promise<
  { signer: JsonRpcSigner; address: string } | { error: string }
> {
  const { ethers } = await import("ethers");
  const ethereum = (window as unknown as { ethereum?: Eip1193Provider })
    .ethereum;
  if (!ethereum) {
    return {
      error:
        "No Web3 wallet detected. Install MetaMask or another browser wallet.",
    };
  }
  try {
    const provider: BrowserProvider = new ethers.BrowserProvider(ethereum);
    const signer: JsonRpcSigner = await provider.getSigner();
    const address = await signer.getAddress();
    return { signer, address };
  } catch (err) {
    return {
      error:
        err instanceof Error ? err.message : "Could not connect to wallet.",
    };
  }
}

// ---------------------------------------------------------------------------
// Countdown component
// ---------------------------------------------------------------------------

function Countdown({ expiresAt }: { expiresAt: string }) {
  const [secs, setSecs] = useState(() => secondsRemaining(expiresAt));

  useEffect(() => {
    const id = setInterval(() => {
      setSecs(secondsRemaining(expiresAt));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (secs <= 0)
    return <span className="text-danger font-semibold">Expired</span>;
  return (
    <span className={secs < 60 ? "text-warn font-semibold" : "text-muted"}>
      {fmtCountdown(secs)} remaining
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TopupView(): React.ReactElement {
  // Quote state
  const [amountUsd, setAmountUsd] = useState("10");
  const [quoting, setQuoting] = useState(false);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Settle state
  const [settling, setSettling] = useState(false);
  const [settleResult, setSettleResult] = useState<SettleResult | null>(null);
  const [settleError, setSettleError] = useState<string | null>(null);

  // Chain selector state
  const [selectedChainId, setSelectedChainId] =
    useState<SupportedChainId>(8453); // Base default (live deployment)
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [switching, setSwitching] = useState(false);

  // Derived
  const selectedChain = CHAINS[selectedChainId];
  const chainMatched = walletChainId === selectedChainId;

  // Check if quote is expired
  const quoteExpired =
    quote !== null && secondsRemaining(quote.expiresAt) === 0;

  // ---------------------------------------------------------------------------
  // Wallet network detection — read chainId on mount + keep fresh on change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
    if (!eth) return;
    const requestable = eth as unknown as {
      request: (a: { method: string }) => Promise<unknown>;
    };
    const read = async () => {
      try {
        const id = await requestable.request({ method: "eth_chainId" });
        if (typeof id === "string") setWalletChainId(Number.parseInt(id, 16));
      } catch {
        // wallet not connected yet — leave null
      }
    };
    void read();
    const onChainChanged = (id: unknown) => {
      if (typeof id === "string") setWalletChainId(Number.parseInt(id, 16));
    };
    const evented = eth as unknown as {
      on?: (e: string, cb: (id: unknown) => void) => void;
      removeListener?: (e: string, cb: (id: unknown) => void) => void;
    };
    evented.on?.("chainChanged", onChainChanged);
    return () => {
      evented.removeListener?.("chainChanged", onChainChanged);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Chain selection — switching chain tears down any in-progress quote/settle
  // ---------------------------------------------------------------------------

  const handleChainChange = useCallback(
    (next: ChainIdString) => {
      const nextId = numericChainId(next);
      if (nextId === selectedChainId) return;
      setSelectedChainId(nextId);
      // A quote is bound to one chain's domain/vault — reset the whole flow.
      setQuote(null);
      setQuoteError(null);
      setSettleResult(null);
      setSettleError(null);
    },
    [selectedChainId],
  );

  // ---------------------------------------------------------------------------
  // Wallet network switch (wallet_switchEthereumChain, add Base if missing)
  // ---------------------------------------------------------------------------

  const handleSwitchChain = useCallback(async () => {
    const eth = (window as unknown as { ethereum?: Eip1193Provider })
      .ethereum as
      | {
          request: (a: {
            method: string;
            params?: unknown[];
          }) => Promise<unknown>;
        }
      | undefined;
    if (!eth) return;
    setSwitching(true);
    try {
      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: selectedChain.hex }],
        });
      } catch (err) {
        // 4902 = chain not added to the wallet. For Base, add it then retry.
        const code = (err as { code?: number } | null)?.code;
        if (code === 4902 && selectedChainId === 8453) {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: CHAINS[8453].hex,
                chainName: "Base",
                nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: ["https://mainnet.base.org"],
                blockExplorerUrls: ["https://basescan.org"],
              },
            ],
          });
          await eth.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: selectedChain.hex }],
          });
        } else {
          throw err;
        }
      }
      setWalletChainId(selectedChainId); // optimistic; chainChanged will also fire
    } catch {
      // user rejected, or switch/add failed — leave walletChainId unchanged
    } finally {
      setSwitching(false);
    }
  }, [selectedChain.hex, selectedChainId]);

  // ---------------------------------------------------------------------------
  // Get quote
  // ---------------------------------------------------------------------------

  const handleGetQuote = useCallback(async () => {
    const usdVal = parseFloat(amountUsd);
    if (!Number.isFinite(usdVal) || usdVal <= 0) {
      setQuoteError("Enter a positive USD amount.");
      return;
    }
    setQuoting(true);
    setQuoteError(null);
    setQuote(null);
    setSettleResult(null);
    setSettleError(null);
    try {
      const res = await fetch("/v1/topup/quote", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountUsd: usdVal, chainId: selectedChainId }),
      });
      if (res.status === 401) {
        setQuoteError("Sign in before getting a top-up quote.");
        return;
      }
      if (res.status === 503) {
        setQuoteError(
          "Price oracle unavailable — no fresh TON/USD price. Try again shortly.",
        );
        return;
      }
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setQuoteError(json.error ?? `Unexpected error (${res.status}).`);
        return;
      }
      const json = (await res.json()) as QuoteResult;
      setQuote(json);
    } catch {
      setQuoteError("Network error — could not fetch quote.");
    } finally {
      setQuoting(false);
    }
  }, [amountUsd, selectedChainId]);

  // ---------------------------------------------------------------------------
  // Sign + settle
  // ---------------------------------------------------------------------------

  const handleSettle = useCallback(async () => {
    if (!quote || quoteExpired || !chainMatched) return;

    setSettling(true);
    setSettleError(null);
    setSettleResult(null);

    try {
      // 1. Get ethers signer
      const signerResult = await getEthersSigner();
      if ("error" in signerResult) {
        setSettleError(signerResult.error);
        return;
      }
      const { signer, address } = signerResult;

      // 2. Fetch domain info (may have been loaded with quote but fetch fresh to be safe)
      const domain = quote.domain;

      // 3. Build the EIP-3009 typed data
      const nonce = topupIdToNonce(quote.topupId);
      const now = Math.floor(Date.now() / 1000);
      const validBefore = now + 3600; // 1-hour window

      const message = buildTransferWithAuthMessage({
        from: address as `0x${string}`,
        to: quote.vaultAddress,
        valueAttoPton: BigInt(quote.amountPton),
        validAfterUnix: 0,
        validBeforeUnix: validBefore,
        nonceHex: nonce,
      });

      // 4. Sign with ethers v6
      let rawSig: string;
      try {
        rawSig = await signer.signTypedData(
          domain,
          TRANSFER_WITH_AUTHORIZATION_TYPES,
          message,
        );
      } catch (err) {
        if (
          err instanceof Error &&
          (err.message.includes("rejected") ||
            err.message.includes("denied") ||
            err.message.includes("cancelled") ||
            err.message.includes("ACTION_REJECTED"))
        ) {
          setSettleError("Signing rejected — no transaction was sent.");
        } else {
          setSettleError(
            err instanceof Error
              ? err.message
              : "Signing failed — unknown error.",
          );
        }
        return;
      }

      // 5. Decompose signature
      let sig: { v: number; r: `0x${string}`; s: `0x${string}` };
      try {
        sig = decomposeSignature(rawSig);
      } catch (err) {
        setSettleError(
          `Signature decomposition failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        return;
      }

      // 6. POST /v1/topup/settle
      const res = await fetch("/v1/topup/settle", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topupId: quote.topupId,
          chainId: quote.chainId,
          signature: sig,
        }),
      });

      if (res.status === 402) {
        setSettleError(
          "EIP-3009 signature verification failed. Ensure you signed with the correct wallet.",
        );
        return;
      }
      if (res.status === 409) {
        const json = (await res.json().catch(() => ({}))) as {
          txHash?: string;
        };
        setSettleError(
          `Quote already settled${json.txHash ? ` (tx: ${json.txHash.slice(0, 14)}…)` : ""}. Check your credit balance.`,
        );
        return;
      }
      if (res.status === 429) {
        setSettleError("Rate limit exceeded on settle path. Try again later.");
        return;
      }
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setSettleError(json.error ?? `Unexpected error (${res.status}).`);
        return;
      }

      const result = (await res.json()) as SettleResult;
      setSettleResult(result);
      setQuote(null); // clear quote — it's consumed
    } catch {
      setSettleError("Network error during settle.");
    } finally {
      setSettling(false);
    }
  }, [quote, quoteExpired, chainMatched]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 px-3 py-4 xl:px-5 xl:py-6">
      {/* Header */}
      <div>
        <div className="text-xs-tight font-semibold uppercase tracking-[0.16em] text-muted/70">
          Billing
        </div>
        <div className="mt-1 text-xl font-semibold text-txt">Top Up</div>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Deposit PTON credits via an EIP-3009 signed transfer. Your browser
          wallet must hold enough PTON on the configured network.
        </p>
      </div>

      {/* ── Chain selector ─────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="text-xs-tight font-semibold uppercase tracking-[0.16em] text-muted/70">
          Payment network
        </div>

        <SegmentedControl<ChainIdString>
          value={String(selectedChainId) as ChainIdString}
          onValueChange={handleChainChange}
          aria-label="Select payment network"
          items={[
            { value: "1", label: "Ethereum", testId: "chain-ethereum" },
            {
              value: "8453",
              label: "Base",
              testId: "chain-base",
              badge: (
                <Badge
                  variant="secondary"
                  className="ml-1 h-4 rounded-full px-1.5 py-0 text-[10px] font-semibold text-ok"
                >
                  Live
                </Badge>
              ),
            },
          ]}
        />

        {/* Network-mismatch banner */}
        {walletChainId !== null && !chainMatched ? (
          <Banner
            variant="warning"
            className="rounded-xl"
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleSwitchChain()}
                disabled={switching}
                className="h-7 shrink-0 rounded-full px-3 text-2xs font-semibold"
              >
                {switching ? "Switching…" : `Switch to ${selectedChain.short}`}
              </Button>
            }
          >
            Your wallet is on{" "}
            <span className="font-semibold">
              {CHAINS[walletChainId as SupportedChainId]?.name ??
                `chain ${walletChainId}`}
            </span>
            . Switch to{" "}
            <span className="font-semibold">{selectedChain.name}</span> to top
            up.
          </Banner>
        ) : null}

        {/* Matched confirmation */}
        {walletChainId !== null && chainMatched ? (
          <div className="flex items-center gap-1.5 text-2xs text-ok">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full bg-ok"
            />
            Wallet connected on {selectedChain.name}.
          </div>
        ) : null}

        {/* Selected-chain context panel */}
        <PagePanel variant="inset" className="px-4 py-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs-tight font-semibold uppercase tracking-[0.16em] text-muted/70">
              Network
            </span>
            <span className="text-xs tabular-nums text-txt">
              {selectedChain.name}
              <span className="text-muted">
                {" "}
                · chainId {quote?.chainId ?? selectedChainId}
              </span>
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-border/30 pt-2">
            <span className="text-xs text-muted">PTON token</span>
            <span className="flex items-center gap-1">
              <span className="font-mono text-xs text-txt">
                {truncAddr(quote?.ptonAddress)}
              </span>
              {quote?.ptonAddress ? (
                <CopyButton
                  value={quote.ptonAddress}
                  copyLabel="Copy PTON token address"
                />
              ) : null}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted">Vault</span>
            <span className="flex items-center gap-1">
              <span className="font-mono text-xs text-txt">
                {truncAddr(quote?.vaultAddress)}
              </span>
              {quote?.vaultAddress ? (
                <CopyButton
                  value={quote.vaultAddress}
                  copyLabel="Copy vault address"
                />
              ) : null}
            </span>
          </div>
        </PagePanel>

        {/* Base: how to obtain PTON */}
        {selectedChainId === 8453 ? (
          <PagePanel variant="inset" className="px-4 py-3">
            <div className="text-xs text-muted space-y-1">
              <div className="font-semibold text-txt text-xs-tight">
                Getting PTON on Base
              </div>
              <div>
                Base has no canonical TON, so you mint and wrap it yourself
                before topping up:
              </div>
              <div>
                1. Call <code className="font-mono text-txt">TON.faucet()</code>{" "}
                to mint test TON to your wallet.
              </div>
              <div>
                2. Call{" "}
                <code className="font-mono text-txt">PTON.deposit()</code> to
                wrap your TON into PTON.
              </div>
              <div className="text-2xs text-muted/70 pt-0.5">
                On Ethereum, canonical TON/PTON is already available — no faucet
                needed.
              </div>
            </div>
          </PagePanel>
        ) : null}
      </div>

      {/* Success banner */}
      {settleResult ? (
        <PagePanel variant="section" className="border-ok/30 bg-ok/5 p-5">
          <div className="text-sm font-semibold text-ok">
            Top-up submitted on-chain!
          </div>
          <div className="mt-1 text-xs text-muted break-all">
            Transaction hash:{" "}
            <span className="font-mono text-txt">{settleResult.txHash}</span>
          </div>
          <div className="mt-2 text-xs text-muted">
            Your credit balance will update once the transaction is confirmed.
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettleResult(null)}
            className="mt-3 h-7 rounded-full px-2.5 text-2xs font-semibold"
          >
            New top-up
          </Button>
        </PagePanel>
      ) : null}

      {/* Quote section */}
      {!settleResult ? (
        <PagePanel variant="section" className="p-5 space-y-4">
          <div className="text-sm font-semibold text-txt">
            Step 1 — Get a quote
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-3 flex items-center text-muted text-sm pointer-events-none">
                $
              </span>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleGetQuote();
                }}
                placeholder="10.00"
                disabled={quoting}
                className="h-9 rounded-xl pl-7 pr-3 text-sm"
              />
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => void handleGetQuote()}
              disabled={quoting}
              className="h-9 rounded-xl px-4 text-sm font-semibold"
            >
              {quoting ? "Quoting…" : "Get Quote"}
            </Button>
          </div>

          {quoteError ? (
            <div className="text-xs text-danger">{quoteError}</div>
          ) : null}

          {quote ? (
            <PagePanel variant="inset" className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">Amount (PTON)</span>
                <span className="text-sm font-semibold tabular-nums text-txt">
                  {formatAttoPton(BigInt(quote.amountPton))} PTON
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">USD equivalent</span>
                <span className="text-sm font-semibold tabular-nums text-txt">
                  ${quote.amountUsd.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted">TON/USD rate</span>
                <span className="text-sm tabular-nums text-txt">
                  ${quote.tonUsd.toFixed(4)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-border/30 pt-2">
                <span className="text-xs text-muted">Quote expires</span>
                <span className="text-xs">
                  <Countdown expiresAt={quote.expiresAt} />
                </span>
              </div>
            </PagePanel>
          ) : null}
        </PagePanel>
      ) : null}

      {/* Sign + settle section */}
      {!settleResult ? (
        <PagePanel variant="section" className="p-5 space-y-4">
          <div className="text-sm font-semibold text-txt">
            Step 2 — Sign & settle
          </div>
          <p className="text-xs text-muted">
            Clicking &ldquo;Top Up&rdquo; will open your browser wallet and ask
            you to sign an EIP-3009 off-chain authorization. No gas is required
            for signing — the server submits the on-chain transaction.
          </p>

          <Button
            variant="default"
            size="sm"
            onClick={() => void handleSettle()}
            disabled={settling || !quote || quoteExpired || !chainMatched}
            className="h-9 rounded-xl px-5 text-sm font-semibold"
          >
            {settling
              ? "Signing & settling…"
              : !quote
                ? "Get a quote first"
                : quoteExpired
                  ? "Quote expired — re-quote"
                  : !chainMatched
                    ? `Switch to ${selectedChain.short} to sign`
                    : "Top Up"}
          </Button>

          {settleError ? (
            <div className="text-xs text-danger">{settleError}</div>
          ) : null}

          {quoteExpired && quote ? (
            <div className="text-xs text-warn">
              Quote expired.{" "}
              <button
                type="button"
                className="underline text-accent"
                onClick={() => {
                  setQuote(null);
                  setSettleError(null);
                }}
              >
                Get a new quote
              </button>
            </div>
          ) : null}
        </PagePanel>
      ) : null}

      {/* Info panel */}
      <PagePanel variant="inset" className="px-4 py-3">
        <div className="text-xs text-muted space-y-1">
          <div className="font-semibold text-txt text-xs-tight">
            How it works
          </div>
          <div>
            1. The server computes how many PTON tokens equal your USD amount at
            the current TWAP rate.
          </div>
          <div>
            2. You sign an EIP-3009 <code>TransferWithAuthorization</code> typed
            message — no ETH gas required.
          </div>
          <div>
            3. The server calls <code>ClaudeVault.depositX402()</code> with your
            signed authorization, crediting your account.
          </div>
        </div>
      </PagePanel>
    </div>
  );
}
