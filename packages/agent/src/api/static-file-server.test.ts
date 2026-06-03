/**
 * Regression guard for the static UI server's namespace ownership.
 *
 * Background: GET /v1/model was served as the SPA index.html (HTTP 200, HTML)
 * instead of reaching the billing plugin, because serveStaticUi used
 * isAuthProtectedRoute as its "is this an API path?" gate. When /v1/model was
 * added to BILLING_PUBLIC_V1_ROOTS (public, auth-exempt), isAuthProtectedRoute
 * began returning false for it, so serveStaticUi stopped declining it and fell
 * through to the index.html fallback — breaking the chat's active-model pill
 * (the client JSON-parses HTML and silently fails, leaving the pill empty).
 *
 * The fix: serveStaticUi declines paths via isServerOwnedNamespace, which is
 * independent of auth. This test locks in the invariant that EVERY billing
 * public route is BOTH server-owned (never served as HTML) AND auth-exempt
 * (not 401'd by the outer /v1/* gate), so future additions to the allowlist
 * cannot silently regress into being served as the SPA index again.
 */

import { describe, expect, it } from "vitest";
import {
  BILLING_PUBLIC_V1_ROOTS,
  isAuthProtectedRoute,
  isServerOwnedNamespace,
} from "./static-file-server.js";

describe("static-file-server namespace ownership", () => {
  it("treats /api, /v1, /ws (and sub-paths) as server-owned", () => {
    for (const p of [
      "/api",
      "/api/agents",
      "/v1",
      "/v1/model",
      "/v1/models",
      "/ws",
      "/ws/socket",
    ]) {
      expect(isServerOwnedNamespace(p)).toBe(true);
    }
  });

  it("treats SPA navigation routes + assets as NOT server-owned", () => {
    // These must fall through to the index.html / static-file path so the SPA
    // renders. None live under /api, /v1, or /ws.
    for (const p of [
      "/",
      "/chat",
      "/settings",
      "/billing",
      "/index.html",
      "/assets/app-abc123.js",
    ]) {
      expect(isServerOwnedNamespace(p)).toBe(false);
    }
  });

  it("REGRESSION: every billing public route is server-owned but auth-exempt", () => {
    // If a billing public route were NOT server-owned, serveStaticUi would
    // return index.html (HTML) to a JSON fetch. If it were auth-protected, the
    // outer /v1/* gate would 401 the public read. Both invariants must hold for
    // every entry — and for their sub-paths (e.g. /v1/keys/:id, /v1/quote/:id).
    for (const root of BILLING_PUBLIC_V1_ROOTS) {
      expect(isServerOwnedNamespace(root)).toBe(true);
      expect(isAuthProtectedRoute(root)).toBe(false);
      expect(isServerOwnedNamespace(`${root}/sub`)).toBe(true);
      expect(isAuthProtectedRoute(`${root}/sub`)).toBe(false);
    }
  });

  it("GET /v1/model specifically reaches the plugin (the original bug)", () => {
    expect(isServerOwnedNamespace("/v1/model")).toBe(true);
    expect(isAuthProtectedRoute("/v1/model")).toBe(false);
  });

  it("non-public /v1 routes remain auth-protected", () => {
    // A /v1 path NOT in the billing allowlist stays gated by the auth layer.
    const protectedPath = "/v1/internal-private-route";
    expect(isServerOwnedNamespace(protectedPath)).toBe(true);
    expect(isAuthProtectedRoute(protectedPath)).toBe(true);
  });

  it("/v1/model and /v1/models do not collide via the startsWith carve-out", () => {
    // "/v1/models" must not be exempted by the "/v1/model" allowlist entry's
    // sub-path rule (which only matches the literal prefix "/v1/model/").
    // Both are independently listed and independently public.
    expect(isAuthProtectedRoute("/v1/model")).toBe(false);
    expect(isAuthProtectedRoute("/v1/models")).toBe(false);
  });
});
