import { useEffect, useState } from "react";
import { client } from "../api/client";

/**
 * Gateway-wide active model (GET /v1/model, public). Fetched on mount and
 * polled so the chat header reflects operator changes made from the billing
 * dashboard without a reload.
 *
 * Uses the shared client.fetch() wrapper so the agent base URL + auth handling
 * is reused (the GET is public; the wrapper only attaches a Bearer token when
 * one is present). Best-effort: any fetch error leaves the previous value in
 * place (or `null` when nothing has loaded yet) so the chat UI never breaks on
 * a missing or unreachable route.
 */
interface GatewayModelState {
  active?: string;
}

export function useActiveModel(pollMs = 60_000): string | null {
  const [activeModel, setActiveModel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      try {
        const state = await client.fetch<GatewayModelState>("/v1/model", {
          signal: controller.signal,
        });
        if (!cancelled && typeof state?.active === "string" && state.active) {
          setActiveModel(state.active);
        }
      } catch {
        // Best-effort — gateway may be unreachable or the route absent.
        // Keep the last known value rather than clearing the pill.
      }
    };

    void load();
    const timer =
      pollMs > 0 ? setInterval(() => void load(), pollMs) : undefined;

    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearInterval(timer);
    };
  }, [pollMs]);

  return activeModel;
}
