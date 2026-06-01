/**
 * Chain resolution helpers for the multi-chain top-up flow.
 *
 * The billing rail historically deposited PTON on a single chain
 * (`config.chainId` / `config.vaultAddress` / `config.ptonAddress` with one
 * `clients` bundle). This module makes the top-up backend chain-aware so a user
 * can deposit on any chain that has a LIVE billing deploy in
 * `BILLING_CHAIN_MAP` (an entry whose `pton` AND `claudeVault` are non-null —
 * currently Ethereum=1 and Base=8453).
 *
 * Two helpers:
 *   - `resolveBillingChain(chainId)` — validate + look up the resolved chain's
 *     `pton` (verifyingContract), `claudeVault` (vault), and `ptonDomain`.
 *   - `getClientsForChain(chainId, config, defaultClients)` — return a per-chain
 *     operator `BillingClients` bundle, reusing the default clients when the
 *     requested chain is the configured one, or building (and caching) a new
 *     bundle from a per-chain RPC env override (e.g. `BILLING_BASE_RPC_URL`).
 *
 * No DB column / migration is added: the client re-sends `chainId` on settle,
 * and the EIP-3009 signature cryptographically binds chainId + pton, so settle
 * can trust the resolved domain.
 */

import type { Address, Hex, TypedDataDomain } from "viem";
import {
  BILLING_CHAIN_MAP,
  createBillingClients,
  ptonDomain,
  type BillingClients,
  type BillingConfig,
} from "@tokagentos/billing";

// ---------------------------------------------------------------------------
// Module-level per-chain clients cache (lazy)
// ---------------------------------------------------------------------------

/**
 * Lazily-built operator clients keyed by chainId. Built bundles are cached for
 * the process lifetime so we don't reconstruct viem transports on every settle.
 * The default chain's clients are NOT stored here — they come from server state.
 */
const _clientsByChain = new Map<number, BillingClients>();

/**
 * Reset the per-chain clients cache. Called by Plugin.dispose / tests for
 * isolation, alongside `resetSettleLimiter()`.
 */
export function resetChainClients(): void {
  _clientsByChain.clear();
}

/**
 * Per-chain operator RPC override env vars. When the requested settlement chain
 * is NOT the default `config.chainId`, the operator client for that chain is
 * built from the RPC URL held in its named env var. Friendly per-chain names
 * (rather than a numeric `BILLING_CHAIN_RPC_URL_<id>` scheme) keep Railway/Docker
 * deploy configs readable.
 */
const CHAIN_RPC_URL_ENV: Readonly<Record<number, string>> = {
  1: "BILLING_ETHEREUM_RPC_URL",
  8453: "BILLING_BASE_RPC_URL",
};

/**
 * Resolve the operator RPC URL override for `chainId` from its named env var,
 * or `undefined` when the chain has no named env var or the var is unset/empty.
 */
function operatorRpcUrlForChain(chainId: number): string | undefined {
  const envVar = CHAIN_RPC_URL_ENV[chainId];
  if (!envVar) return undefined;
  const value = process.env[envVar];
  return value && value.length > 0 ? value : undefined;
}

// ---------------------------------------------------------------------------
// Chain resolution
// ---------------------------------------------------------------------------

/**
 * The resolved addresses + EIP-712 domain for a selectable billing chain.
 */
export interface ResolvedBillingChain {
  chainId: number;
  /** PTON token address — the EIP-712 `verifyingContract`. */
  ptonAddress: Address;
  /** ClaudeVault address — the EIP-3009 `to` and `depositX402` target. */
  vaultAddress: Address;
  /** EIP-712 domain for `TransferWithAuthorization` signing/verification. */
  domain: TypedDataDomain;
}

/** Discriminated result so callers can map to the exact 400 status/body. */
export type ResolveChainResult =
  | { ok: true; chain: ResolvedBillingChain }
  | { ok: false; error: string };

/**
 * Resolve a chainId to its billing addresses + domain.
 *
 * A chain is selectable iff `BILLING_CHAIN_MAP` has an entry whose `pton` AND
 * `claudeVault` are non-null. Otherwise this returns an error result whose
 * message matches the shared API contract:
 *   `Unsupported or unconfigured chain: <id>`
 */
export function resolveBillingChain(chainId: number): ResolveChainResult {
  const entry = BILLING_CHAIN_MAP.get(chainId);
  if (!entry || entry.pton === null || entry.claudeVault === null) {
    return { ok: false, error: `Unsupported or unconfigured chain: ${chainId}` };
  }
  const ptonAddress = entry.pton;
  const vaultAddress = entry.claudeVault;
  return {
    ok: true,
    chain: {
      chainId,
      ptonAddress,
      vaultAddress,
      domain: ptonDomain(chainId, ptonAddress),
    },
  };
}

// ---------------------------------------------------------------------------
// Per-chain operator clients
// ---------------------------------------------------------------------------

/** Result of resolving operator clients for a settlement chain. */
export type ClientsForChainResult =
  | { ok: true; clients: BillingClients }
  | { ok: false; error: string };

/**
 * Resolve the operator `BillingClients` bundle for a settlement chain.
 *
 *   - If `chainId === config.chainId` → reuse the default `clients` from server
 *     state (no new transports).
 *   - Else if the chain's RPC env override is set in `process.env` (e.g.
 *     `BILLING_BASE_RPC_URL` for Base, `BILLING_ETHEREUM_RPC_URL` for Ethereum)
 *     → build (and cache) a bundle via `createBillingClients` using that RPC +
 *     the SAME operator private key and mainnet RPC the default clients used.
 *   - Else → an error result whose message matches the shared API contract:
 *       `Settlement not available for chain <id> (no operator client configured)`
 *
 * @param defaultClients The existing server-state clients for `config.chainId`.
 */
export function getClientsForChain(
  chainId: number,
  config: BillingConfig,
  defaultClients: BillingClients,
): ClientsForChainResult {
  if (chainId === config.chainId) {
    return { ok: true, clients: defaultClients };
  }

  const cached = _clientsByChain.get(chainId);
  if (cached) {
    return { ok: true, clients: cached };
  }

  const rpcUrl = operatorRpcUrlForChain(chainId);
  if (!rpcUrl) {
    return {
      ok: false,
      error: `Settlement not available for chain ${chainId} (no operator client configured)`,
    };
  }

  // Reuse the SAME operator key + mainnet RPC the default clients were built
  // with (init.ts / _runtime-deps.ts build the default bundle with
  // `mainnetRpcUrl: config.mainnetRpcUrl ?? config.chainRpcUrl`). The mainnet
  // client is only used for TWAP reads, which are chain-agnostic.
  const clients = createBillingClients({
    chainRpcUrl: rpcUrl,
    mainnetRpcUrl: config.mainnetRpcUrl ?? config.chainRpcUrl,
    operatorPrivateKey: config.operatorPrivateKey as Hex,
  });
  _clientsByChain.set(chainId, clients);
  return { ok: true, clients };
}
