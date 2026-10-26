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

      <nav className={styles.tabs} aria-label="In-season sections">
        {SECTIONS.map((item) => (
          <Link key={item.id} href={item.id === "overview" ? "/in-season-management" : `/in-season-management/${item.id}`} className={section === item.id ? styles.activeTab : ""} aria-current={section === item.id ? "page" : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>

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
              <div><div className={styles.sectionKicker}>Portfolio</div><h2>Your Sleeper leagues</h2><p>Connection and team ownership are checked against Sleeper. Recommendations remain gated until league settings and data sources are validated.</p></div>
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

      {section === "lineups" && (
        <ModuleView icon={<Sparkles size={19} />} eyebrow="Weekly decisions" title="Lineups & Matchups" status="Lineup insights" description="The optimizer will compare your current starters with the best legal lineup, show the projected point delta, and explain each meaningful start/sit alternative." items={[
          {title:"League-valid lineup optimizer",detail:"Uses each league's roster slots, position eligibility, scoring settings, and flex/superflex rules."},
          {title:"Matchup and schedule outlook",detail:"Opponent comparison plus near-term schedule context, with a three-week lookahead where reliable data is available."},
          {title:"Late news contingency paths",detail:"Injury, inactive, weather, and late-game alternatives with source timestamps and a clear stale-data warning."},
        ]} />
      )}

      {section === "waivers" && (
        <ModuleView icon={<WalletCards size={19} />} eyebrow="Roster improvement" title="Waivers & Guillotine" status="Waiver insights" description="Waiver advice will be tailored to each league's available players, remaining FAAB, waiver timing, roster constraints, and guillotine risk." items={[
          {title:"Add / drop comparison",detail:"Expected lineup impact, roster fit, and opportunity cost instead of a generic ranked list."},
          {title:"FAAB ranges",detail:"Suggested bid ranges with remaining-budget context; the final bid remains your decision in Sleeper."},
          {title:"Guillotine survival estimate",detail:"Weekly cut-line and survival probability with uncertainty—not a guarantee—and only after actual elimination and scoring settings are verified."},
        ]} />
      )}

      {section === "players" && (
        <ModuleView icon={<TrendingUp size={19} />} eyebrow="Signals, not hype" title="Player Intelligence" status="Player signals" description="Player signals will compare Sleeper projections with a consensus of available free projections when source coverage is sufficient." items={[
          {title:"Projection edge",detail:"Independent expected points versus Sleeper's baseline, with source-by-source coverage and timestamp."},
          {title:"Usage and performance trend",detail:"Recent opportunity, role changes, and sustainable versus potentially noisy production signals when reliable stats are available."},
          {title:"Context adjustments",detail:"Injuries, inactives, weather, opponent, and schedule context with explicit confidence and missing-data indicators."},
        ]} />
      )}

      <footer className={styles.pageFooter}>
        <span><ShieldCheck size={14} /> Advice only · all transactions remain in Sleeper</span>
        <span>Last league check: {displayDate(lastChecked)}</span>
      </footer>
    </div>
  );
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
