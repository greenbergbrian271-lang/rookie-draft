"use client";

import { RefreshCw } from "lucide-react";
import {
  buildRootingGuide,
  buildStandings,
  findMine,
  guillotineBoard,
  isDynasty,
  matchupProjected,
  buildPlayoffPicture,
  isGuillotine,
  matchupPairs,
  playoffFormat,
  sortLeagues,
  teamLabel,
  type Intent,
  type Intents,
  type LeagueData,
  type StandingRow,
} from "@/lib/in-season";
import { LeagueHeader, LeagueNav, ManagerLink } from "./league-nav";
import { useCollapsible } from "./use-collapsible";
import PlayoffPicture from "./playoff-picture";
import pcss from "./playoff-picture.module.css";
import styles from "./in-season-management.module.css";

const pts = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function WindowTag({ value }: { value?: string }) {
  if (!value) return <span className={styles.dash}>—</span>;
  const key = value === "Contender" ? styles.windowContender : value === "Rebuilder" ? styles.windowRebuilder : styles.windowMiddle;
  return <span className={`${styles.windowTag} ${key}`}>{value === "Stuck in the Middle" ? "Middle" : value}</span>;
}

function StandingsTable({ league, rows, weekRank, onOpenManager }: { league: LeagueData; rows: StandingRow[]; weekRank: Map<string, number>; onOpenManager?: (id: string) => void }) {
  const guillotine = isGuillotine(league);
  const dynasty = isDynasty(league);
  const format = playoffFormat(league);
  const custom = format.custom;
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
              {custom && <th>Playoffs</th>}
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
              <tr key={row.team.rosterId} className={`${row.isMine ? styles.mineRow : ""} ${row.eliminated ? styles.outRow : ""} ${custom && row.rank === format.topTier ? pcss.divTier : ""} ${custom && row.rank === format.teams ? pcss.divCut : ""}`}>
                <td>{row.rank}</td>
                <td><strong>{row.isMine ? teamLabel(row.team) : <ManagerLink ownerId={row.team.ownerId} onOpen={onOpenManager}>{teamLabel(row.team)}</ManagerLink>}</strong>{row.isMine && <span className={styles.youTag}>You</span>}</td>
                {guillotine && <td className={styles.center}>{row.eliminated ? "—" : weekRank.get(row.team.rosterId) ?? "—"}</td>}
                {custom && <td><span className={`${pcss.tag} ${row.rank <= format.topTier ? pcss.tagUpper : row.rank <= format.teams ? pcss.tagLower : pcss.tagOut}`}>{row.rank <= format.topTier ? "Upper" : row.rank <= format.teams ? "Lower" : "Out"}</span></td>}
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
      {custom && <p className={pcss.legend}>Green line: the top {format.topTier} seeds get the double-elimination bracket. Red dashed line: the playoff cut at {format.teams}.</p>}
    </section>
  );
}

function LeagueBlock({ league, intents, onIntent, onOpenManager, folded, onToggle }: { league: LeagueData; intents: Intents; onIntent: (leagueId: string, intent: Intent | null) => void; onOpenManager?: (id: string) => void; folded: boolean; onToggle: () => void }) {
  const guillotine = isGuillotine(league);
  const mine = findMine(league);
  const standings = buildStandings(league, mine?.rosterId, intents);
  const guide = buildRootingGuide(league, intents);
  const picture = buildPlayoffPicture(standings, playoffFormat(league));
  const computed = mine ? league.windows?.[mine.rosterId]?.classification : undefined;
  const declared = intents[league.id];
  const teams = league.teams || [];
  const byRoster = new Map(teams.map((team) => [team.rosterId, team]));
  const scoreOf = (rosterId: string) => league.matchups?.find((m) => m.rosterId === rosterId)?.points;
  const pairs = matchupPairs(league);
  const board = guillotine ? guillotineBoard(league) : [];
  const weekRank = new Map<string, number>(board.map((row) => [row.rosterId, row.rank]));
  const projOf = (rosterId: string) => matchupProjected(league, league.matchups?.find((m) => m.rosterId === rosterId)) ?? 0;
  const low = board[board.length - 1];
  return (
    <article className={styles.leagueCard} id={`lg-${league.id}`}>
      <LeagueHeader type={league.type} name={league.name} meta={`Week ${league.week || "—"}`} collapsed={folded} onToggle={onToggle}
        summary={mine ? `${isGuillotine(league) ? "" : `${mine.wins}-${mine.losses} · `}#${standings.find((r) => r.isMine)?.rank ?? "—"} of ${standings.length}${guide.headline ? ` · ${guide.headline}` : ""}` : undefined} />
      {!folded && <>

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
        {guillotine && low && <p>Lowest projection this week: {teamLabel(low.team)} at {low.projected.toFixed(1)}. That team is on the chopping block.</p>}
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

      {picture && <PlayoffPicture picture={picture} onOpenManager={onOpenManager} />}

      <StandingsTable league={league} rows={standings} weekRank={weekRank} onOpenManager={onOpenManager} />

      <h4 className={styles.subsectionTitle}>This week&rsquo;s {guillotine ? "projections" : "matchups"}</h4>
      {guillotine ? (
        <div className={styles.zoneBoard}>
          {(["chop", "danger", "safe"] as const).map((zone) => {
            const rows = [...board].filter((row) => row.zone === zone).reverse();
            if (!rows.length) return null;
            return (
              <div key={zone} className={`${styles.zoneGroup} ${styles[`zone_${zone}`]}`}>
                <div className={styles.zoneHead}><b>{zone === "chop" ? "Chop zone" : zone === "danger" ? "Danger zone" : "Safe"}</b><span>{zone === "chop" ? "Lowest projection" : zone === "danger" ? "Next 3 lowest" : "Everyone above"}</span></div>
                {rows.map((row) => (
                  <div className={`${styles.zoneRow} ${row.isMine ? styles.mineRow : ""}`} key={row.rosterId}>
                    <span className={styles.zoneRank}>{row.rank}</span>
                    <strong>{row.isMine ? teamLabel(row.team) : <ManagerLink ownerId={row.team.ownerId} onOpen={onOpenManager}>{teamLabel(row.team)}</ManagerLink>}{row.isMine && <span className={styles.youTag}>You</span>}</strong>
                    <span className={styles.zonePts}><b>{row.points > 0 ? pts(row.points) : "—"}</b><small>proj {row.projected.toFixed(1)}</small></span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.matchupList}>
          {pairs.map(([a, b]) => {
            const ta = byRoster.get(a), tb = byRoster.get(b);
            const mineGame = ta?.isMine || tb?.isMine;
            return (
              <div className={`${styles.matchupRow} ${mineGame ? styles.mineRow : ""}`} key={`${a}-${b}`}>
                <div><strong>{ta?.isMine ? teamLabel(ta) : <ManagerLink ownerId={ta?.ownerId} onOpen={onOpenManager}>{teamLabel(ta)}</ManagerLink>}</strong><span>{ta ? `${ta.wins}-${ta.losses}` : ""}</span></div>
                <b>{pts(scoreOf(a) || 0)}<small>proj {projOf(a).toFixed(1)}</small></b><span className={styles.matchupVersus}>vs</span><b>{pts(scoreOf(b) || 0)}<small>proj {projOf(b).toFixed(1)}</small></b>
                <div><strong>{tb?.isMine ? teamLabel(tb) : <ManagerLink ownerId={tb?.ownerId} onOpen={onOpenManager}>{teamLabel(tb)}</ManagerLink>}</strong><span>{tb ? `${tb.wins}-${tb.losses}` : ""}</span></div>
              </div>
            );
          })}
        </div>
      )}
      </>}
    </article>
  );
}

export default function LeagueOverviewView({ leagues, intents, onIntent, saveError, onOpenManager }: { leagues: LeagueData[]; intents: Intents; onIntent: (leagueId: string, intent: Intent | null) => void; saveError?: string; onOpenManager?: (id: string) => void }) {
  const ordered = sortLeagues(leagues).filter((league) => league.ok && !league.eliminated);
  const { collapsed, toggle, jump, collapseAll, expandAll } = useCollapsible(ordered.map((league) => league.id), "ism-league-overview-collapsed");
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
      <LeagueNav leagues={ordered} onJump={jump} onCollapseAll={collapseAll} onExpandAll={expandAll} />
      {leagues.length === 0 ? (
        <div className={styles.emptyState}><RefreshCw size={20} className={styles.spinning} /><strong>Loading league standings…</strong><span>Fetching standings from Sleeper.</span></div>
      ) : ordered.map((league) => <LeagueBlock key={league.id} league={league} intents={intents} onIntent={onIntent} onOpenManager={onOpenManager} folded={Boolean(collapsed[league.id])} onToggle={() => toggle(league.id)} />)}
    </section>
  );
}
