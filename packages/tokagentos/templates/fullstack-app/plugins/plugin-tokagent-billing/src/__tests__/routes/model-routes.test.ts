/**
 * Unit tests for model-routes.ts (gateway-wide active-model selection).
 *
 * Calls route handlers directly with a seeded billing state and PGLite DB.
 * Auth is mocked via x-dev-wallet (BILLING_AUTH_REQUIRED=false, dev mode).
 */

import type {
  IAgentRuntime,
  RouteRequest,
  RouteResponse,
} from "@elizaos/core";
import type { Address } from "viem";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { modelRoutes } from "../../routes/model-routes.js";
import {
  type BillingPluginState,
  clearBillingState,
  setBillingState,
} from "../../state.js";
import { createTestDb, type TestDbHandle } from "../db-harness.js";

const WALLET = "0xd0d0000000000000000000000000000000000001" as Address;

function makeConfig(
  extra: Record<string, unknown> = {},
): BillingPluginState["config"] {
  return {
    enabled: true,
    authRequired: false,
    authSecret: "test-billing-auth-secret-model",
    authSessionTtlMs: 86_400_000,
    authLoginNonceTtlMs: 300_000,
    rateLimitEnabled: false,
    ...extra,
  } as unknown as BillingPluginState["config"];
}

function findHandler(method: string, path: string) {
  const route = modelRoutes.find((r) => r.type === method && r.path === path);
  if (!route?.handler) throw new Error(`Route not found: ${method} ${path}`);
  return route.handler;
}

function makeRes() {
  let _status = 200;
  let _body: unknown;
  const res = {
    status(code: number) {
      _status = code;
      return res;
    },
    json(data: unknown) {
      _body = data;
      return res;
    },
    send(data: unknown) {
      _body = data;
      return res;
    },
    end() {
      return res;
    },
    get statusCode() {
      return _status;
    },
    get body() {
      return _body;
    },
  };
  return res as unknown as RouteResponse & {
    statusCode: number;
    body: unknown;
  };
}

function makeReqWithWallet(extra: Partial<RouteRequest> = {}): RouteRequest {
  return { headers: { "x-dev-wallet": WALLET }, ...extra };
}

const fakeRuntime = {} as IAgentRuntime;

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

describe("GET /v1/model", () => {
  const handler = findHandler("GET", "/v1/model");

  it("is public — returns 200 with no auth and defaults active to glm-4.7", async () => {
    const res = makeRes();
    await handler({} as RouteRequest, res, fakeRuntime);
    expect(res.statusCode).toBe(200);
    const body = res.body as {
      active: string;
      models: Array<{
        id: string;
        label: string;
        inputPerM: number;
        outputPerM: number;
      }>;
    };
    expect(body.active).toBe("glm-4.7");
    expect(body.models).toHaveLength(9);
    const glm = body.models.find((m) => m.id === "glm-4.7");
    expect(glm).toEqual({
      id: "glm-4.7",
      label: "GLM 4.7",
      inputPerM: 0.8,
      outputPerM: 4.0,
    });
  });

  it("returns 503 when billing is disabled", async () => {
    await clearBillingState();
    const res = makeRes();
    await handler({} as RouteRequest, res, fakeRuntime);
    expect(res.statusCode).toBe(503);
  });
});

describe("PUT /v1/model", () => {
  const putHandler = findHandler("PUT", "/v1/model");
  const getHandler = findHandler("GET", "/v1/model");

  it("returns 401 when not authenticated", async () => {
    const res = makeRes();
    await putHandler(
      { headers: {}, body: { model: "gpt-5.2" } } as RouteRequest,
      res,
      fakeRuntime,
    );
    expect(res.statusCode).toBe(401);
  });

  it("returns 400 on a missing model field", async () => {
    const res = makeRes();
    await putHandler(makeReqWithWallet({ body: {} }), res, fakeRuntime);
    expect(res.statusCode).toBe(400);
  });

  it("returns 400 on an unknown model id", async () => {
    const res = makeRes();
    await putHandler(
      makeReqWithWallet({ body: { model: "not-a-real-model" } }),
      res,
      fakeRuntime,
    );
    expect(res.statusCode).toBe(400);
  });

  it("sets a valid model and GET reflects it", async () => {
    const putRes = makeRes();
    await putHandler(
      makeReqWithWallet({ body: { model: "minimax-m2.5" } }),
      putRes,
      fakeRuntime,
    );
    expect(putRes.statusCode).toBe(200);
    expect((putRes.body as { active: string }).active).toBe("minimax-m2.5");

    const getRes = makeRes();
    await getHandler({} as RouteRequest, getRes, fakeRuntime);
    expect((getRes.body as { active: string }).active).toBe("minimax-m2.5");
  });
});
