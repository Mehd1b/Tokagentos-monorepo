/**
 * Self-contained same-origin gateway client for the operator console.
 *
 * Mirrors client-billing.ts: bare `fetch("/api/...", { credentials: "include" })`
 * with ZERO app-core / cross-package imports. This is deliberate — the operator
 * ships identically into the monorepo dev surface AND the published scaffold,
 * whose eliza-based app-core does NOT contain the TokagentClient singleton,
 * `@tokagentos/shared/contracts`, `inventory/chainConfig`, or `plugin-list-utils`.
 * Every route below is served by the agent server in BOTH contexts, so wiring
 * through these helpers (not the app-core client) keeps the operator portable.
 *
 * Types are minimal — only the fields the operator pages render. Each fetcher
 * returns the raw endpoint shape (same as the app-core client methods, which
 * just proxy these routes), and callers fall back to mock + the "⟩ example
 * values" chip via the `useLive` hook when a call throws (unauth / offline).
 */

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/* ── Chat · conversation routes ───────────────────────────────────────────── */

export interface GwConversation {
  id: string;
  title?: string;
  updatedAt?: string | number | null;
}
export interface GwMessage {
  id: string;
  role?: string;
  text?: string;
  actionName?: string;
  actionCallbackHistory?: string[];
  createdAt?: string | number | null;
}
export interface GwSendReply {
  text: string;
  agentName?: string;
  noResponseReason?: string;
}

export function fetchConversations(): Promise<{
  conversations: GwConversation[];
}> {
  return getJson("/api/conversations");
}
export function fetchMessages(id: string): Promise<{ messages: GwMessage[] }> {
  return getJson(`/api/conversations/${encodeURIComponent(id)}/messages`);
}
export function createConversation(): Promise<{
  conversation: GwConversation;
}> {
  return getJson("/api/conversations", { method: "POST", body: "{}" });
}
/** Non-streaming send — the POST returns the agent's full reply synchronously. */
export function sendMessage(id: string, text: string): Promise<GwSendReply> {
  return getJson(`/api/conversations/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    body: JSON.stringify({ text, channelType: "operator" }),
  });
}

/* ── Wallet · wallet routes ───────────────────────────────────────────────── */

export interface GwTokenBalance {
  symbol: string;
  balance: string;
  valueUsd: string;
}
export interface GwEvmChain {
  chainId: number;
  nativeSymbol: string;
  nativeBalance: string;
  nativeValueUsd: string;
  tokens: GwTokenBalance[];
  error: string | null;
}
export interface GwWalletBalances {
  evm: { address: string; chains: GwEvmChain[] } | null;
  solana: { address: string; tokens?: GwTokenBalance[] } | null;
}
export interface GwWalletAddresses {
  evmAddress: string | null;
  solanaAddress?: string | null;
}

export function fetchWalletBalances(): Promise<GwWalletBalances> {
  return getJson("/api/wallet/balances");
}
export function fetchWalletAddresses(): Promise<GwWalletAddresses> {
  return getJson("/api/wallet/addresses");
}

/** Minimal chainId → display meta, self-contained (no app-core chainConfig). */
const CHAIN_META: Record<number, { key: string; name: string }> = {
  1: { key: "ethereum", name: "Ethereum" },
  8453: { key: "base", name: "Base" },
  42161: { key: "arbitrum", name: "Arbitrum" },
  137: { key: "polygon", name: "Polygon" },
  10: { key: "optimism", name: "Optimism" },
  56: { key: "bsc", name: "BNB Chain" },
};
export function chainMeta(chainId: number): { key: string; name: string } {
  return CHAIN_META[chainId] ?? { key: "evm", name: `Chain ${chainId}` };
}

/* ── Automations · automations + triggers routes ──────────────────────────── */

export interface GwTriggerSummary {
  cronExpression?: string | null;
  intervalMs?: number | null;
  scheduledAtIso?: string | null;
  lastRunAtIso?: string | null;
  lastStatus?: string | null;
  instructions?: string | null;
}
export interface GwAutomation {
  id: string;
  type?: string;
  source?: string;
  title?: string;
  description?: string;
  enabled: boolean;
  updatedAt?: string | null;
  triggerId?: string;
  trigger?: GwTriggerSummary;
}

export function fetchAutomations(): Promise<{ automations: GwAutomation[] }> {
  return getJson("/api/automations");
}
export function setTriggerEnabled(
  id: string,
  enabled: boolean,
): Promise<unknown> {
  return getJson(`/api/triggers/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
}

/* ── Plugins · plugins routes ─────────────────────────────────────────────── */

export interface GwPlugin {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category?: string;
  source?: string;
  npmName?: string;
}

export function fetchPlugins(): Promise<{ plugins: GwPlugin[] }> {
  return getJson("/api/plugins");
}
export function setPluginEnabled(
  id: string,
  enabled: boolean,
): Promise<{ ok?: boolean; requiresRestart?: boolean }> {
  return getJson(`/api/plugins/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify({ enabled }),
  });
}

/* ── Settings · config + secrets routes ───────────────────────────────────── */

export interface GwSecret {
  key: string;
  isSet: boolean;
  maskedValue: string | null;
}

export function fetchSecrets(): Promise<{ secrets: GwSecret[] }> {
  return getJson("/api/secrets");
}
export function fetchConfig(): Promise<Record<string, unknown>> {
  return getJson("/api/config");
}
export function updateConfig(patch: Record<string, unknown>): Promise<unknown> {
  return getJson("/api/config", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}
