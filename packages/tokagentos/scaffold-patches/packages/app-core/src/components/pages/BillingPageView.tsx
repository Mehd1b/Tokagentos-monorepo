/**
 * BillingPageView — embeds the operator billing dashboard inside the main
 * app shell via an iframe.
 *
 * The dashboard is a vanilla-JS SPA served by the tokagent-billing plugin
 * at /v1/billing/dashboard. It handles SIWE login, PTON top-up, API key
 * issuance, credit ledger inspection, and 90-day usage history. We embed
 * it via iframe so the dashboard's vanilla-JS surface stays decoupled from
 * the scaffold's React tree — the plugin can iterate on the dashboard
 * without re-publishing app-core overlays.
 *
 * When billing isn't yet configured (BILLING_ENABLED=false), the iframe
 * loads the setup-panel HTML wizard instead. The plugin's /v1/billing/status
 * endpoint reports `{enabled:bool}` — we hit it once on mount and pick the
 * right URL. Either way the user sees a fixed Billing tab; the content
 * just routes to the right entry point.
 *
 * Theme handoff (parent → dashboard):
 *   1. The iframe src carries `?embed=1` as a first-paint hint. The
 *      dashboard's pre-paint script reads it and sets <html data-embed="1">
 *      before stylesheet evaluation, so it never flashes the standalone
 *      topbar inside the parent shell.
 *   2. After the iframe loads we postMessage a small token bundle keyed
 *      to the parent app's gold brand palette (parent has no rich
 *      theme state to read, so the values are hardcoded here — the
 *      dashboard's stylesheet keys every visual off :root custom props,
 *      so a single push re-skins the UI without touching iframe markup).
 */

import { useEffect, useRef, useState } from "react";

// tokagentOS gold brand tokens for the embedded billing dashboard, mirroring
// brand-gold.css / base.css. The dashboard keys every visual off :root custom
// properties, so we postMessage the active theme's tokens (light or dark) and
// re-push when the app theme changes. Kept inline (not imported) so
// scaffold-patches stay independent of any app's bundling.
const DARK_TOKENS = {
  bg0: "#050506",
  bg1: "rgba(255,255,255,0.05)",
  bg2: "#0a0a0c",
  line: "rgba(255,255,255,0.10)",
  text: "#f0f0f4",
  muted: "#9ca3af",
  accent: "#f0b90b",
  accent2: "#f3ba2f",
} as const;

const LIGHT_TOKENS = {
  bg0: "#f7f8fa",
  bg1: "rgba(0,0,0,0.04)",
  bg2: "#ffffff",
  line: "rgba(0,0,0,0.10)",
  text: "#1e2329",
  muted: "#5e6673",
  accent: "#f0b90b",
  accent2: "#d8a000",
} as const;

/** Read the app's active theme from the document root (.dark / data-theme). */
function isDarkTheme(): boolean {
  if (typeof document === "undefined") return true;
  const root = document.documentElement;
  return (
    root.classList.contains("dark") ||
    root.getAttribute("data-theme") === "dark"
  );
}

/** Push the active theme's tokens to the dashboard iframe (best-effort). */
function pushThemeToIframe(win: Window | null | undefined): void {
  if (!win) return;
  const dark = isDarkTheme();
  try {
    win.postMessage(
      {
        source: "tal-host",
        type: "theme",
        tokens: dark ? DARK_TOKENS : LIGHT_TOKENS,
        mode: dark ? "dark" : "light",
      },
      location.origin,
    );
  } catch {
    // Same-origin postMessage is best-effort; the ?embed=1 first-paint hint
    // already covers initial styling, so swallow the failure silently.
  }
}

function BillingPageView(): React.ReactElement {
  // Pick the dashboard if billing is configured, the setup wizard if not.
  // Both URLs go through the Vite dev proxy (/v1/* → agent API on 31337).
  // `?embed=1` flips the dashboard's embed-mode flag at first paint.
  const [src, setSrc] = useState<string>("/v1/billing/dashboard?embed=1");
  const [loading, setLoading] = useState<boolean>(true);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/v1/billing/status")
      .then((res) => (res.ok ? (res.json() as Promise<{ enabled: boolean }>) : Promise.reject()))
      .then((json) => {
        if (cancelled) return;
        setSrc(
          json.enabled === true
            ? "/v1/billing/dashboard?embed=1"
            : "/v1/billing/setup-panel?embed=1",
        );
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        // Plugin unreachable — default to setup-panel so the user has an
        // entry point even if the agent is mid-boot.
        setSrc("/v1/billing/setup-panel?embed=1");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-push the theme to the iframe whenever the app toggles light/dark, so
  // the embedded dashboard tracks the parent theme live (not just on load).
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(() => {
      pushThemeToIframe(iframeRef.current?.contentWindow);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  // Push the active theme's tokens once the iframe has loaded. The dashboard
  // listens for `{ source: "tal-host", type: "theme", tokens, mode }` and
  // writes them onto :root, so a single push re-skins it.
  const handleIframeLoad = (): void => {
    pushThemeToIframe(iframeRef.current?.contentWindow);
  };

  // Use flex-fill (NOT position:absolute/inset:0) so the parent's
  // AppWorkspaceChrome — which already reserves space for the sidebar
  // and the top header — can place us inside its main slot without our
  // iframe escaping above the header.
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
      }}
    >
      {loading ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--muted)",
            fontSize: "0.9rem",
          }}
        >
          Loading billing…
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          src={src}
          title="Billing"
          onLoad={handleIframeLoad}
          // sandbox is intentionally loose — the iframe loads same-origin
          // content (the agent's own API) and needs wallet access via
          // window.ethereum, top-level navigation, and clipboard for the
          // copy-key flow. Locking it down breaks the dashboard.
          style={{
            flex: 1,
            border: "none",
            background: "var(--bg)",
          }}
          allow="clipboard-read; clipboard-write"
        />
      )}
    </div>
  );
}

export { BillingPageView };
export default BillingPageView;
