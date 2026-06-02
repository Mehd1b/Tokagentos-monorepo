/**
 * Per-chain credit isolation tests.
 *
 * The credit ledger is keyed by (wallet, chainId): a single wallet keeps an
 * independent balance / reserved / accrued accumulator on every chain it
 * bills on. These tests prove the chains do not bleed into each other:
 *   - hydrate(wallet, A) and hydrate(wallet, B) set independent balances,
 *   - reserve + commit on chain A leaves chain B's state untouched,
 *   - flushAccrued is per-chain (flushing A does not drain B).
 */

import { describe, it, beforeEach, afterEach, beforeAll, afterAll, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDbHandle } from "./db-harness.js";
import { creditState, reservations } from "../schema.js";
import { reserve, commit, hydrate, flushAccrued } from "../ledger.js";
import type { Address } from "viem";

const WALLET = "0xabab000000000000000000000000000000000077" as Address;
const CHAIN_A = 1; // Ethereum
const CHAIN_B = 8453; // Base

let handle: TestDbHandle;

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
  await handle.close();
});

// Each test starts from a clean slate for this wallet on BOTH chains.
beforeEach(async () => {
  await handle.db.delete(reservations).where(eq(reservations.wallet, WALLET.toLowerCase()));
  await handle.db.delete(creditState).where(eq(creditState.wallet, WALLET.toLowerCase()));
});

afterEach(async () => {
  await handle.db.delete(reservations).where(eq(reservations.wallet, WALLET.toLowerCase()));
  await handle.db.delete(creditState).where(eq(creditState.wallet, WALLET.toLowerCase()));
});

/** Read the (wallet, chainId) credit_state row, or null if it doesn't exist. */
async function stateOf(chainId: number) {
  const rows = await handle.db
    .select()
    .from(creditState)
    .where(
      and(eq(creditState.wallet, WALLET.toLowerCase()), eq(creditState.chainId, chainId)),
    );
  return rows[0] ?? null;
}

describe("per-chain credit isolation", () => {
  it("hydrates each chain independently", async () => {
    await hydrate(handle.db, WALLET, CHAIN_A, 1000n);
    await hydrate(handle.db, WALLET, CHAIN_B, 250n);

    expect((await stateOf(CHAIN_A))!.balance).toBe(1000n);
    expect((await stateOf(CHAIN_B))!.balance).toBe(250n);

    // Two distinct rows exist for the same wallet.
    const all = await handle.db
      .select()
      .from(creditState)
      .where(eq(creditState.wallet, WALLET.toLowerCase()));
    expect(all).toHaveLength(2);
  });

  it("reserve + commit on chain A does NOT change chain B's balance", async () => {
    await hydrate(handle.db, WALLET, CHAIN_A, 1000n);
    await hydrate(handle.db, WALLET, CHAIN_B, 250n);

    const r = await reserve(handle.db, {
      wallet: WALLET,
      chainId: CHAIN_A,
      amount: 400n,
      requestId: "pc-a-1",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");

    // Commit 300 of the 400 reservation on chain A.
    await commit(handle.db, r.reservationId, 300n);

    // Chain A: balance = 1000 - 400 reservation + 100 refund = 700;
    //          reserved 0; accrued 300.
    const a = (await stateOf(CHAIN_A))!;
    expect(a.balance).toBe(700n);
    expect(a.reserved).toBe(0n);
    expect(a.accrued).toBe(300n);

    // Chain B: completely untouched.
    const b = (await stateOf(CHAIN_B))!;
    expect(b.balance).toBe(250n);
    expect(b.reserved).toBe(0n);
    expect(b.accrued).toBe(0n);
  });

  it("reserve draws only from its own chain's balance", async () => {
    // Chain A has 100; chain B has 1000. A reserve of 500 on A must fail even
    // though the wallet has plenty on B — balances are not pooled across chains.
    await hydrate(handle.db, WALLET, CHAIN_A, 100n);
    await hydrate(handle.db, WALLET, CHAIN_B, 1000n);

    const r = await reserve(handle.db, {
      wallet: WALLET,
      chainId: CHAIN_A,
      amount: 500n,
      requestId: "pc-a-fail",
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure");
    expect(r.available).toBe(100n);

    // Chain B balance is unaffected by the failed reserve on A.
    expect((await stateOf(CHAIN_B))!.balance).toBe(1000n);
  });

  it("flushAccrued is per-chain — flushing A leaves B's accrual intact", async () => {
    await hydrate(handle.db, WALLET, CHAIN_A, 1000n);
    await hydrate(handle.db, WALLET, CHAIN_B, 1000n);

    // Accrue 200 on chain A.
    const ra = await reserve(handle.db, {
      wallet: WALLET,
      chainId: CHAIN_A,
      amount: 200n,
      requestId: "pc-flush-a",
    });
    if (!ra.ok) throw new Error("expected ok");
    await commit(handle.db, ra.reservationId, 200n);

    // Accrue 150 on chain B.
    const rb = await reserve(handle.db, {
      wallet: WALLET,
      chainId: CHAIN_B,
      amount: 150n,
      requestId: "pc-flush-b",
    });
    if (!rb.ok) throw new Error("expected ok");
    await commit(handle.db, rb.reservationId, 150n);

    // Flush only chain A.
    const flushedA = await flushAccrued(handle.db, WALLET, CHAIN_A);
    expect(flushedA).not.toBeNull();
    expect(flushedA!.amount).toBe(200n);

    // Chain A accrual is now zeroed.
    const a = (await stateOf(CHAIN_A))!;
    expect(a.accrued).toBe(0n);
    expect(a.firstAccrualAt).toBeNull();

    // Chain B accrual is UNTOUCHED by the chain-A flush.
    const b = (await stateOf(CHAIN_B))!;
    expect(b.accrued).toBe(150n);
    expect(b.firstAccrualAt).toBeInstanceOf(Date);

    // Flushing B returns B's own accrual.
    const flushedB = await flushAccrued(handle.db, WALLET, CHAIN_B);
    expect(flushedB!.amount).toBe(150n);
  });
});
