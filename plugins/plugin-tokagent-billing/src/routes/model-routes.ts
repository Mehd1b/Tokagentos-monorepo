/**
 * Active-model selection routes (gateway-wide "active model" feature).
 *
 *   GET /v1/model  (PUBLIC, no auth) → { active, models }
 *   PUT /v1/model  (AUTH: wallet session / API key) body { model } → { active }
 *
 * ONE active model applies to the whole gateway/agent (not per-key). It is the
 * DEFAULT model for external API-key requests that omit `model` (see
 * messages-proxy-routes / billing-gate) and the model the agent chat targets.
 * Default is "glm-4.7".
 *
 * Uses `rawPath: true` so routes mount at the exact path (Decision Z32).
 * Returns 503 when billing is disabled (BILLING_ENABLED=false).
 */

import type { IncomingMessage } from "node:http";
import {
  buildModelCatalog,
  getActiveModel,
  isSelectableModel,
  setActiveModel,
} from "@tokagentos/billing";
import type {
  IAgentRuntime,
  Route,
  RouteRequest,
  RouteResponse,
} from "@tokagentos/core";
import { ensureClientReady, forward, pickForward } from "../lib/forward.js";
import { resolveBillingIdentity } from "../middleware/api-key-resolve.js";
import {
  getBillingState,
  getServerBillingState,
  isBillingStateInitialized,
} from "../state.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function billingUnavailable(res: RouteResponse): void {
  res.status(503).json({ error: "Billing service unavailable." });
}

function toIncomingMessage(req: RouteRequest): IncomingMessage {
  return {
    headers: req.headers ?? {},
    socket: { remoteAddress: undefined },
  } as unknown as IncomingMessage;
}

// ---------------------------------------------------------------------------
// GET /v1/model — public
// ---------------------------------------------------------------------------

/**
 * Return the gateway-wide active model and the selectable catalog.
 *
 * Response 200:
 * ```json
 * {
 *   "active": "glm-4.7",
 *   "models": [
 *     { "id": "glm-4.7", "label": "GLM 4.7", "inputPerM": 0.80, "outputPerM": 4.00 },
 *     ...
 *   ]
 * }
 * ```
 *
 * PUBLIC — the chat surface reads this (unauthenticated) to display the active
 * model next to the agent name, and the dashboard reads it to render the
 * selector. The catalog is static (derived from PRICING); only `active` is DB-
 * backed and falls back to the default when unset.
 */
async function handleGetModel(
  _req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!isBillingStateInitialized()) return billingUnavailable(res);
  const { db, config } = getServerBillingState();
  if (!config.enabled) return billingUnavailable(res);

  const active = await getActiveModel(db);
  res.status(200).json({
    active,
    models: buildModelCatalog(),
  });
}

// ---------------------------------------------------------------------------
// PUT /v1/model — authenticated
// ---------------------------------------------------------------------------

/**
 * Set the gateway-wide active model.
 *
 * Body: `{ "model": "<id>" }` — must be one of the 9 selectable models.
 * Response 200: `{ "active": "<id>" }`. 400 on unknown id. 401 unauthenticated.
 *
 * AUTH: same identity mechanism as the other authed routes (wallet SIWE JWT
 * session OR sk-ai-* API key) via `resolveBillingIdentity`.
 */
async function handleSetModel(
  req: RouteRequest,
  res: RouteResponse,
  _runtime: IAgentRuntime,
): Promise<void> {
  if (!isBillingStateInitialized()) return billingUnavailable(res);
  const { db, config } = getServerBillingState();
  if (!config.enabled) return billingUnavailable(res);

  const identity = await resolveBillingIdentity(toIncomingMessage(req));
  if (!identity) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;
  const model = typeof body?.["model"] === "string" ? body["model"].trim() : "";
  if (!model) {
    res.status(400).json({ error: "Missing required field: model" });
    return;
  }
  if (!isSelectableModel(model)) {
    res.status(400).json({ error: `Unknown model '${model}'.` });
    return;
  }

  try {
    await setActiveModel(db, model);
  } catch (err) {
    // setActiveModel re-validates and throws on an unknown id; we already
    // checked above, so this is a defensive belt-and-braces 400.
    const message = err instanceof Error ? err.message : "set model failed";
    res.status(400).json({ error: message });
    return;
  }

  res.status(200).json({ active: model });
}

// ---------------------------------------------------------------------------
// Route definitions (server-mode)
// ---------------------------------------------------------------------------

export const modelRoutes: Route[] = [
  {
    type: "GET",
    path: "/v1/model",
    rawPath: true,
    public: true,
    name: "billing-model-get",
    handler: handleGetModel,
  },
  {
    type: "PUT",
    path: "/v1/model",
    rawPath: true,
    public: true,
    name: "billing-model-set",
    handler: handleSetModel,
  },
];

// ---------------------------------------------------------------------------
// Client-mode forwarders
// ---------------------------------------------------------------------------

function clientModelRoutes(): Route[] {
  return [
    {
      type: "GET",
      path: "/v1/model",
      rawPath: true,
      public: true,
      name: "billing-model-get",
      handler: async (_req, res) => {
        if (!ensureClientReady(res)) return;
        await forward(res, () => getBillingState().gateway!.model.get());
      },
    },
    {
      type: "PUT",
      path: "/v1/model",
      rawPath: true,
      public: true,
      name: "billing-model-set",
      handler: async (req, res) => {
        if (!ensureClientReady(res)) return;
        await forward(res, () =>
          getBillingState().gateway!.model.set(pickForward(req), req.body),
        );
      },
    },
  ];
}

export function getModelRoutes(mode: "server" | "client"): Route[] {
  return mode === "client" ? clientModelRoutes() : modelRoutes;
}
