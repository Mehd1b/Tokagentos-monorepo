/**
 * Gateway-wide settings ledger — a tiny key/value store backed by
 * `billing_settings`.
 *
 * Current consumer: the `active_model` key for the gateway-wide "active model"
 * selection. ONE model applies to the whole gateway/agent — it is the DEFAULT
 * model for external API-key requests that omit `model`, and the model the
 * agent chat targets. Default is `glm-4.7` when unset or when a stored value is
 * no longer in `SELECTABLE_MODELS` (e.g. the model lineup changed).
 *
 * Writes use a SERIALIZABLE upsert so concurrent PUT /v1/model calls don't race
 * to a torn read-modify-write.
 */

import { logger } from "@tokagentos/core";
import { eq } from "drizzle-orm";
import { DEFAULT_ACTIVE_MODEL, isSelectableModel } from "../pricing/models.js";
import { withSerializableRetry } from "./retry.js";
import { type BillingDatabase, billingSettings } from "./schema.js";

const log = logger.child({ src: "billing:settings" });

/** The billing_settings key under which the active model id is stored. */
export const ACTIVE_MODEL_KEY = "active_model";

/** Read an arbitrary setting value, or null when the key is absent. */
export async function getSetting(
  db: BillingDatabase,
  key: string,
): Promise<string | null> {
  const rows = await db
    .select()
    .from(billingSettings)
    .where(eq(billingSettings.key, key));
  return rows[0]?.value ?? null;
}

/** Upsert an arbitrary setting value. */
export async function setSetting(
  db: BillingDatabase,
  key: string,
  value: string,
): Promise<void> {
  await withSerializableRetry(db, async (tx) => {
    const rows = await tx
      .select()
      .from(billingSettings)
      .where(eq(billingSettings.key, key));
    if (rows.length > 0) {
      await tx
        .update(billingSettings)
        .set({ value, updatedAt: new Date() })
        .where(eq(billingSettings.key, key));
    } else {
      await tx
        .insert(billingSettings)
        .values({ key, value, updatedAt: new Date() });
    }
  });
}

/**
 * Resolve the gateway-wide active model.
 *
 * Returns `DEFAULT_ACTIVE_MODEL` ("glm-4.7") when:
 *   - no row exists yet (fresh install), or
 *   - the stored value is no longer one of `SELECTABLE_MODELS` (the served
 *     lineup changed underneath a previously-set value).
 *
 * Never throws — a DB read failure also falls back to the default so the
 * inference/billing hot path is never blocked on this lookup.
 */
export async function getActiveModel(db: BillingDatabase): Promise<string> {
  try {
    const stored = await getSetting(db, ACTIVE_MODEL_KEY);
    if (stored && isSelectableModel(stored)) return stored;
    return DEFAULT_ACTIVE_MODEL;
  } catch (err) {
    log.warn(
      { err: (err as Error).message },
      "getActiveModel read failed — falling back to default",
    );
    return DEFAULT_ACTIVE_MODEL;
  }
}

/**
 * Set the gateway-wide active model. Rejects (throws) when `model` is not one
 * of `SELECTABLE_MODELS` — the route surfaces this as a 400. The upsert is
 * atomic under SERIALIZABLE isolation.
 */
export async function setActiveModel(
  db: BillingDatabase,
  model: string,
): Promise<void> {
  if (!isSelectableModel(model)) {
    throw new Error(`Unknown model '${model}' — not in selectable model list.`);
  }
  await setSetting(db, ACTIVE_MODEL_KEY, model);
  log.info({ model }, "active model updated");
}
