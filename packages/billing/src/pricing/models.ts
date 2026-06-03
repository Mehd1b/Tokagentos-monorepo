/**
 * Selectable model catalog for the gateway-wide "active model" feature.
 *
 * ONE active model applies to the whole gateway/agent (not per-key). It is the
 * DEFAULT model for external API-key calls that omit a `model` field, and it is
 * the model the agent's chat inference targets (best-effort). The default is
 * `glm-4.7`.
 *
 * `SELECTABLE_MODELS` is the ordered allowlist the operator's LiteLLM actually
 * serves. Every id here MUST exist in `PRICING` (rates.ts) so the catalog
 * builder can surface input/output USD-per-1M rates — and MUST be in
 * `SUPPORTED_MODELS` (the billing allowlist) so a request defaulted to it
 * passes the gate. A unit test in this package guards both invariants.
 */

import { PRICING } from "./rates.js";

/**
 * The 9 selectable models, in display order. These are the models Tokamak's
 * LiteLLM serves (see https://api.ai.tokamak.network/v1/models). The first
 * entry is NOT the default — `DEFAULT_ACTIVE_MODEL` is the canonical default.
 */
export const SELECTABLE_MODELS = [
  "gemini-3-flash",
  "gemini-3-pro",
  "gpt-5.2-pro",
  "gpt-5.2",
  "glm-4.7",
  "qwen3-235b",
  "minimax-m2.5",
  "minimax-m2.5-slow",
  "deepseek-v3.2",
] as const;

export type SelectableModel = (typeof SELECTABLE_MODELS)[number];

/** Default active model when none has been set (or a stored value is stale). */
export const DEFAULT_ACTIVE_MODEL: SelectableModel = "glm-4.7";

/** Set form for O(1) membership checks. */
const SELECTABLE_MODELS_SET = new Set<string>(SELECTABLE_MODELS);

/** True if `model` is one of the selectable gateway models. */
export function isSelectableModel(model: string): boolean {
  return SELECTABLE_MODELS_SET.has(model);
}

/**
 * Human-readable titles for the catalog. Falls back to a title-cased form of
 * the id when an explicit label is absent, so adding a model to
 * `SELECTABLE_MODELS` never silently produces an empty label.
 */
const MODEL_LABELS: Record<string, string> = {
  "gemini-3-flash": "Gemini 3 Flash",
  "gemini-3-pro": "Gemini 3 Pro",
  "gpt-5.2-pro": "GPT-5.2 Pro",
  "gpt-5.2": "GPT-5.2",
  "glm-4.7": "GLM 4.7",
  "qwen3-235b": "Qwen3 235B",
  "minimax-m2.5": "MiniMax M2.5",
  "minimax-m2.5-slow": "MiniMax M2.5 Slow",
  "deepseek-v3.2": "DeepSeek V3.2",
};

function labelFor(id: string): string {
  return MODEL_LABELS[id] ?? id;
}

/** A single catalog entry returned by `GET /v1/model`. */
export interface ModelCatalogEntry {
  id: string;
  label: string;
  /** Input price, USD per 1,000,000 tokens (from PRICING). */
  inputPerM: number;
  /** Output price, USD per 1,000,000 tokens (from PRICING). */
  outputPerM: number;
}

/**
 * Build the ordered catalog of selectable models with their per-1M input/output
 * USD rates pulled from `PRICING`. A model present in `SELECTABLE_MODELS` but
 * absent from `PRICING` is skipped (defensive — the package test asserts this
 * never happens, but we never want the route to throw on a stale id).
 */
export function buildModelCatalog(): ModelCatalogEntry[] {
  const out: ModelCatalogEntry[] = [];
  for (const id of SELECTABLE_MODELS) {
    const rates = PRICING[id];
    if (!rates) continue;
    out.push({
      id,
      label: labelFor(id),
      inputPerM: rates.input,
      outputPerM: rates.output,
    });
  }
  return out;
}
