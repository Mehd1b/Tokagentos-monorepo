/**
 * x402 · API keys — HMAC key list for headless agents.
 * Ported from handoff_app/prototype/components/X402Lower.jsx (ApiKeys).
 */
import { API_KEYS, type ApiKeyEntry } from "../mock";

export function ApiKeys({ keys = API_KEYS }: { keys?: ApiKeyEntry[] } = {}) {
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
        <button type="button" className="btn btn-gold btn-sm">
          + Mint key
        </button>
      </div>

      <div className="card keys-card">
        {keys.map((k) => (
          <div key={k.val} className="key-row">
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
            <button type="button" className="btn btn-ghost btn-sm">
              Revoke
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
