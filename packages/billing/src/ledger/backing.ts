/**
 * Per-chain credit BACKING ledger — the "global spend, per-network backing"
 * model.
 *
 * `creditState.balance` (ledger.ts) remains the single GLOBAL spendable balance
 * and is untouched by this module. `creditBacking` only records WHICH chain a
 * wallet's credits are attributed to, for:
 *   - per-network display ("backed on Base: X"), and
 *   - the credit-level bridge (move attribution between chains).
 *
 * A bridge reassigns backing in the DB WITHOUT moving on-chain PTON, so per-chain
 * backing may diverge from each vault's on-chain `credits[wallet]`. Spending on
 * inference is global and unaffected; on-chain `withdraw` stays bounded by each
 * vault's real PTON. See the credit-bridge decision notes.
 */

import { eq, and } from "drizzle-orm";
import type { Address } from "viem";
import { logger } from "@tokagentos/core";
import { creditBacking, type BillingDatabase } from "./schema.js";
import { withSerializableRetry } from "./retry.js";

const log = logger.child({ src: "billing:backing" });

/** Read a wallet's credit backing for one chain. Returns 0n when no row exists. */
export async function getBacking(
  db: BillingDatabase,
  wallet: Address,
  chainId: number,
): Promise<bigint> {
  const w = wallet.toLowerCase();
  const rows = await db
    .select()
    .from(creditBacking)
    .where(and(eq(creditBacking.wallet, w), eq(creditBacking.chainId, chainId)));
  return rows[0]?.amount ?? 0n;
}

/** Read every per-chain backing row for a wallet as a `{ [chainId]: amount }` map. */
export async function getAllBacking(
  db: BillingDatabase,
  wallet: Address,
): Promise<Record<number, bigint>> {
  const w = wallet.toLowerCase();
  const rows = await db
    .select()
    .from(creditBacking)
    .where(eq(creditBacking.wallet, w));
  const out: Record<number, bigint> = {};
  for (const r of rows) out[r.chainId] = r.amount;
  return out;
}

/**
 * Attribute a deposit to a chain: `backing[wallet, chainId] += amount`.
 * Called from the settle path after a successful on-chain deposit. Idempotency
 * of the deposit itself is enforced upstream (single-use topupId / quote).
 */
export async function creditBackingDeposit(
  db: BillingDatabase,
  wallet: Address,
  chainId: number,
  amount: bigint,
): Promise<void> {
  if (amount <= 0n) return;
  const w = wallet.toLowerCase();
  await withSerializableRetry(db, async (tx) => {
    const rows = await tx
      .select()
      .from(creditBacking)
      .where(and(eq(creditBacking.wallet, w), eq(creditBacking.chainId, chainId)));
    if (rows.length > 0) {
      await tx
        .update(creditBacking)
        .set({ amount: rows[0]!.amount + amount, updatedAt: new Date() })
        .where(and(eq(creditBacking.wallet, w), eq(creditBacking.chainId, chainId)));
    } else {
      await tx.insert(creditBacking).values({ wallet: w, chainId, amount, updatedAt: new Date() });
    }
  });
  log.info({ wallet: w, chainId, amount: amount.toString() }, "credit backing += deposit");
}

/** Result of a credit-level bridge. */
export interface BridgeResult {
  ok: boolean;
  error?: string;
  /** Backing on the source chain AFTER the move (present on success). */
  fromAmount?: bigint;
  /** Backing on the destination chain AFTER the move (present on success). */
  toAmount?: bigint;
}

/**
 * Credit-level bridge: move `amount` of backing from `fromChainId` to
 * `toChainId` for a wallet. Ledger-only — does NOT touch on-chain PTON. Atomic
 * under SERIALIZABLE isolation; fails if the source backing is insufficient.
 */
export async function bridgeBacking(
  db: BillingDatabase,
  args: { wallet: Address; fromChainId: number; toChainId: number; amount: bigint },
): Promise<BridgeResult> {
  const w = args.wallet.toLowerCase();
  const { fromChainId, toChainId, amount } = args;
  if (amount <= 0n) return { ok: false, error: "amount must be > 0" };
  if (fromChainId === toChainId) {
    return { ok: false, error: "fromChainId and toChainId must differ" };
  }

  return withSerializableRetry(db, async (tx) => {
    const fromRows = await tx
      .select()
      .from(creditBacking)
      .where(and(eq(creditBacking.wallet, w), eq(creditBacking.chainId, fromChainId)));
    const fromAmount = fromRows[0]?.amount ?? 0n;
    if (fromAmount < amount) {
      return { ok: false as const, error: `Insufficient backing on chain ${fromChainId}.` };
    }
    const newFrom = fromAmount - amount;
    await tx
      .update(creditBacking)
      .set({ amount: newFrom, updatedAt: new Date() })
      .where(and(eq(creditBacking.wallet, w), eq(creditBacking.chainId, fromChainId)));

    const toRows = await tx
      .select()
      .from(creditBacking)
      .where(and(eq(creditBacking.wallet, w), eq(creditBacking.chainId, toChainId)));
    let newTo: bigint;
    if (toRows.length > 0) {
      newTo = toRows[0]!.amount + amount;
      await tx
        .update(creditBacking)
        .set({ amount: newTo, updatedAt: new Date() })
        .where(and(eq(creditBacking.wallet, w), eq(creditBacking.chainId, toChainId)));
    } else {
      newTo = amount;
      await tx.insert(creditBacking).values({ wallet: w, chainId: toChainId, amount, updatedAt: new Date() });
    }
    log.info(
      { wallet: w, fromChainId, toChainId, amount: amount.toString() },
      "credit backing bridged",
    );
    return { ok: true as const, fromAmount: newFrom, toAmount: newTo };
  });
}
