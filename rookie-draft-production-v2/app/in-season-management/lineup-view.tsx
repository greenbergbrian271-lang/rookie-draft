"use client";

import { RefreshCw } from "lucide-react";
import NflPlayerName from "@/components/NflPlayerName";
import {
  buildLineup,
  effectiveWindow,
  findMine,
  guillotineStatus,
  projectionFor,
  seasonAverage,
  isDynasty,
  isGuillotine,
  playerFlag,
  sortLeagues,
  teamLabel,
  type Intents,
  type LeagueData,
  type PlayerDetail,
  type TeamData,
} from "@/lib/in-season";
import styles from "./in-season-management.module.css";

const fmt = (value: number | null | undefined, digits = 1) => (value == null ? "—" : value.toFixed(digits));
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const gameLabel = (game: { opp: string | null; date: string | null } | null) => {
  if (!game?.opp) return "";
  const day = game.date ? DAYS[new Date(`${game.date}T12:00:00Z`).getUTCDay()] : "";
  return `${day ? day + " " : ""}vs ${game.opp}`.trim();
};

const posClass = (position: string) => {
  const key = position.toLowerCase();
  return ["qb", "rb", "wr", "te"].includes(key) ? styles[key] : key.includes("flex") || key === "w/r" || key === "w/t" || key === "sflx" ? styles.flexPos : styles.otherPos;
};

function SlotBadge({ label, position }: { label: string; position?: string }) {
  return <span className={`${styles.posBadge} ${posClass(position || label)}`}>{label}</span>;
}

function StatusChip({ player }: { player: PlayerDetail }) {
  const flag = playerFlag(player);
  if (!flag) return null;
  return <span className={`${styles.statusChip} ${styles[`flag_${flag.severity}`]}`}>{flag.label}</span>;
}

function PlayerLine({ player }: { player: PlayerDetail }) {
  return (
    <div className={styles.playerCell}>
      <NflPlayerName name={player.name} position={player.position} team={player.team} sleeperId={player.id} />
      <small>{player.position} · {player.team || "FA"}</small>
      <StatusChip player={player} />
    </div>
  );
}

function BenchTable({ title, players, league }: { title: string; players: PlayerDetail[]; league: LeagueData }) {
  if (!players.length) return null;
  return (
    <section className={styles.lineupPanel}>
      <div className={styles.lineupPanelTitle}><b>{title}</b><span className={styles.colHead}><i>Proj</i><i>Avg</i></span></div>
      {players.map((player) => (
        <div className={styles.lineupRow} key={player.id}>
          <SlotBadge label={player.position} position={player.position} />
          <PlayerLine player={player} />
          <span className={styles.pointsCell}><i>{fmt(projectionFor(league, player.id)?.pts)}</i><i>{fmt(seasonAverage(league, player.id))}</i></span>
        </div>
      ))}
    </section>
  );
}

function Scoreboard({ league, team, intents }: { league: LeagueData; team: TeamData; intents: Intents }) {
  const matchup = league.matchups?.find((m) => m.rosterId === team.rosterId);
  const opponentMatch = matchup && league.matchups?.find((m) => m.matchupId === matchup.matchupId && m.rosterId !== team.rosterId);
  const opponent = (league.teams || []).find((t) => t.rosterId === opponentMatch?.rosterId);
  const window = effectiveWindow(league, team, intents);
  const record = `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ""}`;

  if (isGuillotine(league)) {
    const g = guillotineStatus(league, team.rosterId);
    const live = g?.basis === "points";
    return (
      <div className={styles.scoreboard}>
        <div className={styles.sbGuillotine}>
          <div><span>Weekly rank</span><strong>{g ? `${g.rank} of ${g.of}` : "—"}</strong><small>{g ? (live ? "by live points" : "by projection (games not started)") : "No active matchup"}</small></div>
          <div><span>Your score</span><strong>{fmt(matchup?.points, 2)}</strong><small>Proj {fmt(matchup?.projected)}</small></div>
          <div><span>Cut line</span><strong>{g?.low ? fmt(g.low.value, live ? 2 : 1) : "—"}</strong><small>{g?.low ? g.low.label : ""}</small></div>
          <div className={g && g.marginToLow != null && g.marginToLow > 0 ? styles.leadUp : g && g.marginToLow === 0 ? styles.leadDown : ""}><span>Margin to cut</span><strong>{g?.marginToLow == null ? "—" : g.marginToLow === 0 ? "You're lowest" : `${g.marginToLow > 0 ? "+" : ""}${g.marginToLow.toFixed(1)}`}</strong><small>Points to spare</small></div>
        </div>
      </div>
    );
  }

  const mine = matchup?.points ?? 0, theirs = opponentMatch?.points ?? 0;
  const myProj = matchup?.projected ?? null, theirProj = opponentMatch?.projected ?? null;
  const started = mine > 0 || theirs > 0;
  const spread = myProj != null && theirProj != null ? myProj - theirProj : null;
  const share = myProj != null && theirProj != null && myProj + theirProj > 0 ? (myProj / (myProj + theirProj)) * 100 : 50;
  const lead = mine - theirs;
  return (
    <div className={styles.scoreboard}>
      <div className={styles.sbSides}>
        <div className={styles.sbSide}>
          <span>{teamLabel(team)}</span>
          <strong>{matchup ? mine.toFixed(2) : "—"}</strong>
          <small>Proj {fmt(myProj)}</small>
        </div>
        <div className={styles.sbMiddle}>
          <b className={started ? (lead > 0 ? styles.leadUp : lead < 0 ? styles.leadDown : "") : ""}>{!matchup ? "No matchup" : started ? (lead > 0 ? `Up ${lead.toFixed(2)}` : lead < 0 ? `Down ${Math.abs(lead).toFixed(2)}` : "Tied") : "Not started"}</b>
          {spread != null && <small>{spread >= 0 ? `Projected +${spread.toFixed(1)}` : `Projected ${spread.toFixed(1)}`}</small>}
        </div>
        <div className={`${styles.sbSide} ${styles.sbRight}`}>
          <span>{opponent ? teamLabel(opponent) : "Opponent"}</span>
          <strong>{opponentMatch ? theirs.toFixed(2) : "—"}</strong>
          <small>Proj {fmt(theirProj)}</small>
        </div>
      </div>
      <div className={styles.sbBar} aria-hidden="true"><i style={{ width: `${share}%` }} /></div>
      <div className={styles.sbMeta}>
        <span>Record <b>{record}</b></span>
        {window && <span>Window <b>{window.classification}{window.declared ? " (declared)" : ""}</b></span>}
      </div>
    </div>
  );
}

function TeamLineup({ league, team, intents }: { league: LeagueData; team: TeamData; intents: Intents }) {
  const matchup = league.matchups?.find((m) => m.rosterId === team.rosterId);
  const lineup = buildLineup(league, team, matchup);
  const total = lineup.starters.reduce((sum, row) => sum + (row.points ?? 0), 0);
  const started = total > 0;
  return (
    <>
      <Scoreboard league={league} team={team} intents={intents} />
      <div className={styles.lineupLayout}>
        <section className={styles.lineupPanel}>
          <div className={styles.lineupPanelTitle}><b>Starting lineup</b><span className={styles.colHead}><i>Proj</i><i>Pts</i></span></div>
          {lineup.starters.map((row, index) => (
            <div className={styles.lineupRow} key={`${row.slot}-${index}`}>
              <SlotBadge label={row.label} />
              {row.player ? (
                <div className={styles.playerCell}>
                  <NflPlayerName name={row.player.name} position={row.player.position} team={row.player.team} sleeperId={row.player.id} />
                  <small>{row.player.position} · {row.player.team || "FA"}{gameLabel(row.game) ? ` · ${gameLabel(row.game)}` : ""}</small>
                  <StatusChip player={row.player} />
                </div>
              ) : <div className={styles.playerCell}><em className={styles.emptySlot}>{row.id ? `Player ${row.id}` : "Empty slot"}</em></div>}
              <span className={styles.pointsCell}><i>{fmt(row.proj)}</i><i>{row.points != null && (started || row.points > 0) ? row.points.toFixed(2) : "—"}</i></span>
            </div>
          ))}
          <div className={`${styles.lineupRow} ${styles.totalRow}`}><span /><strong>Total</strong><span className={styles.pointsCell}><i>{fmt(lineup.projectedTotal)}</i><i>{started ? total.toFixed(2) : "—"}</i></span></div>
        </section>
        <div className={styles.lineupSide}>
          <BenchTable title="Bench" players={lineup.bench} league={league} />
          <BenchTable title="Injured reserve" players={lineup.reserve} league={league} />
          <BenchTable title="Taxi squad" players={lineup.taxi} league={league} />
        </div>
      </div>
    </>
  );
}

export default function LineupView({ leagues, intents }: { leagues: LeagueData[]; intents: Intents }) {
  const ordered = sortLeagues(leagues);
  return (
    <section className={styles.modulePage}>
      <div className={styles.moduleHero}>
        <div>
          <div className={styles.sectionKicker}>Lineups &amp; matchups</div>
          <h2>Your lineups</h2>
          <p>Starters by slot, your bench, and this week&rsquo;s matchup for every active team, grouped Dynasty, Redraft, then Guillotine. Click any name for the player card.</p>
        </div>
      </div>
      {ordered.length === 0 ? (
        <div className={styles.emptyState}><RefreshCw size={20} className={styles.spinning} /><strong>Loading your lineups…</strong><span>Fetching rosters from Sleeper.</span></div>
      ) : ordered.map((league) => {
        const mine = findMine(league);
        return (
          <article className={styles.leagueCard} key={league.id}>
            <div className={styles.leagueTop}>
              <span className={styles.typeBadge}>{league.type}</span>
              <span className={styles.leagueSeason}>{league.eliminated ? "Eliminated" : league.ok ? `Week ${league.week || "—"}` : "Unavailable"}</span>
            </div>
            <h3>{league.name}</h3>
            {!league.ok ? <p className={styles.leagueWarning}>{league.error || "Sleeper could not return this league."}</p>
              : league.eliminated || mine?.eliminated ? <p className={styles.leagueWarning}>Your team has been eliminated from this {isGuillotine(league) ? "guillotine " : ""}league, so there is no active lineup.</p>
              : !mine ? <p className={styles.leagueWarning}>Your team wasn&rsquo;t matched in this league. Check your team identity in Integrations.</p>
              : <TeamLineup league={league} team={mine} intents={intents} />}
            {league.ok && isDynasty(league) && league.windowError && <p className={styles.leagueNote}>Team window unavailable right now.</p>}
          </article>
        );
      })}
    </section>
  );
}
