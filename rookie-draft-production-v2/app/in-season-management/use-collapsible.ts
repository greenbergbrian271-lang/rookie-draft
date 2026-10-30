"use client";

import { useCallback, useEffect, useState } from "react";

const scrollToLeague = (id: string) => document.getElementById(`lg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

/** Fold-down state for a list of league cards, plus jump-to-league (also from a #lg-<id> link). */
export function useCollapsible(ids: string[], storageKey: string) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const idsKey = ids.join("|");

  useEffect(() => {
    try { const raw = window.sessionStorage.getItem(storageKey); if (raw) setCollapsed(JSON.parse(raw)); } catch { /* optional */ }
  }, [storageKey]);

  // Arriving from an Overview card (#lg-<league id>): open that league and scroll to it.
  useEffect(() => {
    const hash = window.location.hash;
    if (!ids.length || !hash.startsWith("#lg-")) return;
    const id = hash.slice(4);
    setCollapsed((current) => ({ ...current, [id]: false }));
    const timer = window.setTimeout(() => scrollToLeague(id), 200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const save = useCallback((next: Record<string, boolean>) => {
    try { window.sessionStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* optional */ }
    return next;
  }, [storageKey]);

  const toggle = useCallback((id: string) => setCollapsed((current) => save({ ...current, [id]: !current[id] })), [save]);
  const jump = useCallback((id: string) => {
    setCollapsed((current) => save({ ...current, [id]: false }));
    window.setTimeout(() => scrollToLeague(id), 60);
  }, [save]);
  const collapseAll = useCallback(() => setCollapsed(save(Object.fromEntries(ids.map((id) => [id, true])))), [ids, save]);
  const expandAll = useCallback(() => setCollapsed(save({})), [save]);

  return { collapsed, toggle, jump, collapseAll, expandAll };
}
