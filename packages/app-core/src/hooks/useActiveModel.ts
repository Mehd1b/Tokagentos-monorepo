import { useEffect, useState } from "react";
import { client } from "../api/client";
// Side-effect import: registers getActiveModel/setActiveModel on the
// TokagentClient prototype. Kept here (not in client.ts) so this feature
// doesn't touch client.ts, which carries unrelated in-flight changes.
import "../api/client-model";

/**
 * Fetches the gateway-wide active model from `GET /v1/model` (PUBLIC, no auth)
 * on mount and refreshes it on an interval so the chat header reflects operator
 * changes made from the billing dashboard without a reload.
 *
 * Best-effort: any fetch error leaves the previous value in place (or `null`
 * when nothing has loaded yet) so the chat UI never breaks on a missing route.
 */
export function useActiveModel(pollMs = 60_000): string | null {
  const [activeModel, setActiveModel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const load = async () => {
      try {
        const state = await client.getActiveModel({
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
