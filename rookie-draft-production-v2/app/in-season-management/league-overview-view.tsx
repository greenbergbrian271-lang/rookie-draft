"use client";

import { RefreshCw } from "lucide-react";
import {
  buildRootingGuide,
  buildStandings,
  findMine,
  isDynasty,
  isGuillotine,
  matchupPairs,
  sortLeagues,
  teamLabel,
  type Intent,
  type Intents,
  type LeagueData,
  type StandingRow,
} from "@/lib/in-season";
import styles from "./in-season-management.module.css";

const pts = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function WindowTag({ value }: { value?: string }) {
  if (!value) return <span className={styles.dash}>—</span>;
  const key = value === "Contender" ? styles.windowContender : value === "Rebuilder" ? styles.windowRebuilder : styles.windowMiddle;
  return <span className={`${styles.windowTag} ${key}`}>{value === "Stuck in the Middle" ? "Middle" : value}</span>;
}

function StandingsTable({ league, rows, weekRank }: { league: LeagueData; rows: StandingRow[]; weekRank: Map<string, number> }) {
  const guillotine = isGuillotine(league);
  const dynasty = isDynasty(league);
  const showPa = rows.some((row) => row.pa > 0);
  const showMax = rows.some((row) => row.max > 0);
  return (
    <section className={styles.lineupPanel}>
      <div className={styles.lineupPanelTitle}>
        <b>Standings</b>
        <span>PF = points for · Avg/Wk = PF per scored week · PA = points against · Max PF = best possible lineup</span>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.standingsTable}>
          <thead>
            <tr>
              <th>#</th><th>Team</th>
              {guillotine && <th className={styles.center}>Wk rank</th>}
              {dynasty && <th>Window</th>}
              {guillotine ? <th>Status</th> : <th className={styles.center}>Record</th>}
              <th className={styles.num}>PF</th>
              <th className={styles.num}>Avg/Wk</th>
              {showPa && <th className={styles.num}>PA</th>}
              {showMax && <th className={styles.num}>Max PF</th>}
              {showMax && <th className={styles.num}>Eff.</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.team.rosterId} className={`${row.isMine ? styles.mineRow : ""} ${row.eliminated ? styles.outRow : ""}`}>
                <td>{row.rank}</td>
                <td><strong>{teamLabel(row.team)}</strong>{row.isMine && <span className={styles.youTag}>You</span>}</td>
                {guillotine && <td className={styles.center}>{row.eliminated ? "—" : weekRank.get(row.team.rosterId) ?? "—"}</td>}
                {dynasty && <td><WindowTag value={row.window?.classification} /></td>}
                {guillotine ? <td>{row.eliminated ? "Eliminated" : "Alive"}</td> : <td className={styles.center}>{row.wins}-{row.losses}{row.ties ? `-${row.ties}` : ""}</td>}
                <td className={styles.num}>{pts(row.pf)}</td>
                <td className={styles.num}>{row.avg != null ? pts(row.avg) : "—"}</td>
                {showPa && <td className={styles.num}>{pts(row.pa)}</td>}
                {showMax && <td className={styles.num}>{row.max ? pts(row.max) : "—"}</td>}
                {showMax && <td className={styles.num}>{row.efficiency != null ? `${(row.efficiency * 100).toFixed(1)}%` : "—"}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function LeagueBlock({ league, intents, onIntent }: { league: LeagueData; intents: Intents; onIntent: (leagueId: string, intent: Intent | null) => void }) {
  const guillotine = isGuillotine(league);
  const mine = findMine(league);
  const standings = buildStandings(league, mine?.rosterId, intents);
  const guide = buildRootingGuide(league, intents);
  const computed = mine ? league.windows?.[mine.rosterId]?.classification : undefined;
  const declared = intents[league.id];
  const teams = league.teams || [];
  const byRoster = new Map(teams.map((team) => [team.rosterId, team]));
  const scoreOf = (rosterId: string) => league.matchups?.find((m) => m.rosterId === rosterId)?.points;
  const pairs = matchupPairs(league);
  const active = standings.filter((row) => !row.eliminated && scoreOf(row.team.rosterId) !== undefined)
    .sort((a, b) => (scoreOf(b.team.rosterId) || 0) - (scoreOf(a.team.rosterId) || 0));
  const low = active[active.length - 1];
  const weekRank = new Map<string, number>();
  const anyScored = active.some((row) => (scoreOf(row.team.rosterId) || 0) > 0);
  const projOf = (rosterId: string) => league.matchups?.find((m) => m.rosterId === rosterId)?.projected ?? 0;
  [...active].sort((a, b) => (anyScored ? (scoreOf(b.team.rosterId) || 0) - (scoreOf(a.team.rosterId) || 0) : projOf(b.team.rosterId) - projOf(a.team.rosterId)))
    .forEach((row, index) => weekRank.set(row.team.rosterId, index + 1));
  return (
    <article className={styles.leagueCard}>
      <div className={styles.leagueTop}>
        <span className={styles.typeBadge}>{league.type}</span>
        <span className={styles.leagueSeason}>Week {league.week || "—"}</span>
      </div>
      <h3>{league.name}</h3>

      {isDynasty(league) && mine && (
        <div className={styles.intentBox}>
          <div>
            <strong>Your direction for this league</strong>
            <small>League Intelligence reads you as <b>{computed || "unknown"}</b>.{declared ? ` You declared ${declared}, which overrides it.` : " Declare a direction to override it."}</small>
          </div>
          <div className={styles.intentButtons} role="group" aria-label="Declare intent">
            <button type="button" className={declared === "Contend" ? styles.intentOn : ""} onClick={() => onIntent(league.id, declared === "Contend" ? null : "Contend")}>Go for it (Contend)</button>
            <button type="button" className={declared === "Rebuild" ? styles.intentOn : ""} onClick={() => onIntent(league.id, declared === "Rebuild" ? null : "Rebuild")}>Focus on next year (Rebuild)</button>
          </div>
        </div>
      )}

      <div className={styles.guideBox} data-mode={guide.mode}>
        <strong>{guide.headline}</strong>
        <p>{guide.detail}</p>
        {guillotine && low && <p>Lowest active score right now: {teamLabel(low.team)} at {pts(scoreOf(low.team.rosterId) || 0)}.</p>}
        {guide.note && <small>{guide.note}</small>}
      </div>

      {guide.items.length > 0 && (
        <ul className={styles.rootingList}>
          {guide.items.map((item) => (
            <li key={item.key} className={`${item.mine ? styles.rootingMine : ""} ${item.impact === "low" ? styles.rootingLow : ""}`}>
              <span className={styles.rootingArrow}>{item.mine ? "★" : item.impact === "high" ? "▲" : "–"}</span>
              <div>
                <strong>Root for {item.rootFor}</strong>
                <small>vs {item.rootAgainst} ({item.forRecord} vs {item.againstRecord}). {item.reason}</small>
              </div>
            </li>
          ))}
        </ul>
      )}

      <StandingsTable league={league} rows={standings} weekRank={weekRank} />

      <h4 className={styles.subsectionTitle}>This week&rsquo;s {guillotine ? "scores" : "matchups"}</h4>
      {guillotine ? (
        <div className={styles.scoreTable}>
          {active.map((row, index) => (
            <div className={`${styles.scoreTableRow} ${row.isMine ? styles.mineRow : ""}`} key={row.team.rosterId}>
              <span>{index + 1}</span><strong>{teamLabel(row.team)}</strong><span>{pts(scoreOf(row.team.rosterId) || 0)} pts <small>proj {projOf(row.team.rosterId).toFixed(1)}</small></span>
              {index === active.length - 1 && <b className={styles.injuryFlag}>Current low</b>}
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.matchupList}>
          {pairs.map(([a, b]) => {
            const ta = byRoster.get(a), tb = byRoster.get(b);
            const mineGame = ta?.isMine || tb?.isMine;
            return (
              <div className={`${styles.matchupRow} ${mineGame ? styles.mineRow : ""}`} key={`${a}-${b}`}>
                <div><strong>{teamLabel(ta)}</strong><span>{ta ? `${ta.wins}-${ta.losses}` : ""}</span></div>
                <b>{pts(scoreOf(a) || 0)}<small>proj {projOf(a).toFixed(1)}</small></b><span className={styles.matchupVersus}>vs</span><b>{pts(scoreOf(b) || 0)}<small>proj {projOf(b).toFixed(1)}</small></b>
                <div><strong>{teamLabel(tb)}</strong><span>{tb ? `${tb.wins}-${tb.losses}` : ""}</span></div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

export default function LeagueOverviewView({ leagues, intents, onIntent, saveError }: { leagues: LeagueData[]; intents: Intents; onIntent: (leagueId: string, intent: Intent | null) => void; saveError?: string }) {
  const ordered = sortLeagues(leagues).filter((league) => league.ok && !league.eliminated);
  return (
    <section className={styles.modulePage}>
      <div className={styles.moduleHero}>
        <div>
          <div className={styles.sectionKicker}>League-wide</div>
          <h2>League Overview &amp; Rooting Guide</h2>
          <p>Standings with points for, points against and max points, plus who to root for this week. Dynasty guides follow your team window from League Intelligence. Guidance reflects current records, not a clinch guarantee.</p>
        </div>
      </div>
      {saveError && <p className={styles.leagueWarning}>{saveError}</p>}
      {leagues.length === 0 ? (
        <div className={styles.emptyState}><RefreshCw size={20} className={styles.spinning} /><strong>Loading league standings…</strong><span>Fetching standings from Sleeper.</span></div>
      ) : ordered.map((league) => <LeagueBlock key={league.id} league={league} intents={intents} onIntent={onIntent} />)}
    </section>
  );
}
