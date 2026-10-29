"use client";

import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";
import type { InSeasonAlert } from "@/lib/in-season";
import styles from "./in-season-management.module.css";

const LABEL = { critical: "Fix now", high: "Check today", watch: "Keep an eye on" } as const;

export default function ActionQueue({ alerts, loaded }: { alerts: InSeasonAlert[]; loaded: boolean }) {
  return (
    <section className={styles.actionQueue} aria-label="Action queue">
      <div className={styles.sectionHeading}>
        <div>
          <div className={styles.sectionKicker}>Action queue</div>
          <h2>What needs your attention</h2>
          <p>Injured, inactive, or empty starting slots across your active teams. Updates whenever you refresh from Sleeper.</p>
        </div>
        <Link className={styles.textLink} href="/in-season-management/lineups">Open lineups <ChevronRight size={13} /></Link>
      </div>
      {!loaded ? null : alerts.length === 0 ? (
        <div className={styles.queueClear}><CheckCircle2 size={18} /><div><strong>Nothing flagged right now</strong><span>No injured, inactive, or empty starters were found in your active lineups.</span></div></div>
      ) : (
        <ul className={styles.queueList}>
          {alerts.map((alert) => (
            <li key={alert.id} className={`${styles.queueItem} ${styles[`queue_${alert.severity}`]}`}>
              <span className={styles.queueSeverity}>{LABEL[alert.severity]}</span>
              <div><strong>{alert.title}</strong><small>{alert.leagueType} · {alert.leagueName}</small><p>{alert.detail}</p></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
