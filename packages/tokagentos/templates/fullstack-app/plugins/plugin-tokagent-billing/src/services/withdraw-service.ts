/**
 * WithdrawWatcherService — elizaOS Service wrapper for the withdraw watcher.
 *
 * Subscribes to `WithdrawRequested` events on ClaudeVault via
 * `viem.watchContractEvent`. On each event, calls `handleWithdrawRequested`
 * from the pure worker module.
 *
 * Decision D18: Service wrappers own the viem subscription; pure workers
 * own the per-event handling logic.
 */

import { Service, logger, type IAgentRuntime } from "@elizaos/core";
import {
  handleWithdrawRequested,
  type WithdrawWatcherDeps,
} from "@tokagentos/billing";
import { CLAUDE_VAULT_ABI, BILLING_CHAIN_MAP } from "@tokagentos/billing";
import type { Address } from "viem";
import { resolveBillingRuntime, type BillingRuntimeDeps } from "./_runtime-deps.js";
import { resolveBillingChain, getClientsForChain } from "../lib/chain-resolve.js";

const log = logger.child({ src: "billing:service:withdraw-watcher" });

export class WithdrawWatcherService extends Service {
  static serviceType = "tokagent-billing-withdraw";
  capabilityDescription =
    "Watches vault.WithdrawRequested events to pre-empt consume flush";

  /**
   * One unwatch handle per live-chain vault subscription. Empty until the
   * first `subscribe()`. Per-chain billing: a withdraw on ANY live chain
   * (Ethereum, Base, …) must pre-empt the consume flush, so we watch every
   * `WithdrawRequested` source — not just the default chain's vault.
   */
  private unwatchers: Array<() => void> = [];
  private runtimeDeps!: BillingRuntimeDeps;
  /** Pending resubscribe timer; `null` when no reconnect is scheduled. */
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Current backoff attempt count; resets on a successful subscription. */
  private reconnectAttempt = 0;
  /** `true` once `stop()` has been called; suppresses further reconnects. */
  private stopped = false;
  private static readonly RECONNECT_BASE_MS = 2_000;
  private static readonly RECONNECT_MAX_MS = 60_000;
  private static readonly RECONNECT_MAX_ATTEMPTS = 8;
  /** Captured at init so the resubscribe path can rebuild the subscription. */
  private workerDeps!: WithdrawWatcherDeps;

  static async start(runtime: IAgentRuntime): Promise<WithdrawWatcherService> {
    const instance = new WithdrawWatcherService(runtime);
    await instance._init();
    return instance;
  }

  private async _init(): Promise<void> {
    this.runtimeDeps = await resolveBillingRuntime(this.runtime);
    const { db, clients, config } = this.runtimeDeps;

    this.workerDeps = {
      db,
      config: {
        consumeBatchMinPton: config.consumeBatchMinPton,
        consumeMaxAgeMs: config.consumeMaxAgeMs,
        consumeMaxPerCycle: config.consumeMaxPerCycle,
      },
      // Per-chain settlement: the priority flush settles each of the wallet's
      // accruals on its own chain's vault. Mirrors ConsumeWorkerDeps.resolveChain
      // (see consume-service.ts). Returns null when a chain has no live deploy or
      // no configured RPC — the handler logs and skips rather than mis-settle.
      resolveChain: (chainId: number) => {
        const chain = resolveBillingChain(chainId);
        if (!chain.ok) return null;
        const cl = getClientsForChain(chainId, config, clients);
        if (!cl.ok) return null;
        return { clients: cl.clients, vaultAddress: chain.chain.vaultAddress };
      },
    };

    this.subscribe();
    log.info(
      { vaults: this.unwatchers.length },
      "WithdrawWatcherService started",
    );
  }

  /**
   * Enumerate every live billing chain's vault to watch. A chain is "live" iff
   * `BILLING_CHAIN_MAP` has it with non-null `pton`+`claudeVault` AND an operator
   * client is resolvable (default chain reuses server-state clients; others need
   * a per-chain RPC env override). Returns the (publicClient, vault) pairs to
   * watch `WithdrawRequested` on. Always includes the default chain when its
   * client resolves.
   */
  private liveWatchTargets(): Array<{
    chainId: number;
    publicClient: BillingRuntimeDeps["clients"]["publicClient"];
    vaultAddress: Address;
  }> {
    const { clients, config } = this.runtimeDeps;
    const targets: Array<{
      chainId: number;
      publicClient: BillingRuntimeDeps["clients"]["publicClient"];
      vaultAddress: Address;
    }> = [];
    for (const entry of BILLING_CHAIN_MAP.values()) {
      if (entry.pton === null || entry.claudeVault === null) continue;
      const cl = getClientsForChain(entry.chainId, config, clients);
      if (!cl.ok) {
        // No operator client for this chain (no RPC env override) — skip. The
        // default chain always resolves; non-default chains need their RPC env.
        log.debug(
          { chainId: entry.chainId, reason: cl.error },
          "withdraw watcher: skipping chain (no operator client)",
        );
        continue;
      }
      targets.push({
        chainId: entry.chainId,
        publicClient: cl.clients.publicClient,
        vaultAddress: entry.claudeVault,
      });
    }
    return targets;
  }

  /**
   * (Re)attach the viem event subscription. Called once during `_init` and
   * again from the `onError` reconnect path. Idempotent: tears down any
   * existing subscription before creating a new one.
   */
  private subscribe(): void {
    if (this.stopped) return;
    // Tear down any existing subscriptions before reattaching (idempotent —
    // called once at init and again on the reconnect path).
    if (this.unwatchers.length > 0) {
      for (const unwatch of this.unwatchers) {
        try {
          unwatch();
        } catch {
          /* ignore — previous subscription already broken */
        }
      }
      this.unwatchers = [];
    }

    const targets = this.liveWatchTargets();
    if (targets.length === 0) {
      log.warn(
        "withdraw watcher: no live billing chains resolvable — nothing watched",
      );
      return;
    }

    for (const { chainId, publicClient, vaultAddress } of targets) {
      const unwatch = publicClient.watchContractEvent({
        address: vaultAddress,
        abi: CLAUDE_VAULT_ABI,
        eventName: "WithdrawRequested",
        onLogs: (logs) => {
          // First successful event delivery clears the backoff counter.
          if (this.reconnectAttempt > 0) {
            log.info(
              { attempts: this.reconnectAttempt },
              "withdraw watcher resubscribed successfully",
            );
            this.reconnectAttempt = 0;
          }
          for (const lg of logs) {
            void handleWithdrawRequested(
              this.workerDeps,
              lg as Parameters<typeof handleWithdrawRequested>[1],
            ).catch((err: unknown) =>
              log.error(
                { err, chainId },
                "withdraw handler error (best-effort; ignoring)",
              ),
            );
          }
        },
        onError: (err) => {
          if (this.stopped) return;
          // Any single chain's subscription error triggers a full reattach of
          // all chains. The consume worker's regular cadence is the correctness
          // backstop, so a coarse-grained resubscribe is acceptable.
          this.scheduleReconnect(err);
        },
      });
      this.unwatchers.push(unwatch);
    }

    log.debug(
      { chains: targets.map((t) => t.chainId) },
      "withdraw watcher subscribed to live-chain vaults",
    );
  }

  /**
   * Schedule a reconnect with exponential backoff (capped). After
   * RECONNECT_MAX_ATTEMPTS the watcher stays disconnected and ops must
   * restart the service — the consume worker's regular cadence is the
   * correctness backstop per source semantics.
   */
  private scheduleReconnect(err: Error): void {
    if (this.reconnectTimer) return; // already scheduled
    this.reconnectAttempt += 1;
    if (this.reconnectAttempt > WithdrawWatcherService.RECONNECT_MAX_ATTEMPTS) {
      log.error(
        { err: err.message, attempts: this.reconnectAttempt },
        "withdraw watcher subscription error — max reconnects exhausted, giving up",
      );
      return;
    }
    const delay = Math.min(
      WithdrawWatcherService.RECONNECT_BASE_MS *
        2 ** (this.reconnectAttempt - 1),
      WithdrawWatcherService.RECONNECT_MAX_MS,
    );
    log.warn(
      { err: err.message, attempt: this.reconnectAttempt, delayMs: delay },
      "withdraw watcher subscription error — scheduling reconnect",
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.subscribe();
    }, delay);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.unwatchers.length > 0) {
      for (const unwatch of this.unwatchers) {
        try {
          unwatch();
        } catch (e) {
          log.warn(
            { err: (e as Error).message },
            "withdraw watcher unwatch threw",
          );
        }
      }
      this.unwatchers = [];
    }
    if (this.runtimeDeps) {
      await this.runtimeDeps.stop();
    }
    log.info("WithdrawWatcherService stopped");
  }
}
