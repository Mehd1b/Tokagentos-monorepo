/**
 * x402 · API keys — HMAC key list for headless agents.
 * Ported from handoff_app/prototype/components/X402Lower.jsx (ApiKeys).
 *
 * Live: lists / mints / revokes real keys via /v1/keys; falls back to mock data
 * when the gateway is unavailable or the caller is unauthenticated. The list
 * endpoint never returns the secret (shown once on mint), so the displayed
 * value is a stable masked label derived from the key id.
 *
 * Mint flow: the user names the key, then on mint the one-time plaintext secret
 * (sk-ai-…) is captured and shown ONCE in a reveal panel with a copy button and
 * a "store it now" warning. The secret is held only in component state (never
 * persisted) and is wiped when the panel is dismissed.
 *
 * Revoke flow: a two-step inline confirm (no window.confirm) — the row's Revoke
 * button flips to a "Confirm" / "Cancel" pair before the DELETE fires.
 */
import { useCallback, useState } from "react";
import {
  apiKeyRowToEntry,
  fetchApiKeys,
  mintApiKey,
  revokeApiKey,
  useLive,
} from "../client-billing";
import { API_KEYS, type ApiKeyEntry } from "../mock";

type KeyRow = ApiKeyEntry & { id?: string };

/** The one-time secret returned by mint — held in state only, never persisted. */
type MintedKey = { id: string; name: string; key: string };

export function ApiKeys({ keys = API_KEYS }: { keys?: ApiKeyEntry[] } = {}) {
  const keysFetcher = useCallback(() => fetchApiKeys(), []);
  const { data, live: isLive, reload } = useLive(keysFetcher);
  const shownKeys: KeyRow[] = data ? data.map(apiKeyRowToEntry) : keys;

  const [name, setName] = useState("");
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState<string | null>(null);

  // The freshly-minted secret to reveal once. Cleared (wiped) on dismiss.
  const [minted, setMinted] = useState<MintedKey | null>(null);
  const [copied, setCopied] = useState(false);

  // Row id awaiting revoke confirmation (inline two-step, no window.confirm).
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const onMint = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || minting) return;
    setMinting(true);
    setMintError(null);
    try {
      const res = await mintApiKey(trimmed);
      // Capture the one-time plaintext secret to reveal once. The list endpoint
      // never returns it again, so this is the only chance to show it.
      setMinted({ id: res.id, name: res.name, key: res.key });
      setCopied(false);
      setName("");
      reload();
    } catch {
      // unauthenticated / gateway unavailable — keep the mock view, surface a hint.
      setMintError("Mint failed — sign in to the gateway to issue real keys.");
    } finally {
      setMinting(false);
    }
  }, [name, minting, reload]);

  const onCopy = useCallback(async () => {
    if (!minted) return;
    try {
      await navigator.clipboard.writeText(minted.key);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [minted]);

  // Dismiss wipes the secret from state — it is never stored anywhere else.
  const dismissReveal = useCallback(() => {
    setMinted(null);
    setCopied(false);
  }, []);

  const onRevoke = useCallback(
    async (id?: string) => {
      if (!id) return;
      setRevokingId(id);
      try {
        await revokeApiKey(id);
        reload();
      } catch {
        /* ignore — keep current view */
      } finally {
        setRevokingId(null);
        setConfirmId(null);
      }
    },
    [reload],
  );

  return (
    <>
      <div className="sec-head">
        <div>
          <div className="sec-title">
            <span className="num">KEY</span> API keys
          </div>
          <div className="sec-sub">
            HMAC keys (sk-ai-*) authenticate headless agents to the gateway.
            Stateless — ideal for daemons.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isLive ? (
            <span className="chip ok">live</span>
          ) : (
            <span className="chip mute">⟩ example values</span>
          )}
          <div
            className="amount-field"
            style={{ height: 30, padding: "0 4px 0 12px", gap: 6 }}
          >
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (mintError) setMintError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onMint();
              }}
              placeholder="name this key…"
              aria-label="API key name"
              maxLength={48}
              disabled={minting}
              style={{ fontSize: 12, height: 28 }}
            />
            <button
              type="button"
              className="btn btn-gold btn-sm"
              onClick={onMint}
              disabled={minting || name.trim().length === 0}
            >
              {minting ? "Minting…" : "+ Mint key"}
            </button>
          </div>
        </div>
      </div>

      {/* One-time secret reveal — shown ONCE, never persisted. */}
      {minted && (
        <div
          className="card accent"
          style={{ marginBottom: 14, position: "relative" }}
        >
          <button
            type="button"
            aria-label="Dismiss"
            onClick={dismissReveal}
            className="btn btn-ghost btn-sm"
            style={{ position: "absolute", top: 12, right: 12 }}
          >
            ✕
          </button>
          <div className="card-label">
            <span style={{ color: "var(--gold)" }}>◆</span> Key minted ·{" "}
            {minted.name}
          </div>
          <div
            style={{
              fontSize: 12.5,
              color: "var(--gold-hi)",
              marginBottom: 12,
              paddingRight: 36,
            }}
          >
            Copy this secret now — it is shown <strong>once</strong> and never
            displayed again. Store it somewhere safe.
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "var(--jet-black)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-sm)",
              padding: "10px 12px",
            }}
          >
            <code
              className="mono"
              style={{
                flex: 1,
                fontSize: 12,
                color: "var(--text-strong)",
                wordBreak: "break-all",
                lineHeight: 1.45,
              }}
            >
              {minted.key}
            </code>
            <button
              type="button"
              className={`btn btn-sm ${copied ? "btn-ghost" : "btn-gold"}`}
              onClick={onCopy}
              style={{ flexShrink: 0 }}
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {mintError && (
        <div
          style={{
            marginBottom: 14,
            padding: "8px 12px",
            borderRadius: "var(--radius-sm)",
            background: "rgba(243,186,47,0.10)",
            border: "1px solid var(--border-strong)",
            fontSize: 12,
            color: "var(--gold-hi)",
          }}
        >
          {mintError}
        </div>
      )}

      <div className="card keys-card">
        {shownKeys.map((k) => {
          const pending = k.id != null && confirmId === k.id;
          const isRevoking = k.id != null && revokingId === k.id;
          return (
            <div key={k.id ?? k.val} className="key-row">
              <div className="key-icon">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
              </div>
              <div className="key-main">
                <div className="key-name">
                  {k.name}{" "}
                  {k.live && (
                    <span className="chip ok" style={{ marginLeft: 6 }}>
                      active
                    </span>
                  )}
                </div>
                <div className="key-val">{k.val}</div>
              </div>
              <div className="key-meta">{k.meta}</div>
              {pending ? (
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    type="button"
                    className="btn btn-gold btn-sm"
                    onClick={() => onRevoke(k.id)}
                    disabled={isRevoking}
                  >
                    {isRevoking ? "Revoking…" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setConfirmId(null)}
                    disabled={isRevoking}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => k.id != null && setConfirmId(k.id)}
                  disabled={k.id == null}
                  title={
                    k.id == null
                      ? "Sign in to the gateway to revoke real keys"
                      : undefined
                  }
                  style={{ flexShrink: 0 }}
                >
                  Revoke
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
