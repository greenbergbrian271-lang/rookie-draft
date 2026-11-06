"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TIER_LABEL, buildClaimSheet, buildMatrix, lastName, lineupShift, orderedPairs, tierOf, winAt, type ClaimSheet, type PlayerInfo } from "@/lib/in-season-guillotine";
import shared from "./in-season-management.module.css";
import styles from "./guillotine-waivers.module.css";

type Bid = { p50: number; p75: number; p90: number; mainRivals: { owner: string; gain: number; budget: number; typical: number }[]; curve: { bid: number; win: number }[] };
type Target = { id: string; name: string; position: string; team: string; age: number | null; injury: string; proj: number[]; byeWeeks: number[]; nextBye?: number | null; newlyReleased: boolean; gains: number[]; weightedGain: number; bid: Bid; rivalsInterested: number };
type Offer = { owner: string; theirGain: number; faab: number; theirBudget: number };
type Idea = { id: string; name: string; position: string; team: string; injury: string; lineupLoss: number; tier: number; offers: Offer[]; topOffer: number };
type Data = {
  eliminated?: boolean; week: number; horizon: number[]; league: { id: string; name: string; slots: string[] };
  me: { faab: number; waiverPosition: number; roster: PlayerInfo[] };
  faab: { teams: number; top: { owner: string; faab: number }; second: { owner: string; faab: number } | null; leadOverSecond: number; leadOverAverage: number; average: number; lowest: { owner: string; faab: number }; mine: number; mineRank: number };
  chop: { week: number; scoringPosted: boolean; result: { owner: string } | null; teams: { owner: string; chance: number; pointsSoFar: number; projectedRemaining: number; best: { name: string; position: string; gainForMe: number }[] }[] };
  simulatedChop: { owner: string; released: number } | null; owners: string[]; targets: Target[]; tradeIdeas: Idea[];
};
type LeagueTab = { id: string; name: string; eliminated: boolean };
const pct = (v: number) => `${Math.round(v * 100)}%`;
const r1 = (v: number) => Math.round(v * 10) / 10;
const sign = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(r1(v))}`;
const last = lastName;
const tag = (p: { position: string; team: string; injury?: string }) => `${p.position} · ${p.team}${p.injury ? ` · ${p.injury}` : ""}`;
const tierClass = (net: number) => [styles.t1, styles.t1, styles.t2, styles.t3, styles.t4][tierOf(net)];
const avgPlayed = (p: PlayerInfo) => { const x = p.proj.filter((v) => v > 0); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0; };

/** Why a player is cheap or costly to cut, in plain words. */
function dropNote(p: PlayerInfo, cost: number, roster: PlayerInfo[]): string {
  const parts: string[] = [];
  if (/^(out|ir|pup|sus)/i.test(p.injury)) parts.push(p.injury);
  if (p.position === "QB" || p.position === "TE") {
    const others = roster.filter((q) => q.position === p.position && q.id !== p.id).sort((a, b) => avgPlayed(b) - avgPlayed(a));
    const starter = others[0];
    if (!starter) parts.push(`Your only ${p.position}`);
    else if (avgPlayed(p) >= avgPlayed(starter)) parts.push(`Your starting ${p.position}`);
    else if (cost < 0.5) {
      if (starter.nextBye) parts.push(`Covers ${last(starter.name)}'s week ${starter.nextBye} bye`);
      else if (p.position === "QB" && (starter.qbRank ?? 99) <= 6) parts.push(`Backup to elite ${last(starter.name)} (QB${starter.qbRank}), bye already passed`);
      else if (p.position === "QB") parts.push(`${last(starter.name)} is QB${starter.qbRank}, not elite: a matchup option`);
      else parts.push(`Backup to ${last(starter.name)}, no bye ahead`);
    } else parts.push("Plays for you in the window");
  } else if (cost < 0.5) parts.push("No lineup role in the next 3 weeks");
  else parts.push(`Worth ${r1(cost)} lineup points`);
  if (p.nextBye && p.position !== "QB") parts.push(`bye wk ${p.nextBye}`);
  return parts.join(" · ");
}

export default function GuillotineWaivers() {
  const [leagues, setLeagues] = useState<LeagueTab[]>([]);
  const [leagueId, setLeagueId] = useState("");
  const [chop, setChop] = useState<string>(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("chop") || ""));
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [sellId, setSellId] = useState("");
  const [buyer, setBuyer] = useState("");
  const [useTrade, setUseTrade] = useState(false);
  const [building, setBuilding] = useState(false);
  const [saved, setSaved] = useState<{ t: string[]; d: string[] }>({ t: [], d: [] });
  const [showAllDrops, setShowAllDrops] = useState(false);
  const [focus, setFocus] = useState<{ add: string; drop: string } | null>(null);
  const [sheets, setSheets] = useState<{ now: ClaimSheet; after: ClaimSheet | null; budgetNow: number; budgetAfter: number; loss: number; sold: string } | null>(null);

  useEffect(() => {
    fetch("/api/in-season/guillotine-waivers?list=1", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      const list: LeagueTab[] = j.leagues || [];
      setLeagues(list); setLeagueId((list.find((l) => !l.eliminated) || list[0])?.id || "");
    }).catch((e) => setError(e.message || "Could not load leagues."));
  }, []);

  const load = useCallback(async (id: string, owner: string) => {
    setError(""); setSheets(null); setData(null);
    try {
      const qs = new URLSearchParams({ league: id }); if (owner) qs.set("chop", owner);
      const r = await fetch(`/api/in-season/guillotine-waivers?${qs}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e: any) { setError(e.message || "Could not load."); }
  }, []);
  useEffect(() => { if (leagueId) load(leagueId, chop); }, [leagueId, chop, load]);

  useEffect(() => {
    try { const raw = window.localStorage.getItem(`guillotine-order:${leagueId}`); setSaved(raw ? JSON.parse(raw) : { t: [], d: [] }); } catch { setSaved({ t: [], d: [] }); }
    setFocus(null);
  }, [leagueId]);
  const persist = (next: { t: string[]; d: string[] }) => { setSaved(next); try { window.localStorage.setItem(`guillotine-order:${leagueId}`, JSON.stringify(next)); } catch { /* storage unavailable: order lasts until reload */ } };

  const live = data && !data.eliminated ? data : null;
  const faab = live ? live.me.faab : 0;
  const sel = live?.tradeIdeas.find((i) => i.id === sellId) || null;
  const offer = sel?.offers.find((o) => o.owner === buyer) || null;
  const after = faab + (offer?.faab || 0);

  const info = useMemo(() => {
    const m: Record<string, PlayerInfo> = {};
    live?.me.roster.forEach((p) => { m[p.id] = p; });
    live?.targets.forEach((t) => { m[t.id] = { id: t.id, name: t.name, position: t.position, team: t.team, injury: t.injury, age: t.age, proj: t.proj, byeWeeks: t.byeWeeks, nextBye: t.nextBye }; });
    return m;
  }, [live]);
  const rosterIds = useMemo(() => live?.me.roster.map((p) => p.id) || [], [live]);
  const targetById = useMemo(() => new Map((live?.targets || []).map((t) => [t.id, t])), [live]);
  const matrix = useMemo(() => (live ? buildMatrix(live.league.slots, rosterIds, info, live.targets.map((t) => t.id)) : null), [live, rosterIds, info]);
  // Targets and drops start in the model's order (best swap first, cheapest drop first); your reordering is saved per league in this browser.
  const merge = (mine: string[], def: string[]) => [...mine.filter((id) => def.includes(id)), ...def.filter((id) => !mine.includes(id))];
  const defaultT = useMemo(() => (matrix?.rows || []).filter((r) => (r.best?.net ?? -9) >= 2).slice(0, 12).map((r) => r.id), [matrix]);
  const defaultD = useMemo(() => (matrix?.drops || []).map((d) => d.id), [matrix]);
  const targetIds = useMemo(() => merge(saved.t, defaultT), [saved.t, defaultT]);
  const dropIds = useMemo(() => merge(saved.d, defaultD), [saved.d, defaultD]);
  const rowOf = useMemo(() => new Map((matrix?.rows || []).map((r) => [r.id, r])), [matrix]);
  const MXCOLS = 10;
  const cols = useMemo(() => dropIds.slice(0, MXCOLS), [dropIds]);
  /** Target number k is only compared with drops 1 to k. Its Net is its best swap among those. */
  const ranked = useMemo(() => targetIds.map((id, i) => {
    const row = rowOf.get(id)!;
    const allowed = dropIds.slice(0, Math.min(i + 1, MXCOLS));
    let best: { drop: string; net: number } | null = null;
    for (const d of allowed) { const n = row.nets[d]; if (n !== undefined && (!best || n > best.net)) best = { drop: d, net: n }; }
    return { id, row, allowed, best };
  }), [targetIds, dropIds, rowOf]);
  const move = (kind: "t" | "d", id: string, dir: -1 | 1) => {
    const list = [...(kind === "t" ? targetIds : dropIds)];
    const i = list.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    persist({ t: kind === "t" ? list : targetIds, d: kind === "d" ? list : dropIds });
  };

  const build = () => {
    if (!live || !matrix) return;
    setBuilding(true);
    setTimeout(() => {
      const run = (budget: number, roster: string[]) => {
        const mx = buildMatrix(live.league.slots, roster, info, live.targets.map((t) => t.id));
        const tg = targetIds.map((id) => targetById.get(id)!).filter(Boolean).map((t) => ({ id: t.id, curve: t.bid.curve, p50: t.bid.p50, p75: t.bid.p75, p90: t.bid.p90 }));
        return buildClaimSheet({ slots: live.league.slots, roster, info, targets: tg, pairs: orderedPairs(mx, targetIds, dropIds.filter((id) => roster.includes(id))), budget });
      };
      const now = run(faab, rosterIds);
      const afterSheet = useTrade && offer && sel ? run(after, rosterIds.filter((id) => id !== sel.id)) : null;
      setSheets({ now, after: afterSheet, budgetNow: faab, budgetAfter: after, loss: sel?.lineupLoss || 0, sold: sel?.name || "" });
      setBuilding(false);
    }, 30);
  };

  const tabs = (
    <div className={styles.tabs}>
      {leagues.map((l) => <button key={l.id} className={`${styles.tab} ${l.id === leagueId ? styles.tabOn : ""}`} onClick={() => { setLeagueId(l.id); setChop(""); }}>{l.name}{l.eliminated ? " · Eliminated" : ""}</button>)}
    </div>
  );
  const hero = <div className={shared.moduleHero}><div><div className={shared.sectionKicker}>In-season</div><h2>Guillotine</h2></div></div>;

  if (error) return <div className={styles.wrap}>{hero}{tabs}<div className={styles.banner}>Failed to load: {error}</div></div>;
  if (!data) return <div className={styles.wrap}>{hero}{tabs}<div className={styles.banner}>Loading…</div></div>;
  if (!live || !matrix) return <div className={styles.wrap}>{hero}{tabs}<section className={`${shared.panel} ${styles.out}`}><h2>You&apos;re eliminated</h2><div className={styles.meta}>{data.league.name} · see you next year.</div></section></div>;

  const f = live.faab;
  const rosterInfo = live.me.roster;
  const costOf = new Map(matrix.drops.map((d) => [d.id, d.cost]));
  const tiers = [1, 2, 3].map((t) => ranked.filter((r) => r.best && tierOf(r.best.net) === t));
  const skipped = [...ranked.filter((r) => !r.best || tierOf(r.best.net) === 4).map((r) => ({ id: r.id, net: r.best?.net ?? 0 })), ...matrix.rows.filter((r) => !targetIds.includes(r.id)).map((r) => ({ id: r.id, net: r.best?.net ?? 0 }))];
  const weeks = live.horizon.length || 3;
  const mover = (kind: "t" | "d", id: string, i: number, n: number) => <span style={{ whiteSpace: "nowrap" }}><button className={styles.mv} disabled={i === 0} onClick={() => move(kind, id, -1)} aria-label="Move up">▲</button><button className={styles.mv} disabled={i === n - 1} onClick={() => move(kind, id, 1)} aria-label="Move down">▼</button></span>;
  const shiftRows = (add: string, drop: string) => lineupShift(live.league.slots, rosterIds, info, add, drop).slice(0, weeks).map((s) => (
    <td key={s.week} style={{ whiteSpace: "normal", minWidth: 150 }}>
      <b>{sign(s.gain)}</b>
      <div className={styles.meta}>{s.ins.length || s.outs.length ? <>In: {s.ins.map((x) => `${last(info[x.id].name)} ${r1(x.value)}`).join(", ") || "none"}<br />Out: {s.outs.map((x) => `${last(info[x.id].name)} ${r1(x.value)} (${x.dropped ? "cut" : "to bench"})`).join(", ") || "none"}</> : "Starting lineup unchanged"}</div>
    </td>));

  return (
    <div className={styles.wrap}>
      {hero}{tabs}
      {live.simulatedChop && <div className={styles.banner}>Test: {live.simulatedChop.owner} assumed chopped ({live.simulatedChop.released} players released).</div>}

      <div className={styles.row}>
        <div className={styles.stat}><b>${faab}</b><span>Your FAAB</span></div>
        <div className={styles.stat}><b>#{live.me.waiverPosition}</b><span>Priority</span></div>
        <label className={styles.meta}>Assume chopped<br /><select className={styles.select} value={chop} onChange={(e) => setChop(e.target.value)}><option value="">None (live)</option>{live.owners.map((o) => <option key={o}>{o}</option>)}</select></label>
      </div>

      <section className={shared.panel}>
        <h3 className={styles.h}>FAAB across the league</h3>
        <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Most FAAB</th><th>Lead over #2</th><th>Lead over avg of others</th><th>League average</th><th>Least FAAB</th><th>You</th></tr></thead><tbody><tr>
          <td><b>${f.top.faab}</b> <span className={styles.meta}>{f.top.owner}</span></td>
          <td>{f.second ? <>+${f.leadOverSecond} <span className={styles.meta}>vs {f.second.owner} ${f.second.faab}</span></> : "—"}</td>
          <td>+${f.leadOverAverage}</td><td>${f.average}</td>
          <td><b>${f.lowest.faab}</b> <span className={styles.meta}>{f.lowest.owner}</span></td>
          <td>#{f.mineRank} of {f.teams}</td>
        </tr></tbody></table></div>
      </section>

      <div className={styles.split}>
        <section className={shared.panel}>
          <h3 className={styles.h}>Targets</h3>
          <div className={styles.scroll}><table className={styles.table}><thead><tr><th>#</th><th>Player</th><th>Net</th><th>Bid 50 / 75 / 90%</th><th>Order</th></tr></thead><tbody>
            {ranked.map((r, i) => { const t = targetById.get(r.id)!; return (
              <tr key={r.id}>
                <td>{i + 1}</td>
                <td><b>{t.name}</b><br /><span className={styles.meta}>{tag(t)}{t.byeWeeks.length ? ` · bye wk ${t.byeWeeks.join(",")}` : ""}</span>{t.newlyReleased && <span className={`${styles.badge} ${styles.good}`}>New</span>}</td>
                <td><span className={`${styles.cell} ${tierClass(r.best?.net ?? -9)}`}>{sign(r.best?.net ?? 0)}</span></td>
                <td>${t.bid.p50} / ${t.bid.p75} / ${t.bid.p90}</td>
                <td>{mover("t", r.id, i, ranked.length)}</td>
              </tr>); })}
            {!ranked.length && <tr><td colSpan={5} className={styles.meta}>No available swap improves your lineup by 2 or more points.</td></tr>}
          </tbody></table></div>
          <div className={styles.meta} style={{ marginTop: 8, lineHeight: 1.5 }}><b>How Net works.</b> Net is your best possible starting lineup after the swap minus your best lineup today, added up over the next 3 weeks and weighted 1.0 / 0.8 / 0.6 (week 1 counts most; total weight 2.4). It is total lineup points, not points per game: divide by about 2.4 for a rough per-week number (+12 is about +5 a week). It is not a head-to-head between two players: your whole lineup is re-set each week, so a player who would start over someone is credited only with the difference. A target is only scored against the drops ranked at or above his number. <button className={styles.link} onClick={() => persist({ t: [], d: [] })}>Reset order</button></div>
        </section>

        <section className={shared.panel}>
          <h3 className={styles.h}>Drops (your order, cheapest first by default)</h3>
          <div className={styles.scroll}><table className={styles.table}><thead><tr><th>#</th><th>Player</th><th>Costs you</th><th>Order</th></tr></thead><tbody>
            {(showAllDrops ? dropIds : dropIds.slice(0, 10)).map((id, i) => { const p = info[id]; const cost = costOf.get(id) ?? 0; return (
              <tr key={id}><td>{i + 1}</td><td><b>{p.name}</b> <span className={styles.meta}>{tag(p)}</span><br /><span className={styles.meta}>{dropNote(p, cost, rosterInfo)}</span></td><td>{cost < 0.05 ? "0" : `−${r1(cost)}`}</td><td>{mover("d", id, i, dropIds.length)}</td></tr>); })}
          </tbody></table></div>
          {dropIds.length > 10 && <button className={styles.link} style={{ marginTop: 6 }} onClick={() => setShowAllDrops(!showAllDrops)}>{showAllDrops ? "Show top 10" : `Show all ${dropIds.length}`}</button>}
        </section>
      </div>

      <section className={shared.panel}>
        <h3 className={styles.h}>Add / drop matrix</h3>
        <div className={styles.meta} style={{ marginBottom: 8 }}>Net lineup points over the next 3 weeks if you add the player on the left and cut the player on top. Each target is only compared with the drops ranked at or above his number (#1 vs drop 1, #2 vs drops 1–2, and so on). Tap a cell to see who it moves in and out of your lineup. <span className={`${styles.cell} ${styles.t1}`}>+10 Do it</span> <span className={`${styles.cell} ${styles.t2}`}>+5 Worth it</span> <span className={`${styles.cell} ${styles.t3}`}>+2 Marginal</span> <span className={`${styles.cell} ${styles.t4}`}>Skip</span></div>
        <div className={styles.scroll}><table className={`${styles.table} ${styles.mx}`}><thead><tr><th>Add \\ Drop</th>{cols.map((d, ci) => <th key={d}>{ci + 1}. {last(info[d].name)}<span className={styles.sub}>{(costOf.get(d) ?? 0) < 0.05 ? "free" : `−${r1(costOf.get(d) ?? 0)}`}</span></th>)}</tr></thead><tbody>
          {ranked.map((r, i) => <tr key={r.id}><td><b>{i + 1}. {last(targetById.get(r.id)!.name)}</b></td>{cols.map((d, ci) => { if (ci > i) return <td key={d} className={styles.meta}>·</td>; const net = r.row.nets[d]; const on = focus?.add === r.id && focus?.drop === d; return <td key={d}><button className={`${styles.cell} ${styles.pick} ${tierClass(net)} ${r.best?.drop === d ? styles.best : ""}`} style={on ? { boxShadow: "0 0 0 2px #9fd2ff" } : undefined} onClick={() => setFocus({ add: r.id, drop: d })}>{sign(net)}</button></td>; })}</tr>)}
        </tbody></table></div>
        {focus && info[focus.add] && info[focus.drop] && <div style={{ marginTop: 10 }}>
          <div className={styles.meta} style={{ marginBottom: 4 }}><b>{info[focus.add].name}</b> in, <b>{info[focus.drop].name}</b> cut: who moves in and out of your starting lineup.</div>
          <div className={styles.scroll}><table className={styles.table}><thead><tr>{live.horizon.slice(0, weeks).map((w) => <th key={w}>Week {w}</th>)}</tr></thead><tbody><tr>{shiftRows(focus.add, focus.drop)}</tr></tbody></table></div>
        </div>}
      </section>

      <section className={shared.panel}>
        <h3 className={styles.h}>What each add replaces in your lineup</h3>
        <div className={styles.meta} style={{ marginBottom: 8 }}>Net is not Player A against Player B. Each swap re-sets your whole starting lineup, so it also counts whoever the new player pushes to the bench. Here is the best swap for each target (among the drops he is compared with) and the players actually moving in and out each week.</div>
        <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Add → Drop</th>{live.horizon.slice(0, weeks).map((w) => <th key={w}>Week {w}</th>)}</tr></thead><tbody>
          {ranked.filter((r) => r.best).map((r, i) => <tr key={r.id}><td style={{ whiteSpace: "nowrap" }}><b>{i + 1}. {targetById.get(r.id)!.name}</b><br /><span className={styles.meta}>for {info[r.best!.drop].name} · net {sign(r.best!.net)}</span></td>{shiftRows(r.id, r.best!.drop)}</tr>)}
        </tbody></table></div>
      </section>

      <section className={shared.panel}>
        <h3 className={styles.h}>Tiers</h3>
        {tiers.map((list, i) => list.length > 0 && <div key={i} className={styles.line}><span className={`${styles.cell} ${[styles.t1, styles.t2, styles.t3][i]}`}>Tier {i + 1} · {TIER_LABEL[i + 1]}</span> {list.map((r) => { const t = targetById.get(r.id)!; return `${t.name} for ${info[r.best!.drop].name} (${sign(r.best!.net)}, $${t.bid.p50}–$${t.bid.p90})`; }).join("  ·  ")}</div>)}
        {skipped.length > 0 && <div className={styles.meta} style={{ marginTop: 6 }}>Skip: {skipped.slice(0, 12).map((r) => `${last(targetById.get(r.id)!.name)} (${sign(r.net)})`).join(", ")}</div>}
      </section>

      <section className={shared.panel}>
        <h3 className={styles.h}>Claim sheet</h3>
        <div className={styles.row}>
          <button className={styles.btn} onClick={build} disabled={building}>{building ? "Building…" : "Build claim sheet"}</button>
          <label className={styles.meta}><input type="checkbox" checked={useTrade} onChange={(e) => setUseTrade(e.target.checked)} disabled={!offer} /> Also show it after the trade selected below{offer ? ` (${sel!.name} → $${after})` : ""}</label>
        </div>
        {sheets && <>
          <div className={styles.meta} style={{ margin: "10px 0 6px" }}>With ${sheets.budgetNow}: expected gain <b>+{r1(sheets.now.expected)}</b> · {pct(sheets.now.landAny)} chance to land at least one player.
            {sheets.after && <> After trading {sheets.sold} (${sheets.budgetAfter}): <b>+{r1(sheets.after.expected)}</b>, minus {sheets.loss} lineup points given up = <b>{sign(sheets.after.expected - sheets.loss - sheets.now.expected)}</b> net vs. no trade.</>}</div>
          <div className={styles.scroll}><table className={styles.table}><thead><tr><th>#</th><th>Add</th><th>Drop</th><th>Net</th><th>Bid</th>{sheets.after && <th>After trade</th>}<th>Chance it hits</th></tr></thead><tbody>
            {sheets.now.rows.map((r, i) => { const a = sheets.after?.rows.find((x) => x.add === r.add && x.drop === r.drop); return (
              <tr key={i} style={r.hit < 0.005 ? { opacity: 0.5 } : undefined}><td>{i + 1}</td><td>{info[r.add]?.name}</td><td>{info[r.drop]?.name}</td><td><span className={`${styles.cell} ${tierClass(r.net)}`}>{sign(r.net)}</span></td><td><b>${r.bid}</b></td>{sheets.after && <td>{a ? `$${a.bid}` : "—"}</td>}<td>{r.hit >= 0.005 ? pct(r.hit) : "<1%"}</td></tr>); })}
          </tbody></table></div>
          <div className={styles.meta} style={{ marginTop: 6 }}>Rows run in your target order (target 1, then target 2 against drops 1 and 2, and so on). A win uses up that row&apos;s drop and its bid, so later rows that need the same drop or more FAAB than is left fail. Only swaps worth +2 or more appear.</div>
        </>}
      </section>

      <section className={shared.panel}>
        <h3 className={styles.h}>Trade for FAAB</h3>
        <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Player</th><th>Lineup cost</th><th>Est. FAAB from</th><th /></tr></thead><tbody>
          {live.tradeIdeas.map((i) => <tr key={i.id}><td>{i.name} <span className={styles.meta}>{tag(i)}</span>{i.tier === 2 ? <span className={`${styles.badge} ${styles.good}`}>Elite</span> : i.tier === 1 ? <span className={styles.badge}>Star</span> : null}</td><td>{i.lineupLoss > 0 ? `−${i.lineupLoss}` : "None"}</td><td className={styles.meta}>{i.offers.length ? i.offers.slice(0, 3).map((o) => `${o.owner} ~$${o.faab}`).join(", ") : "No buyers"}</td><td>{i.offers.length > 0 && <button className={styles.btn} onClick={() => { setSellId(i.id); setBuyer(i.offers[0].owner); }}>Simulate</button>}</td></tr>)}
        </tbody></table></div>
        <div className={styles.row} style={{ marginTop: 12 }}>
          <label className={styles.meta}>Trade<br /><select className={styles.select} value={sellId} onChange={(e) => { setSellId(e.target.value); setBuyer(live.tradeIdeas.find((i) => i.id === e.target.value)?.offers[0]?.owner || ""); }}><option value="">Pick a player</option>{live.tradeIdeas.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.position})</option>)}</select></label>
          {sel && <label className={styles.meta}>To<br /><select className={styles.select} value={buyer} onChange={(e) => setBuyer(e.target.value)}>{sel.offers.length ? sel.offers.map((o) => <option key={o.owner}>{o.owner}</option>) : <option value="">No buyers</option>}</select></label>}
          {offer && <div className={styles.stat}><b>${faab} → ${after}</b><span>~${offer.faab} back · lineup −{sel!.lineupLoss}</span></div>}
        </div>
        {offer && <div className={styles.scroll} style={{ marginTop: 10 }}><table className={styles.table}><thead><tr><th>Target</th><th>Win % at ${faab}</th><th>At ${after}</th></tr></thead><tbody>
          {ranked.slice(0, 6).map((r) => { const t = targetById.get(r.id)!; return <tr key={t.id}><td>{t.name}</td><td>{pct(winAt(t.bid.curve, faab))}</td><td>{pct(winAt(t.bid.curve, after))}</td></tr>; })}
        </tbody></table></div>}
      </section>

      <section className={shared.panel}>
        <h3 className={styles.h}>Week {live.chop.week} chop watch</h3>
        {live.chop.result ? <div className={styles.meta}>Week {live.chop.week}: {live.chop.result.owner} was chopped. Their players are on the wire for Wednesday.</div> : <>
          <div className={styles.meta} style={{ marginBottom: 6 }}>Chance each team has the lowest Week {live.chop.week} score and is chopped (about midnight to 3am ET Tuesday).{live.chop.scoringPosted ? "" : " Scoring isn't posted yet, so treat as rough."}</div>
          <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Team</th><th>Chopped %</th><th>Wk {live.chop.week} pts</th><th>Left to play</th><th>Your best adds if chopped</th><th /></tr></thead><tbody>
            {live.chop.teams.map((t) => <tr key={t.owner}><td>{t.owner}</td><td>{t.chance}%</td><td>{t.pointsSoFar}</td><td>{t.projectedRemaining}</td><td className={styles.meta}>{t.best.filter((b) => b.gainForMe > 0).map((b) => `${b.name} +${b.gainForMe}`).join(", ") || "—"}</td><td><button className={styles.btn} onClick={() => setChop(t.owner)}>Test</button></td></tr>)}
          </tbody></table></div></>}
      </section>
      <div className={styles.foot}>Trade prices are estimates: ordinary starters are priced inside the range this league has actually seen (about $30–70); stars and elites (top few at RB, WR, TE, QB by projection) are priced off what each buyer would bid on waivers, scaled to his remaining FAAB, with no flat ceiling.</div>
      <div className={styles.foot}>Estimates only. Net = weighted lineup points over the next 3 weeks (week 1 counts most; weights 1.0 / 0.8 / 0.6). Prices come from this season&apos;s and last season&apos;s Guillotine Mania claims.</div>
    </div>
  );
}
