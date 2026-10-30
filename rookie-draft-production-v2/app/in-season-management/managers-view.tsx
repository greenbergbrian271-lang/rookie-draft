"use client";

import { useState } from "react";
import { ChevronRight, RefreshCw, Search } from "lucide-react";
import type { ManagerCard } from "@/lib/in-season-managers";
import styles from "./in-season-management.module.css";

const pts = (value: number | null | undefined) => (value == null ? "—" : value.toFixed(1));
const WINDOW_CLASS = (value?: string) => (value === "Contender" ? styles.windowContender : value === "Rebuilder" ? styles.windowRebuilder : styles.windowMiddle);

export function ManagerAvatar({ card }: { card: ManagerCard }) {
  return card.avatar
    ? <img className={styles.mgrAvatar} src={`https://sleepercdn.com/avatars/thumbs/${card.avatar}`} alt="" width={44} height={44} loading="lazy" />
    : <span className={styles.mgrAvatar}>{card.name.slice(0, 1).toUpperCase()}</span>;
}

export function ManagerDetail({ card }: { card: ManagerCard }) {
  return (
    <div className={styles.mgrDetail}>
      <section>
        <h4>Shared leagues &amp; team profiles</h4>
        {card.leagues.map((entry) => {
          const { standing } = entry;
          const counts = ["QB", "RB", "WR", "TE"].map((pos) => `${pos} ${entry.positionCounts[pos] || 0}`).join(" · ");
          return (
            <div className={styles.mgrLeague} key={entry.leagueId}>
              <div className={styles.mgrLeagueHead}>
                <span className={styles.typeBadge}>{entry.leagueType}</span>
                <strong>{entry.leagueName}</strong>
                {entry.facingMeThisWeek && <span className={styles.youTag}>Plays you this week</span>}
                {entry.window && <span className={`${styles.windowTag} ${WINDOW_CLASS(entry.window.classification)}`}>{entry.window.classification === "Stuck in the Middle" ? "Middle" : entry.window.classification}</span>}
              </div>
              <p>
                <b>{entry.team.teamName || entry.team.owner}</b> · {entry.leagueType === "Guillotine" ? (standing.eliminated ? "Eliminated" : "Alive") : `${standing.wins}-${standing.losses}${standing.ties ? `-${standing.ties}` : ""}`} · #{standing.rank} of {entry.teams} · {pts(standing.pf)} PF · {pts(standing.avg)} per week
              </p>
              <small>{counts}{entry.averageAge != null ? ` · avg skill age ${entry.averageAge.toFixed(1)}` : ""}</small>
              <small>Waivers this season: {entry.claims} claim{entry.claims === 1 ? "" : "s"}, {entry.freeAgents} free-agent add{entry.freeAgents === 1 ? "" : "s"}{entry.faabBudget ? `, $${entry.faabSpent} of $${entry.faabBudget} FAAB` : ""}</small>
            </div>
          );
        })}
      </section>

      <section>
        <h4>Tendencies</h4>
        {card.tags.length === 0 ? <p className={styles.mgrMuted}>Not enough activity yet to call a tendency.</p> : (
          <ul className={styles.mgrTagList}>{card.tags.map((tag) => <li key={tag.label}><b>{tag.label}</b><span>{tag.detail}</span></li>)}</ul>
        )}
      </section>

      <section>
        <h4>Trades{card.seasonsCovered.length ? ` (${card.seasonsCovered.join(" + ")})` : ""}</h4>
        <p className={styles.mgrMuted}>
          {card.tradeCount} trade{card.tradeCount === 1 ? "" : "s"} · {card.tradesWithMe} with you · picks in {card.picksIn}, out {card.picksOut}
          {card.avgAgeGot != null && card.avgAgeGave != null ? ` · avg age acquired ${card.avgAgeGot.toFixed(1)} vs given ${card.avgAgeGave.toFixed(1)}` : ""}
        </p>
        {card.partners.length > 0 && <p className={styles.mgrMuted}>Trades most with: {card.partners.map((p) => `${p.name} (${p.count})`).join(", ")}</p>}
        {card.recentTrades.map((trade, index) => <p className={styles.mgrTrade} key={index}><small>{trade.season} · {trade.league}</small>{trade.summary}</p>)}
      </section>

      <section>
        <h4>Player exposure</h4>
        {card.exposure.length === 0 ? <p className={styles.mgrMuted}>No player appears on his rosters in more than one shared league.</p> : (
          <ul className={styles.mgrChips}>{card.exposure.map((p) => <li key={p.id} title={p.leagues.join(", ")}>{p.name} <b>×{p.leagues.length}</b></li>)}</ul>
        )}
        {card.sharedPlayers.length > 0 && (
          <>
            <p className={styles.mgrMuted}>Players you both roster ({card.sharedPlayers.length}):</p>
            <ul className={styles.mgrChips}>{card.sharedPlayers.slice(0, 14).map((p) => <li key={p.id} title={p.leagues.join(", ")}>{p.name}</li>)}</ul>
          </>
        )}
      </section>
    </div>
  );
}

export default function ManagersView({ cards, txLoading, txError, onOpenManager, loaded }: {
  cards: ManagerCard[]; txLoading: boolean; txError: string; onOpenManager: (ownerId: string) => void; loaded: boolean;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = cards.filter((card) => card.name.toLowerCase().includes(q) || card.leagues.some((entry) => entry.team.teamName?.toLowerCase().includes(q)));
  return (
    <section className={styles.modulePage}>
      <div className={styles.moduleHero}>
        <div>
          <div className={styles.sectionKicker}>Manager cards</div>
          <h2>The managers you play with</h2>
          <p>Click any card to open that manager&rsquo;s full card. You can also click a manager&rsquo;s team name anywhere in this section, such as standings, matchups and lineups. Trade history covers this season plus last season for dynasty leagues.</p>
        </div>
      </div>
      {txError && <p className={styles.leagueWarning}>{txError}</p>}
      {txLoading && <p className={styles.leagueNote}>Loading trade and waiver history…</p>}
      <label className={styles.mgrSearch}><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search managers or team names" /></label>
      {!loaded ? (
        <div className={styles.emptyState}><RefreshCw size={20} className={styles.spinning} /><strong>Loading managers…</strong></div>
      ) : (
        <div className={styles.mgrGrid}>
          {shown.map((card) => (
            <article className={styles.mgrCard} key={card.ownerId}>
              <button type="button" className={styles.mgrTop} onClick={() => onOpenManager(card.ownerId)}>
                <ManagerAvatar card={card} />
                <div className={styles.mgrIdentity}>
                  <strong>{card.name}</strong>
                  <small>{card.leagues.length} shared league{card.leagues.length === 1 ? "" : "s"} · {card.leagues.map((l) => l.leagueType).filter((v, i, a) => a.indexOf(v) === i).join(", ")}</small>
                </div>
                {card.leagues.some((l) => l.facingMeThisWeek) && <span className={styles.youTag}>Plays you</span>}
                <ChevronRight size={16} />
              </button>
              <div className={styles.mgrTags}>
                {card.tags.slice(0, 4).map((tag) => <span key={tag.label} className={styles[`tag_${tag.tone}`]} title={tag.detail}>{tag.label}</span>)}
                {card.tags.length === 0 && !txLoading && <span className={styles.tag_info}>Not much history yet</span>}
              </div>
            </article>
          ))}
          {shown.length === 0 && <p className={styles.mgrMuted}>No managers match that search.</p>}
        </div>
      )}
    </section>
  );
}
