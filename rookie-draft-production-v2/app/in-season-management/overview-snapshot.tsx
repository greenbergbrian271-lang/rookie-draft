"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import {
  buildStandings,
  effectiveWindow,
  findMine,
  guillotineStatus,
  isGuillotine,
  sortLeagues,
  teamLabel,
  type Intents,
  type LeagueData,
} from "@/lib/in-season";
import { ManagerLink } from "./league-nav";
import styles from "./in-season-management.module.css";

const f1 = (value: number | null | undefined) => (value == null ? "—" : value.toFixed(1));
const f2 = (value: number | null | undefined) => (value == null ? "—" : value.toFixed(2));

function GuillotineCard({ league, rosterId }: { league: LeagueData; rosterId: string }) {
  const g = guillotineStatus(league, rosterId);
  const mine = league.matchups?.find((m) => m.rosterId === rosterId);
  if (!g) return <div className={styles.matchupEmpty}><strong>No active matchup</strong><span>Sleeper has no guillotine scores for you this week.</span></div>;
  const live = g.basis === "points";
  const safe = g.marginToLow != null && g.marginToLow > 0;
  // 100% = top of the week, 0% = the cut line.
  const position = g.of > 1 ? ((g.of - g.rank) / (g.of - 1)) * 100 : 100;
  return (
    <>
      <div className={styles.snapGuillotine}>
        <div className={styles.snapRank}><strong>{g.rank}</strong><span>of {g.of} alive</span><small>{live ? "live points" : "by projection"}</small></div>
        <div className={styles.snapStats}>
          <div><span>Score</span><strong>{f2(mine?.points)}</strong><small>proj {f1(mine?.projected)}</small></div>
          <div><span>Cut line</span><strong>{f1(g.low?.value)}</strong><small>{g.low?.label}</small></div>
          <div className={safe ? styles.leadUp : styles.leadDown}><span>Margin</span><strong>{g.marginToLow === 0 ? "Lowest" : `${safe ? "+" : ""}${f1(g.marginToLow)}`}</strong><small>{safe ? "points to spare" : "you'd be cut"}</small></div>
        </div>
      </div>
      <div className={styles.survivalBar} aria-label="Position between the cut line and the top"><span style={{ width: `${Math.max(4, position)}%` }} /></div>
    </>
  );
}

function HeadToHeadCard({ league, rosterId, intents, onOpenManager }: { league: LeagueData; rosterId: string; intents: Intents; onOpenManager?: (id: string) => void }) {
  const mine = league.matchups?.find((m) => m.rosterId === rosterId);
  const oppMatch = mine && league.matchups?.find((m) => m.matchupId === mine.matchupId && m.rosterId !== rosterId);
  const team = (league.teams || []).find((t) => t.rosterId === rosterId);
  const opponent = (league.teams || []).find((t) => t.rosterId === oppMatch?.rosterId);
  const rows = buildStandings(league, rosterId, intents);
  const standing = rows.find((r) => r.isMine);
  const window = effectiveWindow(league, team, intents);
  if (!mine || !oppMatch) return <div className={styles.matchupEmpty}><strong>No matchup this week</strong><span>Sleeper has no opponent listed for you.</span></div>;
  const started = mine.points > 0 || oppMatch.points > 0;
  const lead = mine.points - oppMatch.points;
  const spread = mine.projected != null && oppMatch.projected != null ? mine.projected - oppMatch.projected : null;
  return (
    <>
      <div className={styles.snapSides}>
        <div><span>You</span><strong>{f2(mine.points)}</strong><small>proj {f1(mine.projected)}</small></div>
        <div className={styles.snapMid}>
          <b className={started ? (lead > 0 ? styles.leadUp : lead < 0 ? styles.leadDown : "") : ""}>{started ? (lead > 0 ? `Up ${lead.toFixed(1)}` : lead < 0 ? `Down ${Math.abs(lead).toFixed(1)}` : "Tied") : "Not started"}</b>
          {spread != null && <small>{spread >= 0 ? `proj +${spread.toFixed(1)}` : `proj ${spread.toFixed(1)}`}</small>}
        </div>
        <div className={styles.snapRight}><span>{opponent ? <ManagerLink ownerId={opponent.ownerId} onOpen={onOpenManager}>{teamLabel(opponent)}</ManagerLink> : "Opponent"}</span><strong>{f2(oppMatch.points)}</strong><small>proj {f1(oppMatch.projected)}</small></div>
      </div>
      <div className={styles.matchupFoot}>
        <span>{team ? `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ""}` : ""}{standing ? ` · #${standing.rank} of ${rows.length}` : ""}</span>
        {window && <span>{window.classification}{window.declared ? " (declared)" : ""}</span>}
      </div>
    </>
  );
}

export default function OverviewSnapshot({ leagues, intents, onOpenManager }: { leagues: LeagueData[]; intents: Intents; onOpenManager?: (id: string) => void }) {
  const ordered = sortLeagues(leagues);
  return (
    <section className={styles.overviewMatchups} aria-label="This week in your leagues">
      <div className={styles.sectionHeading}>
        <div><div className={styles.sectionKicker}>Weekly snapshot</div><h2>This week in your leagues</h2><p>Live score and projection for every head-to-head matchup, and your weekly rank, cut line and margin in each guillotine league. Tap a card for the full lineup.</p></div>
      </div>
      {leagues.length === 0 ? (
        <div className={styles.emptyState}><RefreshCw size={20} className={styles.spinning} /><strong>Loading weekly matchups…</strong><span>Fetching your scores and projections from Sleeper.</span></div>
      ) : (
        <div className={styles.matchupGrid}>
          {ordered.map((league) => {
            const mine = findMine(league);
            const guillotine = isGuillotine(league);
            const eliminated = league.eliminated || Boolean(mine?.eliminated);
            return (
              <article className={styles.matchupCard} key={league.id}>
                <Link className={styles.snapLink} href={`/in-season-management/lineups#lg-${league.id}`} aria-label={`Open ${league.name} lineup`} />
                <div className={styles.matchupCardHead}>
                  <div><span className={styles.sectionKicker}>{league.type} · Week {league.week || "—"}</span><h3>{league.name}</h3></div>
                  <span className={`${styles.matchupState} ${eliminated ? styles.eliminatedState : ""}`}>{eliminated ? "Eliminated" : league.ok ? "Live" : "Unavailable"}</span>
                </div>
                {!league.ok ? <p className={styles.leagueWarning}>{league.error || "Sleeper could not return this league's scores."}</p>
                  : !mine ? <div className={styles.matchupEmpty}><strong>Your team wasn&rsquo;t matched in this league.</strong><span>Confirm your Sleeper team identity in Integrations.</span></div>
                  : eliminated ? <div className={styles.matchupEmpty}><strong>You&rsquo;ve been eliminated</strong><span>No active lineup in this league.</span></div>
                  : guillotine ? <GuillotineCard league={league} rosterId={mine.rosterId} />
                  : <HeadToHeadCard league={league} rosterId={mine.rosterId} intents={intents} onOpenManager={onOpenManager} />}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
