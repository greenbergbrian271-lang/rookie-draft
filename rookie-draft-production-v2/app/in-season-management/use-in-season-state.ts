"use client";

import { useCallback, useEffect, useState } from "react";
import type { Intent, Intents } from "@/lib/in-season";

type Remote = { intents?: Intents; dismissed?: Record<string, string>; weekKey?: string; error?: string };

/** Declared Contend/Rebuild intent and dismissed alerts. Stored server-side so they follow you across devices. */
export function useInSeasonState() {
  const [intents, setIntents] = useState<Intents>({});
  const [dismissed, setDismissed] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    fetch("/api/in-season/state", { cache: "no-store" })
      .then((response) => response.json() as Promise<Remote>)
      .then((data) => { setIntents(data.intents || {}); setDismissed(data.dismissed || {}); })
      .catch(() => { /* state is optional; the page still works without it */ });
  }, []);

  const post = useCallback(async (body: Record<string, unknown>) => {
    setSaveError("");
    const response = await fetch("/api/in-season/state", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) {
      setSaveError(response.status === 401 ? "Sign in as owner (Admin Access) to save changes." : "Could not save that change.");
      return null;
    }
    return (await response.json()) as Remote;
  }, []);

  const setIntent = useCallback(async (leagueId: string, intent: Intent | null) => {
    const before = intents;
    setIntents((current) => { const next = { ...current }; if (intent) next[leagueId] = intent; else delete next[leagueId]; return next; });
    const saved = await post({ action: "intent", leagueId, intent });
    if (!saved) setIntents(before);
  }, [intents, post]);

  const dismiss = useCallback(async (alertId: string) => {
    const before = dismissed;
    setDismissed((current) => ({ ...current, [alertId]: "now" }));
    const saved = await post({ action: "dismiss", alertId });
    if (!saved) setDismissed(before);
  }, [dismissed, post]);

  const restore = useCallback(async (alertId: string) => {
    const before = dismissed;
    setDismissed((current) => { const next = { ...current }; delete next[alertId]; return next; });
    const saved = await post({ action: "restore", alertId });
    if (!saved) setDismissed(before);
  }, [dismissed, post]);

  return { intents, dismissed, saveError, setIntent, dismiss, restore };
}
