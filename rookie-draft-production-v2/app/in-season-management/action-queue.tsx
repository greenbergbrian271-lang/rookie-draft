"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronRight, ChevronUp, RotateCcw, X } from "lucide-react";
import type { AlertAlternative, InSeasonAlert, Intent } from "@/lib/in-season";
import styles from "./in-season-management.module.css";

const LABEL = { critical: "Fix now", high: "Check today", watch: "Keep an eye on" } as const;
const ACTION = { "auto-sub": "Set an Auto-Sub", swap: "Swap in your lineup", none: "No option" } as const;
const pts = (value: number | null) => (value == null ? "—" : value.toFixed(1));

function Alternatives({ items, focus }: { items: AlertAlternative[]; focus: string }) {
  return (
    <div className={styles.altList}>
      {items.map((alt) => (
        <div className={`${styles.altRow} ${focus === alt.leagueId ? styles.altFocus : ""}`} key={alt.leagueId}>
          <div className={styles.altHead}>
            <span className={styles.typeBadge}>{alt.leagueType}</span>
            <strong>{alt.leagueName}</strong>
            <span className={`${styles.altAction} ${styles[`alt_${alt.action}`]}`}>{ACTION[alt.action]} · {alt.slot}</span>
          </div>
          <p>{alt.note}</p>
          {alt.options.length > 0 && (
            <ul>
              {alt.options.map((option, index) => (
                <li key={option.id}><b>{index === 0 ? "Best: " : ""}{option.name}</b> <small>{option.position} · proj {pts(option.proj)} · avg {pts(option.avg)}</small></li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ActionQueue({ alerts, dismissed, loaded, onDismiss, onRestore, onIntent, saveError }: {
  alerts: InSeasonAlert[];
  dismissed: Record<string, string>;
  loaded: boolean;
  onDismiss: (id: string) => void;
  onRestore: (id: string) => void;
  onIntent: (leagueId: string, intent: Intent) => void;
  saveError?: string;
}) {
  const [filter, setFilter] = useState("all");
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [showDismissed, setShowDismissed] = useState(false);

  useEffect(() => { try { setHidden(window.localStorage.getItem("ism-queue-hidden") === "1"); } catch { /* optional */ } }, []);
  const toggleHidden = () => setHidden((value) => { try { window.localStorage.setItem("ism-queue-hidden", value ? "0" : "1"); } catch { /* optional */ } return !value; });

  const leagues = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; type: string }>();
    alerts.forEach((alert) => alert.leagues.forEach((league) => seen.set(league.id, league)));
    return [...seen.values()];
  }, [alerts]);

  const inFilter = (alert: InSeasonAlert) => filter === "all" || alert.leagues.some((league) => league.id === filter);
  const scoped = alerts.filter(inFilter);
  const active = scoped.filter((alert) => !dismissed[alert.id]);
  const dismissedList = scoped.filter((alert) => dismissed[alert.id]);
  const countFor = (id: string) => alerts.filter((alert) => !dismissed[alert.id] && alert.leagues.some((league) => league.id === id)).length;
  const totalOpen = alerts.filter((alert) => !dismissed[alert.id]).length;

  const renderAlert = (alert: InSeasonAlert, isDismissed: boolean) => {
    const alternatives = alert.alternatives || [];
    const expanded = open[alert.id];
    const shownLeagues = filter === "all" ? alert.leagues : alert.leagues.filter((league) => league.id === filter);
    return (
      <li key={alert.id} className={`${styles.queueItem} ${styles[`queue_${alert.severity}`]} ${isDismissed ? styles.queueDismissed : ""}`}>
        <span className={styles.queueSeverity}>{LABEL[alert.severity]}</span>
        <div className={styles.queueBody}>
          <strong>{alert.title}</strong>
          <div className={styles.queueTags}>{shownLeagues.map((league) => <span key={league.id}>{league.name}</span>)}</div>
          {alert.detail && <p>{alert.detail}</p>}
          {alert.kind === "intent" && alert.intentLeagueId && !isDismissed && (
            <div className={styles.queueButtons}>
              <button type="button" onClick={() => onIntent(alert.intentLeagueId!, "Contend")}>Go for it (Contend)</button>
              <button type="button" onClick={() => onIntent(alert.intentLeagueId!, "Rebuild")}>Focus on next year (Rebuild)</button>
            </div>
          )}
          {alternatives.length > 0 && !isDismissed && (
            <>
              <button type="button" className={styles.queueToggle} onClick={() => setOpen((current) => ({ ...current, [alert.id]: !expanded }))}>
                {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {expanded ? "Hide" : "See"} {alternatives.length > 1 ? `options by league (${alternatives.length})` : "options"}
              </button>
              {expanded && <Alternatives items={alternatives} focus={filter} />}
            </>
          )}
          <div className={styles.queueFooter}>
            {isDismissed
              ? <button type="button" className={styles.queueGhost} onClick={() => onRestore(alert.id)}><RotateCcw size={12} /> Restore</button>
              : <button type="button" className={styles.queueGhost} onClick={() => onDismiss(alert.id)} title="Hide this alert until the Tuesday reset"><X size={12} /> Dismiss until Tuesday</button>}
          </div>
        </div>
      </li>
    );
  };

  const fixNow = alerts.filter((alert) => !dismissed[alert.id] && alert.severity === "critical").length;
  return (
    <section className={styles.actionQueue} aria-label="Action queue">
      <button type="button" className={styles.queueBar} aria-expanded={!hidden} onClick={toggleHidden}>
        <span className={styles.queueBarText}>
          <span className={styles.sectionKicker}>Action queue</span>
          <strong>What needs your attention</strong>
          <small>{!loaded ? "Checking your lineups…" : totalOpen === 0 ? "Nothing open right now" : `${totalOpen} open${fixNow ? ` · ${fixNow} to fix now` : ""}${Object.keys(dismissed).length ? ` · ${Object.keys(dismissed).length} dismissed` : ""}`}</small>
        </span>
        <span className={styles.queueCount}>{loaded ? totalOpen : "…"}</span>
        <span className={styles.queueChevron}>{hidden ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</span>
      </button>
      {!hidden && <p className={styles.queueHint}>One alert per player, best players first. Dismissed alerts come back after the next Tuesday reset. <Link href="/in-season-management/lineups">Open lineups <ChevronRight size={12} /></Link></p>}
      {saveError && <p className={styles.leagueWarning}>{saveError}</p>}
      {hidden || !loaded ? null : (
        <>
          {leagues.length > 1 && (
            <div className={styles.filterRow} role="tablist" aria-label="Filter alerts by league">
              <button type="button" role="tab" aria-selected={filter === "all"} className={filter === "all" ? styles.filterOn : ""} onClick={() => setFilter("all")}>All leagues <b>{totalOpen}</b></button>
              {leagues.map((league) => (
                <button type="button" role="tab" aria-selected={filter === league.id} key={league.id} className={filter === league.id ? styles.filterOn : ""} onClick={() => setFilter(league.id)}>{league.name} <b>{countFor(league.id)}</b></button>
              ))}
            </div>
          )}
          {active.length === 0 ? (
            <div className={styles.queueClear}><CheckCircle2 size={18} /><div><strong>Nothing needs attention{filter === "all" ? "" : " in this league"}</strong><span>No injured, inactive, or empty starters{dismissedList.length ? `, and ${dismissedList.length} dismissed until Tuesday` : ""}.</span></div></div>
          ) : (
            <ul className={styles.queueList}>{active.map((alert) => renderAlert(alert, false))}</ul>
          )}
          {dismissedList.length > 0 && (
            <>
              <button type="button" className={styles.queueToggle} onClick={() => setShowDismissed((value) => !value)}>{showDismissed ? "Hide" : "Show"} {dismissedList.length} dismissed</button>
              {showDismissed && <ul className={styles.queueList}>{dismissedList.map((alert) => renderAlert(alert, true))}</ul>}
            </>
          )}
        </>
      )}
    </section>
  );
}
