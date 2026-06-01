/**
 * Unit tests for topup-routes.ts.
 *
 * Tests GET /v1/topup/info, POST /v1/topup/quote, POST /v1/topup/settle,
 *       POST /v1/topup/preauth, GET /v1/topup/status, POST /v1/topup/revoke,
 *       GET /v1/quote/:id.
 *
 * Settle is tested at the auth/rate-limit boundary only — no real chain calls.
 * Auth is mocked via x-dev-wallet (dev mode).
 */

import { describe, it, beforeAll, afterAll, beforeEach, expect, vi } from "vitest";
import { topupRoutes, resetTopupState } from "../../routes/topup-routes.js";
import {
  setBillingState,
  clearBillingState,
  type BillingPluginState,
} from "../../state.js";
import { createTestDb, type TestDbHandle } from "../db-harness.js";
import { BASE_MAINNET, ptonDomain } from "@tokagentos/billing";
import type { RouteRequest, RouteResponse, IAgentRuntime } from "@tokagentos/core";
import type { Address } from "viem";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WALLET = "0xcafe000000000000000000000000000000000001" as Address;
const PTON_ADDRESS = "0x1234567890123456789012345678901234567890" as Address;
const VAULT_ADDRESS = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address;
const FIXED_TON_USD = 5.0;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(extra: Record<string, unknown> = {}): BillingPluginState["config"] {
  return {
    enabled: true,
    authRequired: false,
    authSecret: "test-billing-auth-secret-topup",
    authSessionTtlMs: 86_400_000,
    authLoginNonceTtlMs: 300_000,
    rateLimitEnabled: false,
    rateLimitQuotePerMin: 60,
    rateLimitSettlePerMin: 30,
    fixedTonUsd: FIXED_TON_USD,
    chainId: 1,
    ptonAddress: PTON_ADDRESS,
    vaultAddress: VAULT_ADDRESS,
    topupAmountPton: 1_000_000_000_000_000_000n, // 1 TON
    effectiveMarginBps: 0,
    ...extra,
  } as unknown as BillingPluginState["config"];
}

function findHandler(method: string, path: string) {
  const route = topupRoutes.find((r) => r.type === method && r.path === path);
  if (!route?.handler) throw new Error(`Route not found: ${method} ${path}`);
  return route.handler;
}

function makeRes() {
  let _status = 200;
  let _body: unknown;
  const res = {
    status(code: number) { _status = code; return res; },
    json(data: unknown) { _body = data; return res; },
    send(data: unknown) { _body = data; return res; },
    end() { return res; },
    get statusCode() { return _status; },
    get body() { return _body; },
  };
  return res as unknown as RouteResponse & { statusCode: number; body: unknown };
}

function makeReq(body: Record<string, unknown> = {}, extra: Partial<RouteRequest> = {}): RouteRequest {
  return {
    headers: { "x-dev-wallet": WALLET },
    body: body as RouteRequest["body"],
    ...extra,
  };
}

const fakeRuntime = {} as IAgentRuntime;

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let handle: TestDbHandle;

beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "development");
  handle = await createTestDb();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await clearBillingState();
  await handle.close();
});

beforeEach(async () => {
  await clearBillingState();
  setBillingState({
    pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
    db: handle.db,
    clients: {} as BillingPluginState["clients"],
    config: makeConfig(),
  });
});

// ---------------------------------------------------------------------------
// GET /v1/topup/info
// ---------------------------------------------------------------------------

describe("GET /v1/topup/info", () => {
  const handler = findHandler("GET", "/v1/topup/info");

  it("returns 401 when not authenticated", async () => {
    const res = makeRes();
    await handler({}, res, fakeRuntime);
    expect(res.statusCode).toBe(401);
  });

  it("returns 503 when billing is disabled", async () => {
    await clearBillingState();
    const res = makeRes();
    await handler(makeReq(), res, fakeRuntime);
    expect(res.statusCode).toBe(503);
  });

  it("returns 200 with EIP-712 domain info", async () => {
    const res = makeRes();
    await handler(makeReq(), res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    const body = res.body as {
      domain: { name: string; version: string; chainId: number; verifyingContract: string };
      vaultAddress: string;
      ptonAddress: string;
      chainId: number;
    };
    expect(body.domain).toBeDefined();
    expect(body.vaultAddress.toLowerCase()).toBe(VAULT_ADDRESS.toLowerCase());
    expect(body.ptonAddress.toLowerCase()).toBe(PTON_ADDRESS.toLowerCase());
    expect(body.chainId).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// POST /v1/topup/quote
// ---------------------------------------------------------------------------

describe("POST /v1/topup/quote", () => {
  const handler = findHandler("POST", "/v1/topup/quote");

  it("returns 401 when not authenticated", async () => {
    const res = makeRes();
    await handler({ body: {} }, res, fakeRuntime);
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with default quote when no amountUsd provided", async () => {
    const res = makeRes();
    await handler(makeReq({}), res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    const body = res.body as {
      topupId: string;
      amountPton: string;
      amountUsd: number;
      tonUsd: number;
      expiresAt: string;
      vaultAddress: string;
      ptonAddress: string;
    };
    expect(typeof body.topupId).toBe("string");
    expect(body.topupId.length).toBeGreaterThan(0);
    expect(typeof body.amountPton).toBe("string");
    expect(BigInt(body.amountPton)).toBeGreaterThan(0n);
    expect(typeof body.amountUsd).toBe("number");
    expect(body.tonUsd).toBe(FIXED_TON_USD);
    expect(typeof body.expiresAt).toBe("string");
    expect(body.vaultAddress.toLowerCase()).toBe(VAULT_ADDRESS.toLowerCase());
    expect(body.ptonAddress.toLowerCase()).toBe(PTON_ADDRESS.toLowerCase());
  });

  it("returns 200 with custom amountUsd quote", async () => {
    const res = makeRes();
    await handler(makeReq({ amountUsd: 10 }), res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    const body = res.body as { topupId: string; amountUsd: number; amountPton: string };
    expect(typeof body.topupId).toBe("string");
    expect(body.amountUsd).toBeCloseTo(10, 0);
    expect(BigInt(body.amountPton)).toBeGreaterThan(0n);
  });

  it("returns 503 when no TON price is available", async () => {
    await clearBillingState();
    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig({ fixedTonUsd: undefined }),
    });
    const res = makeRes();
    await handler(makeReq({}), res, fakeRuntime);
    expect(res.statusCode).toBe(503);
  });

  it("returns Base pton/vault/domain when chainId:8453 is provided", async () => {
    const res = makeRes();
    await handler(makeReq({ chainId: 8453 }), res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    const body = res.body as {
      chainId: number;
      vaultAddress: string;
      ptonAddress: string;
      domain: { chainId: number; verifyingContract: string };
    };
    expect(body.chainId).toBe(8453);
    expect(body.ptonAddress.toLowerCase()).toBe(BASE_MAINNET.pton!.toLowerCase());
    expect(body.vaultAddress.toLowerCase()).toBe(BASE_MAINNET.claudeVault!.toLowerCase());
    // Domain must bind the resolved chain + pton (verifyingContract).
    const expectedDomain = ptonDomain(8453, BASE_MAINNET.pton!);
    expect(body.domain.chainId).toBe(expectedDomain.chainId);
    expect((body.domain.verifyingContract ?? "").toLowerCase()).toBe(
      String(expectedDomain.verifyingContract).toLowerCase(),
    );
  });

  it("returns 400 for an unsupported chainId", async () => {
    const res = makeRes();
    // 137 (Polygon) is registered in BILLING_CHAIN_MAP but has null pton/vault.
    await handler(makeReq({ chainId: 137 }), res, fakeRuntime);
    expect(res.statusCode).toBe(400);
    const body = res.body as { error: string };
    expect(body.error).toBe("Unsupported or unconfigured chain: 137");
  });

  it("returns 400 for a chainId with no map entry at all", async () => {
    const res = makeRes();
    await handler(makeReq({ chainId: 999999 }), res, fakeRuntime);
    expect(res.statusCode).toBe(400);
    const body = res.body as { error: string };
    expect(body.error).toBe("Unsupported or unconfigured chain: 999999");
  });

  it("falls back to config chain when chainId is omitted (backward compatible)", async () => {
    const res = makeRes();
    await handler(makeReq({}), res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    const body = res.body as {
      chainId: number;
      vaultAddress: string;
      ptonAddress: string;
    };
    expect(body.chainId).toBe(1);
    expect(body.vaultAddress.toLowerCase()).toBe(VAULT_ADDRESS.toLowerCase());
    expect(body.ptonAddress.toLowerCase()).toBe(PTON_ADDRESS.toLowerCase());
  });
});

// ---------------------------------------------------------------------------
// POST /v1/topup/settle
// ---------------------------------------------------------------------------

describe("POST /v1/topup/settle", () => {
  const handler = findHandler("POST", "/v1/topup/settle");

  it("returns 401 when not authenticated", async () => {
    const res = makeRes();
    await handler({ body: {} }, res, fakeRuntime);
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 when topupId is missing", async () => {
    const res = makeRes();
    await handler(makeReq({ signature: { v: 27, r: "0x" + "a".repeat(64), s: "0x" + "b".repeat(64) } }), res, fakeRuntime);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when signature is missing", async () => {
    const res = makeRes();
    await handler(makeReq({ topupId: "some-id" }), res, fakeRuntime);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when signature has wrong shape", async () => {
    const res = makeRes();
    await handler(makeReq({ topupId: "some-id", signature: "0xhex" }), res, fakeRuntime);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when topupId does not exist", async () => {
    const res = makeRes();
    await handler(
      makeReq({
        topupId: "00000000-0000-0000-0000-000000000001",
        signature: { v: 27, r: "0x" + "a".repeat(64), s: "0x" + "b".repeat(64) },
      }),
      res,
      fakeRuntime,
    );
    expect(res.statusCode).toBe(404);
  });

  it("returns 400 for an unsupported settle chainId", async () => {
    const res = makeRes();
    await handler(
      makeReq({
        chainId: 137,
        topupId: "00000000-0000-0000-0000-000000000001",
        signature: { v: 27, r: "0x" + "a".repeat(64), s: "0x" + "b".repeat(64) },
      }),
      res,
      fakeRuntime,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe(
      "Unsupported or unconfigured chain: 137",
    );
  });

  it("returns 400 'Settlement not available' when chain has no operator client", async () => {
    // chainId 8453 is selectable, but no BILLING_BASE_RPC_URL is set and
    // it is not the configured chain (1), so no operator client exists.
    delete process.env.BILLING_BASE_RPC_URL;
    const res = makeRes();
    await handler(
      makeReq({
        chainId: 8453,
        topupId: "00000000-0000-0000-0000-000000000001",
        signature: { v: 27, r: "0x" + "a".repeat(64), s: "0x" + "b".repeat(64) },
      }),
      res,
      fakeRuntime,
    );
    expect(res.statusCode).toBe(400);
    expect((res.body as { error: string }).error).toBe(
      "Settlement not available for chain 8453 (no operator client configured)",
    );
  });

  it("resolves the Base vault for the authorization.to cross-check (chainId:8453)", async () => {
    // Build an operator client for Base so getClientsForChain succeeds, then
    // create a Base quote and submit an X-PAYMENT whose authorization.to is the
    // CONFIG (Ethereum) vault — the resolved Base vault must drive the check,
    // so we expect a 400 whose message references the Base vault address.
    // Use a raw env assignment (not vi.stubEnv) so the finally block can clear
    // it without disturbing the NODE_ENV stub installed in beforeAll.
    process.env.BILLING_BASE_RPC_URL = "https://mainnet.base.org";
    resetTopupState();
    // getClientsForChain builds a viem account from config.operatorPrivateKey;
    // provide a valid dummy 32-byte key + RPC fields so createBillingClients
    // succeeds for the Base path.
    await clearBillingState();
    setBillingState({
      pool: { end: async () => {} } as unknown as BillingPluginState["pool"],
      db: handle.db,
      clients: {} as BillingPluginState["clients"],
      config: makeConfig({
        operatorPrivateKey: ("0x" + "1".repeat(64)) as `0x${string}`,
        chainRpcUrl: "https://mainnet.example",
        mainnetRpcUrl: "https://mainnet.example",
      }),
    });
    try {
      // Create a quote on Base so the settle's quote lookup succeeds.
      const quoteHandler = findHandler("POST", "/v1/topup/quote");
      const quoteRes = makeRes();
      await quoteHandler(makeReq({ chainId: 8453 }), quoteRes, fakeRuntime);
      expect(quoteRes.statusCode).toBe(200);
      const { topupId } = quoteRes.body as { topupId: string };

      const xPayment = Buffer.from(
        JSON.stringify({
          x402Version: 1,
          scheme: "exact",
          network: 8453,
          payload: {
            signature: { v: 27, r: "0x" + "a".repeat(64), s: "0x" + "b".repeat(64) },
            authorization: {
              from: WALLET,
              // Wrong vault on purpose — config (Ethereum) vault, not Base's.
              to: VAULT_ADDRESS,
              value: "0",
              validAfter: "0",
              validBefore: "9999999999",
              nonce: "0x" + "c".repeat(64),
            },
            quoteId: topupId,
          },
        }),
        "utf8",
      ).toString("base64");

      const res = makeRes();
      await handler(
        makeReq({ chainId: 8453 }, { headers: { "x-dev-wallet": WALLET, "x-payment": xPayment } }),
        res,
        fakeRuntime,
      );
      expect(res.statusCode).toBe(400);
      const err = (res.body as { error: string }).error;
      // The check must reference the resolved BASE vault, not the config vault.
      expect(err.toLowerCase()).toContain(BASE_MAINNET.claudeVault!.toLowerCase());
      expect(err.toLowerCase()).not.toContain(VAULT_ADDRESS.toLowerCase());
    } finally {
      delete process.env.BILLING_BASE_RPC_URL;
      resetTopupState();
    }
  });
});

// ---------------------------------------------------------------------------
// POST /v1/topup/preauth
// ---------------------------------------------------------------------------

describe("POST /v1/topup/preauth", () => {
  const handler = findHandler("POST", "/v1/topup/preauth");

  it("returns 401 when not authenticated", async () => {
    const res = makeRes();
    await handler({ body: {} }, res, fakeRuntime);
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 when slots array is missing", async () => {
    const res = makeRes();
    await handler(makeReq({}), res, fakeRuntime);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 when slots is empty", async () => {
    const res = makeRes();
    await handler(makeReq({ slots: [] }), res, fakeRuntime);
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/topup/status
// ---------------------------------------------------------------------------

describe("GET /v1/topup/status", () => {
  const handler = findHandler("GET", "/v1/topup/status");

  it("returns 401 when not authenticated", async () => {
    const res = makeRes();
    await handler({}, res, fakeRuntime);
    expect(res.statusCode).toBe(401);
  });

  it("returns 200 with slot:null for fresh wallet", async () => {
    const res = makeRes();
    await handler(makeReq(), res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    const body = res.body as { slot: unknown };
    expect(body.slot).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/topup/revoke
// ---------------------------------------------------------------------------

describe("POST /v1/topup/revoke", () => {
  const handler = findHandler("POST", "/v1/topup/revoke");

  it("returns 401 when not authenticated", async () => {
    const res = makeRes();
    await handler({ body: {} }, res, fakeRuntime);
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 when nonce is missing", async () => {
    const res = makeRes();
    await handler(makeReq({}), res, fakeRuntime);
    expect(res.statusCode).toBe(400);
  });

  it("returns 404 when nonce does not match any slot", async () => {
    const res = makeRes();
    await handler(makeReq({ nonce: "0xdeadbeef" }), res, fakeRuntime);
    expect(res.statusCode).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /v1/quote/:id
// ---------------------------------------------------------------------------

describe("GET /v1/quote/:id", () => {
  const handler = findHandler("GET", "/v1/quote/:id");

  it("returns 401 when not authenticated", async () => {
    const res = makeRes();
    await handler({ params: { id: "some-id" } }, res, fakeRuntime);
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for unknown quote id", async () => {
    const res = makeRes();
    await handler(makeReq({}, { params: { id: "nonexistent-quote-xyz" } }), res, fakeRuntime);
    expect(res.statusCode).toBe(404);
  });

  it("returns 200 for a stored quote", async () => {
    // First create a quote via /v1/topup/quote
    const quoteHandler = findHandler("POST", "/v1/topup/quote");
    const quoteRes = makeRes();
    await quoteHandler(makeReq({}), quoteRes, fakeRuntime);
    expect(quoteRes.statusCode).toBe(200);
    const { topupId } = quoteRes.body as { topupId: string };

    // Then fetch it by ID
    const res = makeRes();
    await handler(makeReq({}, { params: { id: topupId } }), res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    const body = res.body as { topupId: string; amountPton: string };
    expect(body.topupId).toBe(topupId);
  });
});
