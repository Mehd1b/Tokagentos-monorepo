/**
 * Gateway active-model domain.
 *
 * ONE active model serves the whole gateway/agent. It is the default model for
 * external API-key calls and is also displayed in the chat UI next to the
 * agent name (e.g. "Kira · glm-4.7").
 *
 * Backed by the billing gateway routes (rawPath, mounted at the agent root):
 *   GET /v1/model  (PUBLIC, no auth)
 *     -> { active: "<id>", models: [{ id, label, inputPerM, outputPerM }, ...] }
 *   PUT /v1/model  (AUTH: wallet session) body { model: "<id>" }
 *     -> { active: "<id>" } | 400 on unknown id
 *
 * Uses this.fetch() so the agent base URL + auth resolution is reused from
 * client-base (GET is public, but the shared wrapper only attaches a Bearer
 * token when one is present, so it works for both routes).
 */

import { TokagentClient } from "./client-base";

export interface GatewayModelOption {
  id: string;
  label: string;
  inputPerM: number;
  outputPerM: number;
}

export interface GatewayModelState {
  active: string;
  models: GatewayModelOption[];
}

declare module "./client-base" {
  interface TokagentClient {
    /** GET /v1/model — gateway-wide active model + selectable catalog (public). */
    getActiveModel(options?: {
      signal?: AbortSignal;
    }): Promise<GatewayModelState>;
    /** PUT /v1/model — set the gateway-wide active model (authed). */
    setActiveModel(model: string): Promise<{ active: string }>;
  }
}

TokagentClient.prototype.getActiveModel = async function (
  this: TokagentClient,
  options?: { signal?: AbortSignal },
): Promise<GatewayModelState> {
  return this.fetch<GatewayModelState>(
    "/v1/model",
    options?.signal ? { signal: options.signal } : undefined,
  );
};

TokagentClient.prototype.setActiveModel = async function (
  this: TokagentClient,
  model: string,
): Promise<{ active: string }> {
  return this.fetch<{ active: string }>("/v1/model", {
    method: "PUT",
    body: JSON.stringify({ model }),
  });
};
