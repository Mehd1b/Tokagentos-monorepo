/**
 * Operator chat page — two-pane layout (thread rail + message stream + composer).
 * Ported from handoff_app/prototype/components/Pages.jsx (ChatPage).
 *
 * Live: lists real dashboard conversations + their messages via the
 * TokagentClient singleton (`client.listConversations` / `getConversationMessages`),
 * sends through `sendConversationMessageStream`, and creates threads via
 * `createConversation` — same-origin/session auth, identical to the production
 * ChatView. The composer footer's model chip comes from `useActiveModel`
 * (GET /v1/model) and the x402 chip from the operator's live ClaudeVault
 * balance (GET /v1/credits/me). Falls back to {@link CHAT_THREADS} /
 * {@link CHAT_ACTION_KV} (the "⟩ example values" view) when the gateway is
 * unavailable or the caller is unauthenticated. Loading keeps the mock so the
 * page never blanks; the action card maps to the real `actionName` +
 * `actionCallbackHistory` lines when present.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { client } from "../../../../api/client";
import type { ConversationMessage } from "../../../../api/client-types";
import { useActiveModel } from "../../../../hooks/useActiveModel";
import { KeyMark } from "../brand/KeyMark";
import { fetchCredits, formatAttoPtonString, useLive } from "../client-billing";
import { CHAT_ACTION_KV, CHAT_THREADS, type ChatThread } from "../mock";

/** Live thread-rail row: mock {@link ChatThread} shape + the selection key. */
type ThreadRow = ChatThread & { id: string };

/** Format an ISO timestamp as a short relative string ("2m ago", "yesterday"). */
function shortRelative(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  if (diff < 0) return "just now";
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day}d ago`;
  return new Date(then).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function ChatPage({
  threads = CHAT_THREADS,
  actionKv = CHAT_ACTION_KV,
}: {
  threads?: ChatThread[];
  actionKv?: { k: string; v: string }[];
} = {}) {
  // ── Thread rail (live conversations, mock fallback) ────────────────────────
  const threadsFetcher = useCallback(
    () =>
      client.listConversations().then((r) =>
        r.conversations.map<ThreadRow>((c) => ({
          id: c.id,
          name: c.title,
          time: shortRelative(c.updatedAt),
        })),
      ),
    [],
  );
  const {
    data: liveThreads,
    live: threadsLive,
    reload,
  } = useLive(threadsFetcher);
  const shownThreads: ThreadRow[] = liveThreads
    ? liveThreads
    : threads.map((t, i) => ({ ...t, id: `mock-${i}` }));

  // Selected thread id drives the `active` highlight + the message fetch.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const effectiveSelectedId =
    selectedId && shownThreads.some((t) => t.id === selectedId)
      ? selectedId
      : (shownThreads[0]?.id ?? null);

  // ── Message stream for the selected thread ─────────────────────────────────
  const [messages, setMessages] = useState<ConversationMessage[] | null>(null);
  useEffect(() => {
    // Only fetch real messages for real (non-mock) conversations.
    if (!threadsLive || !effectiveSelectedId) {
      setMessages(null);
      return;
    }
    let cancelled = false;
    client
      .getConversationMessages(effectiveSelectedId)
      .then((r) => {
        if (!cancelled) setMessages(r.messages);
      })
      .catch(() => {
        if (!cancelled) setMessages(null);
      });
    return () => {
      cancelled = true;
    };
  }, [threadsLive, effectiveSelectedId]);

  const messagesLive = threadsLive && messages !== null;

  // ── Composer send (streaming, optimistic) ──────────────────────────────────
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const onSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending || !messagesLive || !effectiveSelectedId) return;
    setSending(true);
    setDraft("");
    const userId = `local-user-${Date.now()}`;
    const replyId = `local-reply-${Date.now()}`;
    setMessages((prev) => [
      ...(prev ?? []),
      { id: userId, role: "user", text, timestamp: Date.now() },
      { id: replyId, role: "assistant", text: "", timestamp: Date.now() },
    ]);
    try {
      await client.sendConversationMessageStream(
        effectiveSelectedId,
        text,
        (_token, accumulated) => {
          setMessages((prev) =>
            (prev ?? []).map((m) =>
              m.id === replyId
                ? { ...m, text: accumulated ?? m.text + _token }
                : m,
            ),
          );
        },
      );
      // Re-sync with the server's canonical message list (ids, action cards).
      const fresh = await client.getConversationMessages(effectiveSelectedId);
      setMessages(fresh.messages);
      reload();
    } catch {
      // Keep the optimistic bubbles; mark the empty reply as interrupted.
      setMessages((prev) =>
        (prev ?? []).map((m) =>
          m.id === replyId && !m.text
            ? { ...m, text: "(no response)", interrupted: true }
            : m,
        ),
      );
    } finally {
      setSending(false);
    }
  }, [draft, sending, messagesLive, effectiveSelectedId, reload]);

  const onNewConversation = useCallback(async () => {
    try {
      const { conversation } = await client.createConversation();
      setSelectedId(conversation.id);
      reload();
    } catch {
      /* unauthenticated / gateway unavailable — keep the mock view */
    }
  }, [reload]);

  // ── Composer footer chips (model + x402 PTON balance) ──────────────────────
  const activeModel = useActiveModel();
  const creditsFetcher = useCallback(() => fetchCredits(), []);
  const { data: credits } = useLive(creditsFetcher);
  const ptonLabel = credits
    ? `${formatAttoPtonString(credits.balance)} PTON`
    : "1,284 PTON";

  // ── Action card: surface the real action name + callback lines ─────────────
  const actionMessage = useMemo(
    () =>
      messagesLive
        ? (messages ?? []).find(
            (m) =>
              m.actionName ||
              (m.actionCallbackHistory && m.actionCallbackHistory.length > 0),
          )
        : undefined,
    [messagesLive, messages],
  );

  return (
    <div className="page" style={{ overflow: "hidden" }}>
      <div className="chat-layout">
        <div className="chat-rail">
          <button
            className="chat-new"
            type="button"
            onClick={onNewConversation}
          >
            ＋ New conversation
          </button>
          {shownThreads.map((t) => {
            const isActive = threadsLive
              ? t.id === effectiveSelectedId
              : (t.active ?? false);
            return (
              <div
                key={t.id}
                className={`chat-thread ${isActive ? "is-active" : ""}`}
                onClick={() => {
                  if (threadsLive) setSelectedId(t.id);
                }}
                onKeyDown={(e) => {
                  if (threadsLive && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    setSelectedId(t.id);
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="chat-thread-name">{t.name}</div>
                <div className="chat-thread-time">{t.time}</div>
              </div>
            );
          })}
        </div>

        <div className="chat-main">
          <div className="chat-stream">
            <div className="chat-stream-inner">
              {threadsLive && shownThreads.length === 0 ? (
                // Authenticated but no conversations yet — honest empty state,
                // NOT the mock stream (no "live" chip sitting over fake messages).
                <div
                  className="msg-block"
                  style={{
                    textAlign: "center",
                    color: "var(--muted)",
                    padding: "48px 0",
                  }}
                >
                  <div className="msg-text">
                    No conversations yet — start one with{" "}
                    <strong style={{ color: "var(--text-strong)" }}>
                      + New conversation
                    </strong>
                    .
                  </div>
                </div>
              ) : !messagesLive ? (
                // Mock / offline fallback — the original prototype stream.
                <>
                  <div className="msg-block">
                    <div className="msg-role">
                      <span className="av">🧑</span> you
                    </div>
                    <div className="msg-text user">
                      whats my aave health on polygon? top up usdc if it drops
                      below 1.6
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
                      . You've supplied $284K USDC against $112K borrowed WETH.
                      I've set a watch: if HF drops below 1.6 I'll draft a vault
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
                </>
              ) : (messages ?? []).length === 0 ? (
                <div className="msg-block">
                  <div className="msg-role agent">
                    <span className="av">
                      <KeyMark size={14} />
                    </span>{" "}
                    treasurer · vault mode
                  </div>
                  <div className="msg-text" style={{ color: "var(--muted)" }}>
                    No messages yet. Send the first message to start this
                    conversation.
                  </div>
                </div>
              ) : (
                (messages ?? []).map((m) => {
                  const isUser = m.role === "user";
                  const hasAction =
                    m.actionName ||
                    (m.actionCallbackHistory &&
                      m.actionCallbackHistory.length > 0);
                  return (
                    <div className="msg-block" key={m.id}>
                      <div className={`msg-role ${isUser ? "" : "agent"}`}>
                        <span className="av">
                          {isUser ? "🧑" : <KeyMark size={14} />}
                        </span>{" "}
                        {isUser ? "you" : "treasurer · vault mode"}
                      </div>
                      <div className={`msg-text ${isUser ? "user" : ""}`}>
                        {m.text || (m.interrupted ? "(no response)" : "…")}
                      </div>

                      {!isUser && hasAction && (
                        <div className="action-card">
                          <div className="action-head">
                            <div className="action-glyph">🛡️</div>
                            <div style={{ flex: 1 }}>
                              <div className="action-name">
                                {m.actionName ?? "action"}
                              </div>
                              <div className="action-sub">
                                {m.source ?? "plugin action"}
                              </div>
                            </div>
                            <span className="chip ok">read</span>
                          </div>
                          {m.actionCallbackHistory &&
                            m.actionCallbackHistory.length > 0 && (
                              <div className="action-body">
                                {m.actionCallbackHistory.map((line, i) => (
                                  <div
                                    key={`${m.id}-cb-${i}`}
                                    className="action-kv"
                                  >
                                    <div className="k">step</div>
                                    <div className="v">{line}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="composer">
            <div className="composer-box">
              <input
                placeholder="Message treasurer…  (⌘↵ to send)"
                value={draft}
                disabled={sending}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void onSend();
                  }
                }}
              />
              <button
                className="composer-send"
                type="button"
                disabled={sending || !messagesLive}
                onClick={() => void onSend()}
              >
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
              <span>{activeModel ?? "claude-sonnet-4-5"}</span>
              <span>x402 · {ptonLabel}</span>
            </div>
          </div>
        </div>
      </div>

      {/* live / example-values indicator (operator chip pattern) */}
      <div
        style={{
          position: "absolute",
          top: 12,
          right: 16,
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        {threadsLive ? (
          <span className="chip ok">live · chat</span>
        ) : (
          <span className="chip mute">⟩ example values</span>
        )}
      </div>
    </div>
  );
}
