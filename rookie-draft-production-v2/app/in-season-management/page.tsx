"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, AlertTriangle, BellRing, CalendarClock, CheckCircle2, ChevronRight, CircleHelp, RefreshCw, ShieldCheck, Sparkles, TrendingUp, Users, WalletCards } from "lucide-react";
import styles from "./in-season-management.module.css";

type Section = "overview" | "lineups" | "waivers" | "players";
type SleeperCheck = {
  key: string;
  configuredName: string;
  leagueId: string;
  sleeperName?: string;
  season?: string;
  status?: string;
  teamIdentity?: string;
  rosterMatch?: { rosterId: string; ownerId: string; owner: string } | null;
  candidates?: { displayName: string; username: string; userId: string }[];
  ok: boolean;
  error?: string;
};
type CheckResponse = { checks?: SleeperCheck[] };
type LeagueData = { id:string; type:string; eliminated:boolean; ok:boolean; name:string; season?:string; status?:string; week?:number; totalRosters?:number; rosterPositions?:string[]; settings?:Record<string,any>; scoringSettings?:Record<string,number>; teams?:{rosterId:string;owner:string;teamName?:string;ownerId?:string;eliminated?:boolean;players:string[];playerDetails?:{id:string;name:string;position:string;team:string;status:string;injuryStatus:string;depthChartPosition?:string|null}[];starters:string[];points:number;wins:number;losses:number;ties?:number;waiverBudget:any}[]; matchups?:{rosterId:string;matchupId:number;points:number;starters?:string[];startersPoints?:Record<string,number>}[]; transactions?:{type:string;status:string;created:number;adds:Record<string,number>;drops:Record<string,number>;waiverBudget?:any[]}[]; error?:string; fetchedAt:string };
type LeagueDataResponse = {leagues?:LeagueData[]; fetchedAt?:string};

const SECTIONS: { id: Section; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "lineups", label: "Lineups & Matchups" },
  { id: "waivers", label: "Waivers & Guillotine" },
  { id: "players", label: "Player Intelligence" },
];

function displayDate(value: string | null) {
  if (!value) return "Not checked yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Just checked";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function sourceStatus(check: SleeperCheck) {
  if (!check.ok) return "error";
  if (!check.rosterMatch) return "warning";
  return "ready";
}

export default function InSeasonManagementPage() {
  const pathname = usePathname();
  const section: Section = pathname.endsWith("/lineups") ? "lineups" : pathname.endsWith("/waivers") ? "waivers" : pathname.endsWith("/players") ? "players" : "overview";
  const [checks, setChecks] = useState<SleeperCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [leagueData,setLeagueData] = useState<LeagueData[]>([]);

  const refresh = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [checkResponse, leagueResponse] = await Promise.all([
        fetch("/api/integrations/sleeper-check", { cache: "no-store" }),
        fetch("/api/in-season/league-data", { cache: "no-store" }),
      ]);
      if (!checkResponse.ok) throw new Error(`Sleeper check returned HTTP ${checkResponse.status}`);
      if (!leagueResponse.ok) throw new Error(`Sleeper league data returned HTTP ${leagueResponse.status}`);
      const [checkData, leaguePayload] = await Promise.all([
        checkResponse.json() as Promise<CheckResponse>,
        leagueResponse.json() as Promise<LeagueDataResponse>,
      ]);
      setChecks(Array.isArray(checkData.checks) ? checkData.checks : []);
      setLeagueData(Array.isArray(leaguePayload.leagues) ? leaguePayload.leagues : []);
      setLastChecked(new Date().toISOString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to refresh Sleeper league data right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const summary = useMemo(() => ({
    total: checks.length,
    connected: checks.filter((check) => check.ok).length,
    verified: checks.filter((check) => check.ok && Boolean(check.rosterMatch)).length,
    attention: checks.filter((check) => !check.ok || !check.rosterMatch).length,
  }), [checks]);

  return (
    <div className={styles.page}>
      <header className={styles.pageHead}>
        <div>
          <div className={styles.eyebrow}>Fantasy operations · Sleeper</div>
          <h1>In-Season Management</h1>
          <p className={styles.subtitle}>{section === "overview" ? "Your weekly matchup and guillotine survival position across your Sleeper leagues." : "Lineup decisions, waiver priorities, and player signals across your Sleeper leagues."}</p>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.advisory}><ShieldCheck size={15} /> Recommendations only</span>
          <button type="button" className={styles.refreshButton} onClick={() => void refresh(true)} disabled={loading || refreshing}>
            <RefreshCw size={15} className={refreshing ? styles.spinning : ""} />
            {refreshing ? "Checking…" : "Refresh Sleeper"}
          </button>
        </div>
      </header>

      {error && (
        <div className={styles.errorBanner} role="alert">
          <AlertTriangle size={17} />
          <div><strong>Could not refresh league status.</strong><span>{error}. The page will not invent league or recommendation data.</span></div>
          <button type="button" onClick={() => void refresh(true)}>Try again</button>
        </div>
      )}

      {section === "overview" && (
        <section className={styles.overviewMatchups} aria-label="This week in your leagues">
          <div className={styles.sectionHeading}>
            <div><div className={styles.sectionKicker}>Weekly snapshot</div><h2>This week in your leagues</h2><p>Your head-to-head matchup and your weekly guillotine placement, based on Sleeper scores.</p></div>
          </div>
          {leagueData.length === 0 ? (
            <div className={styles.emptyState}><RefreshCw size={20} className={styles.spinning}/><strong>Loading weekly matchups…</strong><span>Fetching your team names and current scores from Sleeper.</span></div>
          ) : (
            <div className={styles.matchupGrid}>
              {leagueData.map((league) => {
                // The integration status endpoint may be configured for other leagues. Resolve the user's Sleeper account globally, then find that owner in each of the three requested leagues.
                const knownOwnerIds = checks.map((item) => item.rosterMatch?.ownerId).filter((id): id is string => Boolean(id));
                const myTeam = league.teams?.find((team) => knownOwnerIds.includes(team.ownerId || "")) || league.teams?.find((team) => team.owner.toLowerCase() === "cds1204");
                const ownRoster = myTeam?.rosterId;
                const myScore = league.matchups?.find((match) => match.rosterId === ownRoster);
                const guillotine = league.type.toLowerCase().includes("guillotine");
                const eliminated = league.eliminated || Boolean(myTeam?.eliminated);
                const activeTeams = (league.teams || []).filter((team) => team.players.length > 0 && !team.eliminated);
                const ranked = activeTeams.map((team) => ({ team, score: league.matchups?.find((match) => match.rosterId === team.rosterId)?.points })).filter((item) => item.score !== undefined && item.score > 0).sort((a, b) => (b.score || 0) - (a.score || 0));
                const rank = ranked.findIndex((item) => item.team.rosterId === ownRoster) + 1;
                const last = ranked.length ? ranked[ranked.length - 1] : undefined;
                const opponentScore = !guillotine && myScore ? league.matchups?.find((match) => match.matchupId === myScore.matchupId && match.rosterId !== ownRoster) : undefined;
                const opponent = opponentScore ? league.teams?.find((team) => team.rosterId === opponentScore.rosterId) : undefined;
                const teamLabel = myTeam ? (myTeam.teamName && myTeam.teamName.toLowerCase() !== myTeam.owner.toLowerCase() ? myTeam.teamName : `Roster ${myTeam.rosterId}`) : "Your team";
                return (
                  <article className={styles.matchupCard} key={league.id}>
                    <div className={styles.matchupCardHead}><div><span className={styles.sectionKicker}>{guillotine ? "Guillotine" : "Head-to-head"} · Week {league.week || "—"}</span><h3>{league.name || league.type}</h3></div><span className={`${styles.matchupState} ${eliminated ? styles.eliminatedState : league.ok ? styles.liveState : styles.errorState}`}>{eliminated ? "Eliminated" : league.ok ? "Live scores" : "Unavailable"}</span></div>
                    {!league.ok ? <p className={styles.leagueWarning}>{league.error || "Sleeper could not return this league’s scores."}</p> : !myTeam ? <div className={styles.matchupEmpty}><strong>Your team wasn’t matched in this league.</strong><span>Confirm your Sleeper team identity in Integrations.</span></div> : eliminated ? <div className={styles.eliminatedSnapshot}><strong>{teamLabel}</strong><span>Your team has already been eliminated from this guillotine league, so there is no active weekly survival placement.</span></div> : guillotine ? (
                      <>
                        <div className={styles.guillotineRank}><div className={styles.rankNumber}><strong>{rank > 0 ? rank : "—"}</strong><span>{rank > 0 ? `of ${ranked.length} scoring teams` : "Rank unavailable"}</span></div><div className={styles.rankScore}><span>Your weekly score</span><strong>{myScore ? myScore.points.toFixed(2) : "—"} <small>pts</small></strong><span>{last && myScore ? `${Math.max(0, myScore.points - (last.score || 0)).toFixed(2)} pts above the current low score` : "Weekly scores are not available yet"}</span></div></div>
                        <div className={styles.survivalTrack}><div><span>Weekly high</span><strong>{ranked[0]?.score?.toFixed(1) || "—"}</strong></div><div className={styles.survivalBar}><span style={{ width: `${ranked.length && rank ? ((ranked.length - rank + 1) / ranked.length) * 100 : 0}%` }} /></div><div><span>Current low</span><strong>{last?.score?.toFixed(1) || "—"}</strong></div></div>
                        <div className={styles.matchupFoot}><span>Team · {teamLabel}</span><span>{myTeam.players.length} rostered players</span></div>
                      </>
                    ) : (
                      <>
                        <div className={styles.headToHeadScore}><div className={styles.scoreSide}><span>Your team</span><strong>{teamLabel}</strong><b>{myScore ? myScore.points.toFixed(2) : "—"}</b></div><div className={styles.scoreDivider}>VS</div><div className={styles.scoreSide}><span>Opponent</span><strong>{opponent ? (opponent.teamName && opponent.teamName.toLowerCase() !== opponent.owner.toLowerCase() ? opponent.teamName : `Roster ${opponent.rosterId}`) : "Opponent unavailable"}</strong><b>{opponentScore ? opponentScore.points.toFixed(2) : "—"}</b></div></div>
                        <div className={styles.matchupFoot}><span>{myScore && opponentScore ? myScore.points > opponentScore.points ? `Leading by ${(myScore.points - opponentScore.points).toFixed(2)}` : myScore.points < opponentScore.points ? `Trailing by ${(opponentScore.points - myScore.points).toFixed(2)}` : "Matchup tied" : "No matchup score returned"}</span><span>Season record · {myTeam.wins}-{myTeam.losses}{myTeam.ties ? `-${myTeam.ties}` : ""}</span></div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
      {section === "lineups" && <LiveLeagueView kind="lineups" leagues={leagueData} />}

      {section === "waivers" && <LiveLeagueView kind="waivers" leagues={leagueData} />}

      {section === "players" && <LiveLeagueView kind="players" leagues={leagueData} />}

      <footer className={styles.pageFooter}>
        <span><ShieldCheck size={14} /> Advice only · all transactions remain in Sleeper</span>
        <span>Last league check: {displayDate(lastChecked)}</span>
      </footer>
    </div>
  );
}

function LiveLeagueView({kind,leagues}:{kind:"lineups"|"waivers"|"players";leagues:LeagueData[]}) {
  const active=leagues.filter(l=>l.ok&&!l.eliminated);
  const title=kind==="lineups"?"Lineups & Matchups":kind==="waivers"?"Waivers & Guillotine":"Player Intelligence";
  return <section className={styles.modulePage}>
    <div className={styles.moduleHero}><div className={styles.moduleIcon}>{kind==="lineups"?<Sparkles size={19}/>:kind==="waivers"?<WalletCards size={19}/>:<TrendingUp size={19}/>}</div><div><div className={styles.sectionKicker}>Sleeper · Live league data</div><h2>{title}</h2><p>{kind==="lineups"?"Current rosters, starter slots, league matchup scores, and roster records from Sleeper.":kind==="waivers"?"League waiver settings, FAAB budgets where available, and recent transaction activity.":"League scoring and roster context for the next layer of player-level signals."}</p></div></div>
    {leagues.length===0?<div className={styles.emptyState}><RefreshCw size={20}/><strong>Loading Sleeper league data</strong><span>League data will appear once the request completes.</span></div>:leagues.map(league=><article className={styles.leagueCard} key={league.id}>
      <div className={styles.leagueTop}><span className={styles.statusDot}/><span className={styles.statusLabel}>{league.type}</span><span className={styles.leagueSeason}>{league.eliminated?"Eliminated":league.ok?"Sleeper connected":"Unavailable"}</span></div>
      <h3>{league.name}</h3><div className={styles.leagueMeta}><span>League ID · {league.id}</span><span>{league.season||"Season unavailable"} · Week {league.week||"—"}</span><span>{league.totalRosters||"—"} teams</span></div>
      {league.eliminated&&<p className={styles.leagueWarning}>Your team has been eliminated. This league is excluded from active recommendations.</p>}
      {!league.ok?<p className={styles.leagueWarning}>{league.error||"Sleeper data is unavailable."}</p>:kind==="lineups"?<>
        <p className={styles.leagueNote}>Roster slots: {(league.rosterPositions||[]).join(", ")||"Unavailable"}. Matchup scores are current Sleeper totals, not independent projections.</p>
        <div className={styles.leagueGrid}>{(league.teams||[]).map(team=>{ const matchup=league.matchups?.find(match=>match.rosterId===team.rosterId); const starterIds=team.starters.filter(id=>id!=="0"); const starters=(team.playerDetails||[]).filter(player=>starterIds.includes(player.id)); return <div className={styles.panel} key={team.rosterId}><strong>{team.owner}</strong><div className={styles.leagueMeta}><span>Record {team.wins}-{team.losses}{team.ties?("-"+team.ties):""}</span><span>Week {matchup?matchup.points.toFixed(1):"—"} pts</span><span>{starterIds.length}/{team.starters.length} starters set</span></div><p className={styles.rosterList}>{starters.length?starters.map(player=><span key={player.id}><b>{player.position}</b> {player.name} <small>{player.team}</small></span>):"Starter names are unavailable from Sleeper for this roster."}</p></div>; })}</div>
      </>:kind==="waivers"?<>
        <p className={styles.leagueNote}>Waiver type: {String(league.settings?.waiver_type??"not reported")}; FAAB budget setting: {String(league.settings?.waiver_budget??"not reported")}; roster transaction settings are shown only when supplied by Sleeper.</p>
        <div className={styles.leagueGrid}>{(league.teams||[]).map(team=><div className={styles.panel} key={team.rosterId}><strong>{team.owner}</strong><div className={styles.leagueMeta}><span>Remaining FAAB: {team.waiverBudget??"not reported"}</span><span>{team.players.length} rostered players</span></div></div>)}</div>
        <h3>Recent transactions</h3>{(league.transactions||[]).length? <ul className={styles.transactionList}>{league.transactions!.slice(0,8).map((tx,i)=>{ const names=new Map((league.teams||[]).flatMap(team=>(team.playerDetails||[]).map(player=>[player.id,player.name] as const))); const adds=Object.keys(tx.adds||{}).map(id=>names.get(id)||("Player "+id)); const drops=Object.keys(tx.drops||{}).map(id=>names.get(id)||("Player "+id)); return <li key={i}><div><strong>{adds.join(", ")||"Roster move"}</strong><span>{tx.type} · {tx.status} · {new Date(tx.created).toLocaleDateString()}</span></div><small>{drops.length?("Dropped: "+drops.join(", ")):"No drop recorded"}</small></li>; })}</ul>:<p>No current-week transaction records were returned.</p>}
      </>:<><p className={styles.leagueNote}>Player status and roster availability are shown from Sleeper. Fantasy projections and consensus deltas are not available in the current feed, so no unverified start/sit scores are shown.</p><div className={styles.leagueGrid}>{(league.teams||[]).filter(team=>team.players.length>0).map(team=>{ const flagged=(team.playerDetails||[]).filter(player=>player.injuryStatus||/inactive|injured|out|questionable|doubtful/i.test(player.status)); return <div className={styles.panel} key={team.rosterId}><strong>{team.owner}</strong><div className={styles.leagueMeta}><span>{team.players.length} rostered</span><span>{flagged.length} status flags</span></div>{flagged.length?<ul className={styles.playerSignalList}>{flagged.map(player=><li key={player.id}><span><b>{player.position}</b> {player.name} <small>{player.team}</small></span><strong>{player.injuryStatus||player.status}</strong></li>)}</ul>:<p>No injury/status flags returned for this roster by Sleeper.</p>}</div>; })}</div></>}
    </article>)}
    <div className={styles.pageFooter}><span><ShieldCheck size={14}/> Advice only · transactions stay in Sleeper</span><span>{active.length} active league(s) available</span></div>
  </section>;
}

function ModuleView({ icon, eyebrow, title, status, description, items }: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  status: string;
  description: string;
  items: { title: string; detail: string }[];
}) {
  return (
    <section className={styles.modulePage}>
      <div className={styles.moduleHero}>
        <div className={styles.moduleIcon}>{icon}</div>
        <div><div className={styles.sectionKicker}>{eyebrow}</div><h2>{title}</h2><p>{description}</p></div>
        <span className={styles.moduleStatus}><AlertTriangle size={14} /> {status}</span>
      </div>
      <div className={styles.moduleGrid}>
        {items.map((item, index) => (
          <article className={styles.moduleCard} key={item.title}>
            <div className={styles.moduleNumber}>{String(index + 1).padStart(2, "0")}</div>
            <h3>{item.title}</h3><p>{item.detail}</p>
          </article>
        ))}
      </div>
      <div className={styles.moduleNotice}>
        <ShieldCheck size={18} />
        <div><strong>Your decisions, clearly explained.</strong><p>Recommendations will show the reasoning, source freshness, and uncertainty behind each decision.</p></div>
      </div>
    </section>
  );
}
