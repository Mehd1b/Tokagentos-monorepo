/**
 * x402 · Wallet connect bar — inline funding-wallet status.
 *
 * Shows a "Connect wallet" affordance when no address is set (calls the injected
 * wallet via eip712.connectWallet and lifts the address up via onConnect), or the
 * connected address as a chip when set. Self-contained: window.ethereum only (via
 * ../eip712), no ethers / app-core imports.
 */
import { useCallback, useState } from "react";
import { connectWallet, hasInjectedWallet } from "../eip712";

/** Shorten an EVM address to 0x1234…cdef. */
function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export function WalletConnectBar({
  address,
  onConnect,
}: {
  address: string | null;
  onConnect: (a: string) => void;
}) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const walletPresent = hasInjectedWallet();

  const onClick = useCallback(async () => {
    if (connecting) return;
    setConnecting(true);
    setError(null);
    try {
      const addr = await connectWallet();
      onConnect(addr);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect wallet.");
    } finally {
      setConnecting(false);
    }
  }, [connecting, onConnect]);

  if (address) {
    return (
      <span
        className="chip ok"
        style={{ display: "inline-flex", alignItems: "center", gap: 7 }}
        title={address}
      >
        <span
          className="dot-pulse"
          style={{
            background: "var(--ok-bright)",
            boxShadow: "0 0 6px var(--ok-bright)",
          }}
        />
        <span className="mono">{shortAddr(address)}</span>
      </span>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        className="btn btn-gold btn-sm"
        onClick={onClick}
        disabled={connecting || !walletPresent}
      >
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
      {!walletPresent && (
        <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
          No Web3 wallet detected
        </span>
      )}
      {error && (
        <span
          className="mono"
          style={{ fontSize: 11, color: "var(--gold-hi)" }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
