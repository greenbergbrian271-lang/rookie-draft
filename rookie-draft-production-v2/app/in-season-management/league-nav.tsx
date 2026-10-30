"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import styles from "./in-season-management.module.css";

type Item = { id: string; name: string; type: string };

/** Sticky bar to hop between leagues, grouped by type, with fold-all / unfold-all. */
export function LeagueNav({ leagues, onJump, onCollapseAll, onExpandAll }: { leagues: Item[]; onJump: (id: string) => void; onCollapseAll: () => void; onExpandAll: () => void }) {
  if (leagues.length < 2) return null;
  const types = [...new Set(leagues.map((league) => league.type))];
  return (
    <nav className={styles.leagueNav} aria-label="Jump to a league">
      <div className={styles.leagueNavChips}>
        {types.map((type) => (
          <div className={styles.leagueNavGroup} key={type}>
            <span>{type}</span>
            {leagues.filter((league) => league.type === type).map((league) => <button type="button" key={league.id} onClick={() => onJump(league.id)}>{league.name}</button>)}
          </div>
        ))}
      </div>
      <div className={styles.leagueNavActions}>
        <button type="button" onClick={onCollapseAll}>Fold all</button>
        <button type="button" onClick={onExpandAll}>Unfold all</button>
      </div>
    </nav>
  );
}

/** Clickable league header that folds the card body. */
export function LeagueHeader({ type, name, meta, summary, collapsed, onToggle }: { type: string; name: string; meta: string; summary?: string; collapsed: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={styles.leagueHeader} aria-expanded={!collapsed} onClick={onToggle}>
      <span className={styles.leagueHeaderMain}>
        <span className={styles.leagueHeaderTop}><span className={styles.typeBadge}>{type}</span><span className={styles.leagueSeason}>{meta}</span></span>
        <strong>{name}</strong>
        {collapsed && summary && <small>{summary}</small>}
      </span>
      <span className={styles.leagueHeaderChevron}>{collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}</span>
    </button>
  );
}

/** A manager's name that opens their Manager Card. Falls back to plain text when there is no card (you, or still loading). */
export function ManagerLink({ ownerId, children, onOpen }: { ownerId?: string; children: React.ReactNode; onOpen?: (ownerId: string) => void }) {
  if (!ownerId || !onOpen) return <>{children}</>;
  return <button type="button" className={styles.mgrLink} onClick={(event) => { event.stopPropagation(); onOpen(ownerId); }} title="Open manager card">{children}</button>;
}
