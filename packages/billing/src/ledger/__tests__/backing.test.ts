/**
 * Per-chain credit backing + credit-level bridge tests.
 *
 * Verifies the "global spend, per-network backing" ledger:
 *   - deposits accumulate backing on the chain they landed on,
 *   - getBacking / getAllBacking read it back,
 *   - bridgeBacking atomically moves attribution between chains and rejects
 *     insufficient / same-chain / non-positive moves.
 */

import { describe, it, beforeAll, afterAll, expect } from "vitest";
import type { Address } from "viem";
import { createTestDb, type TestDbHandle } from "./db-harness.js";
import {
  getBacking,
  getAllBacking,
  creditBackingDeposit,
  bridgeBacking,
} from "../backing.js";

const WALLET = "0xBAcc000000000000000000000000000000000001" as Address;
const ETH = 1;
const BASE = 8453;

let handle: TestDbHandle;

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
  await handle.close();
});

describe("credit backing", () => {
  it("returns 0 for a wallet with no backing", async () => {
    expect(await getBacking(handle.db, WALLET, ETH)).toBe(0n);
  });

  it("accumulates deposits per chain and ignores non-positive amounts", async () => {
    await creditBackingDeposit(handle.db, WALLET, ETH, 100n);
    await creditBackingDeposit(handle.db, WALLET, ETH, 50n);
    await creditBackingDeposit(handle.db, WALLET, BASE, 30n);
    await creditBackingDeposit(handle.db, WALLET, BASE, 0n); // no-op

    expect(await getBacking(handle.db, WALLET, ETH)).toBe(150n);
    expect(await getBacking(handle.db, WALLET, BASE)).toBe(30n);

    const all = await getAllBacking(handle.db, WALLET);
    expect(all[ETH]).toBe(150n);
    expect(all[BASE]).toBe(30n);
  });

  it("is case-insensitive on the wallet address", async () => {
    // The same wallet in different casing maps to one backing row.
    expect(await getBacking(handle.db, WALLET.toLowerCase() as Address, ETH)).toBe(150n);
  });

  it("bridges backing between chains atomically", async () => {
    // ETH=150, BASE=30. Bridge 60 ETH -> BASE.
    const r = await bridgeBacking(handle.db, {
      wallet: WALLET,
      fromChainId: ETH,
      toChainId: BASE,
      amount: 60n,
    });
    expect(r.ok).toBe(true);
    expect(r.fromAmount).toBe(90n);
    expect(r.toAmount).toBe(90n);
    expect(await getBacking(handle.db, WALLET, ETH)).toBe(90n);
    expect(await getBacking(handle.db, WALLET, BASE)).toBe(90n);
  });

  it("conserves total backing across a bridge", async () => {
    const all = await getAllBacking(handle.db, WALLET);
    expect((all[ETH] ?? 0n) + (all[BASE] ?? 0n)).toBe(180n); // 150 + 30, unchanged
  });

  it("rejects a bridge exceeding source backing", async () => {
    const r = await bridgeBacking(handle.db, {
      wallet: WALLET,
      fromChainId: ETH,
      toChainId: BASE,
      amount: 1_000n,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/[Ii]nsufficient/);
    // State untouched.
    expect(await getBacking(handle.db, WALLET, ETH)).toBe(90n);
  });

  it("rejects same-chain and non-positive bridges", async () => {
    expect((await bridgeBacking(handle.db, { wallet: WALLET, fromChainId: ETH, toChainId: ETH, amount: 1n })).ok).toBe(false);
    expect((await bridgeBacking(handle.db, { wallet: WALLET, fromChainId: ETH, toChainId: BASE, amount: 0n })).ok).toBe(false);
  });
});
