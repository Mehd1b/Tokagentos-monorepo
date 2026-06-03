/**
 * Gateway-wide settings ledger + model catalog tests (active-model feature).
 *
 * Also doubles as the migration smoke test for `billing_settings` — createTestDb
 * runs migrate() over the full drizzle/migrations folder, so a failed CREATE
 * TABLE would fail beforeAll here.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  buildModelCatalog,
  DEFAULT_ACTIVE_MODEL,
  isSelectableModel,
  SELECTABLE_MODELS,
} from "../../pricing/models.js";
import { PRICING, SUPPORTED_MODELS } from "../../pricing/rates.js";
import {
  ACTIVE_MODEL_KEY,
  getActiveModel,
  getSetting,
  setActiveModel,
  setSetting,
} from "../settings.js";
import { createTestDb, type TestDbHandle } from "./db-harness.js";

let handle: TestDbHandle;

beforeAll(async () => {
  handle = await createTestDb();
});

afterAll(async () => {
  await handle.close();
});

describe("active model setting", () => {
  it("defaults to glm-4.7 when unset", async () => {
    expect(DEFAULT_ACTIVE_MODEL).toBe("glm-4.7");
    expect(await getActiveModel(handle.db)).toBe("glm-4.7");
  });

  it("persists a selectable model and reads it back", async () => {
    await setActiveModel(handle.db, "gpt-5.2");
    expect(await getActiveModel(handle.db)).toBe("gpt-5.2");
    // Upsert (not duplicate insert) on a second write.
    await setActiveModel(handle.db, "gemini-3-pro");
    expect(await getActiveModel(handle.db)).toBe("gemini-3-pro");
  });

  it("rejects an unknown model", async () => {
    await expect(
      setActiveModel(handle.db, "not-a-real-model"),
    ).rejects.toThrow();
    // Unchanged after a rejected write.
    expect(await getActiveModel(handle.db)).toBe("gemini-3-pro");
  });

  it("falls back to default when a stored value is no longer selectable", async () => {
    // Write a value directly that is NOT in SELECTABLE_MODELS (simulate a
    // lineup change underneath a previously-valid stored value).
    await setSetting(handle.db, ACTIVE_MODEL_KEY, "claude-opus-4-7");
    expect(await getSetting(handle.db, ACTIVE_MODEL_KEY)).toBe(
      "claude-opus-4-7",
    );
    expect(await getActiveModel(handle.db)).toBe(DEFAULT_ACTIVE_MODEL);
  });
});

describe("model catalog", () => {
  it("lists exactly the 9 selectable models in order", () => {
    expect(SELECTABLE_MODELS).toHaveLength(9);
    const catalog = buildModelCatalog();
    expect(catalog.map((m) => m.id)).toEqual([...SELECTABLE_MODELS]);
  });

  it("every selectable model is priced and on the billing allowlist", () => {
    for (const id of SELECTABLE_MODELS) {
      expect(PRICING[id], `PRICING missing ${id}`).toBeDefined();
      expect(SUPPORTED_MODELS.has(id), `SUPPORTED_MODELS missing ${id}`).toBe(
        true,
      );
      expect(isSelectableModel(id)).toBe(true);
    }
  });

  it("surfaces input/output per-1M rates from PRICING", () => {
    const glm = buildModelCatalog().find((m) => m.id === "glm-4.7");
    expect(glm).toEqual({
      id: "glm-4.7",
      label: "GLM 4.7",
      inputPerM: 0.8,
      outputPerM: 4.0,
    });
  });
});
