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
type LeagueData = { id:string; type:string; eliminated:boolean; ok:boolean; name:string; season?:string; status?:string; week?:number; totalRosters?:number; rosterPositions?:string[]; settings?:Record<string,any>; scoringSettings?:Record<string,number>; teams?:{rosterId:string;owner:string;players:string[];starters:string[];points:number;wins:number;losses:number;waiverBudget:any}[]; matchups?:{rosterId:string;matchupId:number;points:number}[]; transactions?:{type:string;status:string;created:number;adds:Record<string,number>;drops:Record<string,number>}[]; error?:string; fetchedAt:string };
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
      const response = await fetch("/api/integrations/sleeper-check", { cache: "no-store" });
      if (!response.ok) throw new Error(`Sleeper check returned HTTP ${response.status}`);
      const data = (await response.json()) as CheckResponse;
      setChecks(Array.isArray(data.checks) ? data.checks : []);
      setLastChecked(new Date().toISOString());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to check Sleeper right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void refresh(); void fetch("/api/in-season/league-data",{cache:"no-store"}).then(r=>r.json()).then((d:LeagueDataResponse)=>setLeagueData(Array.isArray(d.leagues)?d.leagues:[])).catch(()=>setLeagueData([])); }, [refresh]);

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
          <p className={styles.subtitle}>A single command center for lineup decisions, waiver priorities, guillotine survival, and player signals across your leagues.</p>
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
        <>
          <section className={styles.summaryGrid} aria-label="League readiness summary">
            <article className={styles.summaryCard}><span>Configured leagues</span><strong>{loading || (Boolean(error) && checks.length === 0) ? "—" : summary.total}</strong><small>Enabled Sleeper integrations returned</small><Users size={19} /></article>
            <article className={styles.summaryCard}><span>Sleeper reachable</span><strong>{loading || (Boolean(error) && checks.length === 0) ? "—" : summary.connected}</strong><small>League metadata and roster endpoints respond</small><Activity size={19} /></article>
            <article className={styles.summaryCard}><span>Roster identity verified</span><strong>{loading || (Boolean(error) && checks.length === 0) ? "—" : summary.verified}</strong><small>Configured team matched to a Sleeper roster</small><CheckCircle2 size={19} /></article>
            <article className={styles.summaryCard}><span>Needs attention</span><strong className={summary.attention ? styles.warningNumber : ""}>{loading || (Boolean(error) && checks.length === 0) ? "—" : summary.attention}</strong><small>Connection or roster mapping needs review</small><AlertTriangle size={19} /></article>
          </section>

          <section className={styles.sectionBlock}>
            <div className={styles.sectionHeading}>
              <div><div className={styles.sectionKicker}>Your teams</div><h2>League dashboard</h2><p>Live records, current-week scoring, and roster context pulled from Sleeper.</p></div>
            </div>
            {leagueData.length === 0 ? (
              <div className={styles.emptyState}><RefreshCw size={20} className={styles.spinning} /><strong>Loading your leagues…</strong><span>Fetching live league, roster, and matchup details from Sleeper.</span></div>
            ) : (
              <div className={styles.leagueGrid}>
                {leagueData.map((league) => {
                  const check = checks.find((item) => item.leagueId === league.id);
                  const ownRoster = check?.rosterMatch?.rosterId;
                  const myTeam = league.teams?.find((team) => team.rosterId === ownRoster);
                  const myMatchup = league.matchups?.find((match) => match.rosterId === ownRoster);
                  return (
                    <article className={styles.leagueCard} key={league.id}>
                      <div className={styles.leagueTop}>
                        <span className={`${styles.statusDot} ${league.ok ? league.eliminated ? styles.warning : styles.ready : styles.error}`} />
                        <span className={`${styles.statusLabel} ${league.ok ? league.eliminated ? styles.warning : styles.ready : styles.error}`}>{league.eliminated ? "Eliminated" : league.ok ? "Sleeper connected" : "Unavailable"}</span>
                        <span className={styles.leagueSeason}>{league.season || "Season unknown"}</span>
                      </div>
                      <h3>{league.name || (league.type + " League")}</h3>
                      <div className={styles.leagueMeta}>
                        <span>{league.type}</span><span>Week {league.week || "—"}</span><span>{league.totalRosters || "—"} teams</span>
                      </div>
                      {league.eliminated ? (
                        <p className={styles.leagueWarning}>Your team has been eliminated. This league remains available for historical context and is excluded from active recommendations.</p>
                      ) : !league.ok ? (
                        <p className={styles.leagueWarning}>{league.error || "Sleeper data is unavailable. Try refreshing in a moment."}</p>
                      ) : (
                        <>
                          <div className={styles.teamSnapshot}>
                            <div><span>Your team</span><strong>{myTeam?.owner || check?.rosterMatch?.owner || "Team identity not matched"}</strong></div>
                            <div><span>Record</span><strong>{myTeam ? `${myTeam.wins}-${myTeam.losses}${myTeam.ties ? `-${myTeam.ties}` : ""}` : "—"}</strong></div>
                            <div><span>Week points</span><strong>{myMatchup ? myMatchup.points.toFixed(1) : "—"}</strong></div>
                          </div>
                          <p className={myTeam ? styles.leagueNote : styles.leagueWarning}>{myTeam ? `${myTeam.players.length} rostered players · ${myTeam.starters.filter((id) => id !== "0").length} filled starter slots. Matchup points reflect Sleeper's current-week total.` : "Sleeper data is available, but the configured team identity has not been matched. League-wide data is visible; personal recommendations should wait until the team is verified."}</p>
                        </>
                      )}
                      <div className={styles.leagueFooter}><span>League ID · {league.id}</span><span>{league.ok ? "Live Sleeper data" : "Needs review"}</span></div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className={styles.sectionBlock}>
            <div className={styles.sectionHeading}>
              <div><div className={styles.sectionKicker}>Portfolio</div><h2>Your Sleeper leagues</h2><p>Live league records, lineup slots, scoring, and waiver context for your three leagues.</p></div>
              <Link href="/integrations" className={styles.textLink}>Manage integrations <ChevronRight size={15} /></Link>
            </div>
            {loading && checks.length === 0 ? (
              <div className={styles.emptyState}><RefreshCw size={20} className={styles.spinning} /><strong>Checking configured leagues…</strong><span>Reading the existing Sleeper integration; no mock league data is used.</span></div>
            ) : checks.length === 0 ? (
              <div className={styles.emptyState}>{error ? <AlertTriangle size={22} /> : <Users size={22} />}<strong>{error ? "Unable to verify configured leagues" : "No enabled Sleeper leagues were returned"}</strong><span>{error ? "The league configuration could not be loaded, so the number of configured leagues is unknown. Try again before changing your integration settings." : "Connect or enable your leagues in Integrations, then refresh this page."}</span><Link href="/integrations">Open Integrations <ChevronRight size={14} /></Link></div>
            ) : (
              <div className={styles.leagueGrid}>
                {checks.map((check) => {
                  const status = sourceStatus(check);
                  return (
                    <article className={styles.leagueCard} key={check.key}>
                      <div className={styles.leagueTop}>
                        <span className={`${styles.statusDot} ${styles[status]}`} />
                        <span className={`${styles.statusLabel} ${styles[status]}`}>{status === "ready" ? "Roster verified" : status === "warning" ? "Check team mapping" : "Connection issue"}</span>
                        <span className={styles.leagueSeason}>{check.season || "Season unknown"}</span>
                      </div>
                      <h3>{check.sleeperName || check.configuredName || "Sleeper league"}</h3>
                      {check.sleeperName && check.sleeperName !== check.configuredName && <p className={styles.configuredName}>Configured as: {check.configuredName}</p>}
                      <div className={styles.leagueMeta}>
                        <span><Users size={14} /> {check.rosterMatch?.owner ? `Team: ${check.rosterMatch.owner}` : "Team identity not verified"}</span>
                        <span><Activity size={14} /> {check.status ? `League status: ${check.status}` : "League status unavailable"}</span>
                      </div>
                      {check.ok ? (
                        <p className={status === "ready" ? styles.leagueNote : styles.leagueWarning}>
                          {status === "ready" ? "Sleeper is reachable and the configured team matches a roster." : "Sleeper responded, but the configured team identity did not match a roster. Verify the team identity in Integrations before using lineup or waiver recommendations."}
                        </p>
                      ) : (
                        <p className={styles.leagueWarning}>{check.error || "Sleeper could not return this league. Check the league ID and try again."}</p>
                      )}
                      <div className={styles.leagueFooter}>
                        <span>League ID · {check.leagueId}</span>
                        <span>{check.ok ? "Sleeper API" : "Needs review"}</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className={styles.lowerGrid}>
            <article className={styles.panel}>
              <div className={styles.panelIcon}><BellRing size={18} /></div>
              <div className={styles.panelTitleRow}><h2>Action queue</h2><span className={styles.comingSoon}>Alerts</span></div>
              <p>Track important lineup, injury, projection, and waiver changes here throughout the week.</p>
              <div className={styles.dataGate}><CircleHelp size={15} /><span>Alerts focus on changes that could affect a decision.</span></div>
            </article>
            <article className={styles.panel}>
              <div className={styles.panelIcon}><CalendarClock size={18} /></div>
              <div className={styles.panelTitleRow}><h2>Upcoming deadlines</h2><span className={styles.comingSoon}>League schedule</span></div>
              <p>Waiver processing, kickoff, lineup lock, and guillotine elimination times must come from the individual league's settings and current schedule.</p>
              <div className={styles.dataGate}><AlertTriangle size={15} /><span>League-specific timing appears here when available.</span></div>
            </article>
          </section>
        </>
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
        <div className={styles.leagueGrid}>{(league.teams||[]).map(team=><div className={styles.panel} key={team.rosterId}><strong>{team.owner}</strong><div className={styles.leagueMeta}><span>{team.wins}-{team.losses}</span><span>{team.points.toFixed(2)} season points</span><span>{team.starters.length} starter slots</span></div><p>Rostered players: {team.players.length}. Current starters: {team.starters.filter(x=>x!=="0").length}.</p></div>)}</div>
      </>:kind==="waivers"?<>
        <p className={styles.leagueNote}>Waiver type: {String(league.settings?.waiver_type??"not reported")}; FAAB budget setting: {String(league.settings?.waiver_budget??"not reported")}; roster transaction settings are shown only when supplied by Sleeper.</p>
        <div className={styles.leagueGrid}>{(league.teams||[]).map(team=><div className={styles.panel} key={team.rosterId}><strong>{team.owner}</strong><div className={styles.leagueMeta}><span>Remaining FAAB: {team.waiverBudget??"not reported"}</span><span>{team.players.length} rostered players</span></div></div>)}</div>
        <h3>Recent transactions</h3>{(league.transactions||[]).length? <ul>{league.transactions!.slice(0,8).map((tx,i)=><li key={i}>{tx.type} · {tx.status} · {Object.keys(tx.adds).length} adds · {Object.keys(tx.drops).length} drops</li>)}</ul>:<p>No current-week transaction records were returned.</p>}
      </>:<><p className={styles.leagueNote}>Scoring settings: {Object.keys(league.scoringSettings||{}).length?Object.entries(league.scoringSettings!).slice(0,8).map(([k,v])=>k+": "+v).join(" · "):"No scoring settings returned"}.</p><p>Projection deltas, injury context, and free-source consensus will be added only when the underlying data can be verified.</p></>}
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
