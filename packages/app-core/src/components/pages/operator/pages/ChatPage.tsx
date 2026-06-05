/**
 * Operator chat page — two-pane layout (thread rail + message stream + composer).
 * Ported from handoff_app/prototype/components/Pages.jsx (ChatPage).
 *
 * Thread list defaults to {@link CHAT_THREADS}; the action-card key/values default
 * to {@link CHAT_ACTION_KV}. The composer input is static (no send wiring yet).
 */
import { KeyMark } from "../brand/KeyMark";
import { CHAT_ACTION_KV, CHAT_THREADS, type ChatThread } from "../mock";

export function ChatPage({
  threads = CHAT_THREADS,
  actionKv = CHAT_ACTION_KV,
}: {
  threads?: ChatThread[];
  actionKv?: { k: string; v: string }[];
} = {}) {
  return (
    <div className="page" style={{ overflow: "hidden" }}>
      <div className="chat-layout">
        <div className="chat-rail">
          <button className="chat-new" type="button">
            ＋ New conversation
          </button>
          {threads.map((t) => (
            <div
              key={t.name}
              className={`chat-thread ${t.active ? "is-active" : ""}`}
            >
              <div className="chat-thread-name">{t.name}</div>
              <div className="chat-thread-time">{t.time}</div>
            </div>
          ))}
        </div>

        <div className="chat-main">
          <div className="chat-stream">
            <div className="chat-stream-inner">
              <div className="msg-block">
                <div className="msg-role">
                  <span className="av">🧑</span> you
                </div>
                <div className="msg-text user">
                  whats my aave health on polygon? top up usdc if it drops below
                  1.6
                </div>
              </div>

              <div className="msg-block">
                <div className="msg-role agent">
                  <span className="av">
                    <KeyMark size={14} />
                  </span>{" "}
                  treasurer · vault mode
                </div>
                <div className="msg-text">
                  Your Aave position on Polygon is healthy —{" "}
                  <strong style={{ color: "var(--text-strong)" }}>
                    health factor 1.84
                  </strong>
                  . You've supplied $284K USDC against $112K borrowed WETH. I've
                  set a watch: if HF drops below 1.6 I'll draft a vault
                  transaction to supply more USDC and surface it for your
                  approval.
                </div>

                <div className="action-card">
                  <div className="action-head">
                    <div className="action-glyph">🛡️</div>
                    <div style={{ flex: 1 }}>
                      <div className="action-name">
                        aave.read · getUserAccountData
                      </div>
                      <div className="action-sub">
                        plugin-tokagent-yield · polygon
                      </div>
                    </div>
                    <span className="chip ok">read · free</span>
                  </div>
                  <div className="action-body">
                    {actionKv.map((kv) => (
                      <div key={kv.k} className="action-kv">
                        <div className="k">{kv.k}</div>
                        <div className="v">{kv.v}</div>
                      </div>
                    ))}
                  </div>
                  <div className="action-foot">
                    <span
                      className="mono"
                      style={{ fontSize: 10, color: "var(--muted)" }}
                    >
                      ⟩ watch armed · trigger HF &lt; 1.6
                    </span>
                    <span className="chip mute">subscribed</span>
                  </div>
                </div>
              </div>

              <div className="msg-block">
                <div className="msg-role agent">
                  <span className="av">
                    <KeyMark size={14} />
                  </span>{" "}
                  treasurer
                </div>
                <div className="msg-text">
                  I also called{" "}
                  <span
                    className="mono"
                    style={{ color: "var(--gold-hi)", fontSize: 13 }}
                  >
                    px-oracle
                  </span>{" "}
                  to confirm the WETH price before scoring risk — settled{" "}
                  <span
                    className="mono"
                    style={{ color: "var(--gold-hi)", fontSize: 13 }}
                  >
                    0.004 PTON
                  </span>{" "}
                  via x402.
                </div>
              </div>
            </div>
          </div>

          <div className="composer">
            <div className="composer-box">
              <input placeholder="Message treasurer…  (⌘↵ to send)" />
              <button className="composer-send" type="button">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            </div>
            <div className="composer-hint">
              <span>vault mode · actions need approval</span>
              <span>claude-sonnet-4-5</span>
              <span>x402 · 1,284 PTON</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
