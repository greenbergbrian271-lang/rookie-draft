"use client";

import { RefreshCw } from "lucide-react";
import NflPlayerName from "@/components/NflPlayerName";
import {
  buildLineup,
  findMine,
  isDynasty,
  isGuillotine,
  playerFlag,
  sortLeagues,
  teamLabel,
  type LeagueData,
  type PlayerDetail,
  type TeamData,
} from "@/lib/in-season";
import styles from "./in-season-management.module.css";

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

function BenchTable({ title, players }: { title: string; players: PlayerDetail[] }) {
  if (!players.length) return null;
  return (
    <section className={styles.lineupPanel}>
      <div className={styles.lineupPanelTitle}><b>{title}</b><span>{players.length}</span></div>
      {players.map((player) => (
        <div className={styles.lineupRow} key={player.id}>
          <SlotBadge label={player.position} position={player.position} />
          <PlayerLine player={player} />
          <span className={styles.pointsCell} />
        </div>
      ))}
    </section>
  );
}

function TeamLineup({ league, team }: { league: LeagueData; team: TeamData }) {
  const matchup = league.matchups?.find((m) => m.rosterId === team.rosterId);
  const opponentMatch = matchup && league.matchups?.find((m) => m.matchupId === matchup.matchupId && m.rosterId !== team.rosterId);
  const opponent = (league.teams || []).find((t) => t.rosterId === opponentMatch?.rosterId);
  const lineup = buildLineup(league, team, matchup);
  const mine = matchup?.points ?? 0;
  const theirs = opponentMatch?.points ?? 0;
  const started = mine > 0 || theirs > 0;
  const lead = mine - theirs;
  const window = league.windows?.[team.rosterId];
  const total = lineup.starters.reduce((sum, row) => sum + (row.points ?? 0), 0);
  return (
    <>
      <div className={styles.scoreStrip}>
        <div><span>Record</span><strong>{team.wins}-{team.losses}{team.ties ? `-${team.ties}` : ""}</strong></div>
        <div><span>{teamLabel(team)}</span><strong>{matchup ? mine.toFixed(2) : "—"}</strong></div>
        <div className={styles.stripVs}>vs</div>
        <div><span>{opponent ? teamLabel(opponent) : "Opponent"}</span><strong>{opponentMatch ? theirs.toFixed(2) : "—"}</strong></div>
        <div className={started ? (lead > 0 ? styles.leadUp : lead < 0 ? styles.leadDown : "") : ""}>
          <span>Status</span>
          <strong>{!matchup ? "No matchup" : !started ? "Not started" : lead > 0 ? `Up ${lead.toFixed(2)}` : lead < 0 ? `Down ${Math.abs(lead).toFixed(2)}` : "Tied"}</strong>
        </div>
        {window && <div><span>Window</span><strong>{window.classification}</strong></div>}
      </div>
      <div className={styles.lineupLayout}>
        <section className={styles.lineupPanel}>
          <div className={styles.lineupPanelTitle}><b>Starting lineup</b><span>{started ? `${total.toFixed(2)} pts` : `${lineup.starters.length} slots`}</span></div>
          {lineup.starters.map((row, index) => (
            <div className={styles.lineupRow} key={`${row.slot}-${index}`}>
              <SlotBadge label={row.label} />
              {row.player ? <PlayerLine player={row.player} /> : <div className={styles.playerCell}><em className={styles.emptySlot}>{row.id ? `Player ${row.id}` : "Empty slot"}</em></div>}
              <span className={styles.pointsCell}>{row.points != null ? row.points.toFixed(2) : "—"}</span>
            </div>
          ))}
        </section>
        <div className={styles.lineupSide}>
          <BenchTable title="Bench" players={lineup.bench} />
          <BenchTable title="Injured reserve" players={lineup.reserve} />
          <BenchTable title="Taxi squad" players={lineup.taxi} />
        </div>
      </div>
    </>
  );
}

export default function LineupView({ leagues }: { leagues: LeagueData[] }) {
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
              : <TeamLineup league={league} team={mine} />}
            {league.ok && isDynasty(league) && league.windowError && <p className={styles.leagueNote}>Team window unavailable right now.</p>}
          </article>
        );
      })}
    </section>
  );
}
