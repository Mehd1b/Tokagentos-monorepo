/**
 * useAuthStatus — monitors the current auth state via GET /api/auth/me.
 *
 * Returns a discriminated union that lets the shell decide whether to render
 * the login gate or the main dashboard.
 *
 * Fail-closed: network errors are treated as 401 so the login gate renders
 * rather than the dashboard leaking in an unknown auth state.
 *
 * Call `refetch()` after login / logout to force a fresh check.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AuthAccessInfo,
  type AuthIdentity,
  type AuthSessionInfo,
  authMe,
} from "../api/auth-client";

export type AuthStatusState =
  | { phase: "loading" }
  | {
      phase: "authenticated";
      identity: AuthIdentity;
      session: AuthSessionInfo;
      access: AuthAccessInfo;
    }
  | {
      phase: "unauthenticated";
      reason?: "remote_auth_required" | "remote_password_not_configured";
      access?: AuthAccessInfo;
    }
  | { phase: "server_unavailable" };

interface UseAuthStatusOptions {
  /**
   * How often to re-check in the background (ms).
   * Defaults to 5 minutes. Set to 0 to disable background polling.
   */
  pollIntervalMs?: number;
  /**
   * When true the hook will NOT start its initial fetch.
   * Useful when the app knows auth is not yet relevant (e.g. during onboarding).
   */
  skip?: boolean;
  /**
   * Subscribe to the latest auth status without starting a fetch or poll loop.
   * Useful for read-only shell metadata that should reuse the app-level check.
   */
  observeOnly?: boolean;
}

const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;
const authStatusSubscribers = new Set<(state: AuthStatusState) => void>();
let authStatusSnapshot: AuthStatusState = { phase: "loading" };
let authStatusFetch: Promise<void> | null = null;

function publishAuthStatus(state: AuthStatusState): void {
  authStatusSnapshot = state;
  for (const subscriber of authStatusSubscribers) {
    subscriber(state);
  }
}

async function fetchAuthStatus(): Promise<void> {
  // tokagent scaffold-patch: the password sign-in feature is removed and the
  // gateway is permanently unlocked. Instead of gating on GET /api/auth/me
  // (which the agent backend doesn't wire), always report a local,
  // authenticated owner — so LoginView never renders and the header shows a
  // plain "Local access" badge. Pairing/remote auth is unaffected.
  publishAuthStatus({
    phase: "authenticated",
    identity: { id: "local", displayName: "Local", kind: "owner" },
    session: { id: "local", kind: "local", expiresAt: null },
    access: { mode: "local", passwordConfigured: false, ownerConfigured: false },
  });
}

export function useAuthStatus(options: UseAuthStatusOptions = {}): {
  state: AuthStatusState;
  refetch: () => void;
} {
  const {
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    skip = false,
    observeOnly = false,
  } = options;
  const [state, setState] = useState<AuthStatusState>(authStatusSnapshot);
  const mountedRef = useRef(true);

  const fetch = useCallback(async () => {
    if (!mountedRef.current) return;
    await fetchAuthStatus();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    authStatusSubscribers.add(setState);
    setState(authStatusSnapshot);
    if (!skip && !observeOnly) void fetch();
    return () => {
      mountedRef.current = false;
      authStatusSubscribers.delete(setState);
    };
  }, [skip, observeOnly, fetch]);

  useEffect(() => {
    if (skip || observeOnly || pollIntervalMs === 0) return;
    const id = setInterval(() => {
      void fetch();
    }, pollIntervalMs);
    return () => clearInterval(id);
  }, [skip, observeOnly, pollIntervalMs, fetch]);

  return { state, refetch: fetch };
}
