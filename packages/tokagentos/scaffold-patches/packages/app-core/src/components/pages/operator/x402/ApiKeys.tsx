/**
 * x402 · API keys — HMAC key list for headless agents.
 * Ported from handoff_app/prototype/components/X402Lower.jsx (ApiKeys).
 *
 * Live: lists / mints / revokes real keys via /v1/keys; falls back to mock data
 * when the gateway is unavailable or the caller is unauthenticated. The list
 * endpoint never returns the secret (shown once on mint), so the displayed
 * value is a stable masked label derived from the key id.
 */
import { useCallback } from "react";
import {
  apiKeyRowToEntry,
  fetchApiKeys,
  mintApiKey,
  revokeApiKey,
  useLive,
} from "../client-billing";
import { API_KEYS, type ApiKeyEntry } from "../mock";

type KeyRow = ApiKeyEntry & { id?: string };

export function ApiKeys({ keys = API_KEYS }: { keys?: ApiKeyEntry[] } = {}) {
  const keysFetcher = useCallback(() => fetchApiKeys(), []);
  const { data, live: isLive, reload } = useLive(keysFetcher);
  const shownKeys: KeyRow[] = data ? data.map(apiKeyRowToEntry) : keys;

  const onMint = useCallback(async () => {
    try {
      await mintApiKey("operator console");
      reload();
    } catch {
      /* unauthenticated / gateway unavailable — keep the mock view */
    }
  }, [reload]);

  const onRevoke = useCallback(
    async (id?: string) => {
      if (!id) return;
      try {
        await revokeApiKey(id);
        reload();
      } catch {
        /* ignore — keep current view */
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
          <button
            type="button"
            className="btn btn-gold btn-sm"
            onClick={onMint}
          >
            + Mint key
          </button>
        </div>
      </div>

      <div className="card keys-card">
        {shownKeys.map((k) => (
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
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => onRevoke(k.id)}
            >
              Revoke
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
