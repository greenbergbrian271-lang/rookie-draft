"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TIER_LABEL, buildClaimSheet, buildMatrix, claimPairs, tierOf, winAt, type ClaimSheet, type PlayerInfo } from "@/lib/in-season-guillotine";
import shared from "./in-season-management.module.css";
import styles from "./guillotine-waivers.module.css";

type Bid = { p50: number; p75: number; p90: number; mainRivals: { owner: string; gain: number; budget: number; typical: number }[]; curve: { bid: number; win: number }[] };
type Target = { id: string; name: string; position: string; team: string; age: number | null; injury: string; proj: number[]; byeWeeks: number[]; nextBye?: number | null; newlyReleased: boolean; gains: number[]; weightedGain: number; bid: Bid; rivalsInterested: number };
type Offer = { owner: string; theirGain: number; faab: number; theirBudget: number };
type Idea = { id: string; name: string; position: string; team: string; injury: string; lineupLoss: number; offers: Offer[]; topOffer: number };
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
const last = (name: string) => name.split(" ").slice(-1)[0];
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
  const rows = useMemo(() => (matrix?.rows || []).filter((r) => (r.best?.net ?? -9) >= 2).slice(0, 12), [matrix]);
  const cols = useMemo(() => (matrix?.drops || []).slice(0, 8), [matrix]);

  const build = () => {
    if (!live || !matrix) return;
    setBuilding(true);
    setTimeout(() => {
      const run = (budget: number, roster: string[]) => {
        const mx = buildMatrix(live.league.slots, roster, info, live.targets.map((t) => t.id));
        const keep = mx.rows.filter((r) => (r.best?.net ?? -9) >= 2).slice(0, 12);
        const tg = keep.map((r) => targetById.get(r.id)!).map((t) => ({ id: t.id, curve: t.bid.curve, p50: t.bid.p50, p75: t.bid.p75, p90: t.bid.p90 }));
        return buildClaimSheet({ slots: live.league.slots, roster, info, targets: tg, pairs: claimPairs({ ...mx, rows: keep }), budget });
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
  const tiers = [1, 2, 3].map((t) => rows.filter((r) => tierOf(r.best!.net) === t));

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
          <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Player</th><th>Best swap</th><th>Net</th><th>Bid 50 / 75 / 90%</th></tr></thead><tbody>
            {rows.map((r) => { const t = targetById.get(r.id)!; const d = info[r.best!.drop]; return (
              <tr key={r.id}>
                <td><b>{t.name}</b><br /><span className={styles.meta}>{tag(t)}{t.byeWeeks.length ? ` · bye wk ${t.byeWeeks.join(",")}` : ""}</span>{t.newlyReleased && <span className={`${styles.badge} ${styles.good}`}>New</span>}</td>
                <td>{d?.name}</td>
                <td><span className={`${styles.cell} ${tierClass(r.best!.net)}`}>{sign(r.best!.net)}</span></td>
                <td>${t.bid.p50} / ${t.bid.p75} / ${t.bid.p90}</td>
              </tr>); })}
            {!rows.length && <tr><td colSpan={4} className={styles.meta}>No available swap improves your lineup by 2 or more points.</td></tr>}
          </tbody></table></div>
        </section>

        <section className={shared.panel}>
          <h3 className={styles.h}>Drops (cheapest first)</h3>
          <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Player</th><th>Costs you</th></tr></thead><tbody>
            {matrix.drops.slice(0, 10).map((d) => { const p = info[d.id]; return (
              <tr key={d.id}><td><b>{p.name}</b> <span className={styles.meta}>{tag(p)}</span><br /><span className={styles.meta}>{dropNote(p, d.cost, rosterInfo)}</span></td><td>{d.cost < 0.05 ? "0" : `−${r1(d.cost)}`}</td></tr>); })}
          </tbody></table></div>
        </section>
      </div>

      <section className={shared.panel}>
        <h3 className={styles.h}>Add / drop matrix</h3>
        <div className={styles.meta} style={{ marginBottom: 8 }}>Net lineup points over the next 3 weeks if you add the player on the left and cut the player on top. <span className={`${styles.cell} ${styles.t1}`}>+10 Do it</span> <span className={`${styles.cell} ${styles.t2}`}>+5 Worth it</span> <span className={`${styles.cell} ${styles.t3}`}>+2 Marginal</span> <span className={`${styles.cell} ${styles.t4}`}>Skip</span></div>
        <div className={styles.scroll}><table className={`${styles.table} ${styles.mx}`}><thead><tr><th>Add \ Drop</th>{cols.map((d) => <th key={d.id}>{last(info[d.id].name)}<span className={styles.sub}>{d.cost < 0.05 ? "free" : `−${r1(d.cost)}`}</span></th>)}</tr></thead><tbody>
          {rows.map((r) => <tr key={r.id}><td><b>{last(targetById.get(r.id)!.name)}</b></td>{cols.map((d) => { const net = r.nets[d.id]; return <td key={d.id}><span className={`${styles.cell} ${tierClass(net)} ${r.best?.drop === d.id ? styles.best : ""}`}>{sign(net)}</span></td>; })}</tr>)}
        </tbody></table></div>
      </section>

      <section className={shared.panel}>
        <h3 className={styles.h}>Tiers</h3>
        {tiers.map((list, i) => list.length > 0 && <div key={i} className={styles.line}><span className={`${styles.cell} ${[styles.t1, styles.t2, styles.t3][i]}`}>Tier {i + 1} · {TIER_LABEL[i + 1]}</span> {list.map((r) => { const t = targetById.get(r.id)!; return `${t.name} for ${info[r.best!.drop].name} (${sign(r.best!.net)}, $${t.bid.p50}–$${t.bid.p90})`; }).join("  ·  ")}</div>)}
        {(matrix.rows.length - rows.length) > 0 && <div className={styles.meta} style={{ marginTop: 6 }}>Skip: {matrix.rows.filter((r) => !rows.includes(r)).slice(0, 12).map((r) => `${last(targetById.get(r.id)!.name)} (${sign(r.best?.net ?? 0)})`).join(", ")}</div>}
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
          <div className={styles.meta} style={{ marginTop: 6 }}>Rows run top to bottom. A win uses up that row&apos;s drop and its bid, so later rows that need the same drop or more FAAB than is left fail. Only swaps worth +2 or more appear.</div>
        </>}
      </section>

      <section className={shared.panel}>
        <h3 className={styles.h}>Trade for FAAB</h3>
        <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Player</th><th>Lineup cost</th><th>Est. FAAB from</th><th /></tr></thead><tbody>
          {live.tradeIdeas.map((i) => <tr key={i.id}><td>{i.name} <span className={styles.meta}>{tag(i)}</span></td><td>{i.lineupLoss > 0 ? `−${i.lineupLoss}` : "None"}</td><td className={styles.meta}>{i.offers.length ? i.offers.slice(0, 3).map((o) => `${o.owner} ~$${o.faab}`).join(", ") : "No buyers"}</td><td>{i.offers.length > 0 && <button className={styles.btn} onClick={() => { setSellId(i.id); setBuyer(i.offers[0].owner); }}>Simulate</button>}</td></tr>)}
        </tbody></table></div>
        <div className={styles.row} style={{ marginTop: 12 }}>
          <label className={styles.meta}>Trade<br /><select className={styles.select} value={sellId} onChange={(e) => { setSellId(e.target.value); setBuyer(live.tradeIdeas.find((i) => i.id === e.target.value)?.offers[0]?.owner || ""); }}><option value="">Pick a player</option>{live.tradeIdeas.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.position})</option>)}</select></label>
          {sel && <label className={styles.meta}>To<br /><select className={styles.select} value={buyer} onChange={(e) => setBuyer(e.target.value)}>{sel.offers.length ? sel.offers.map((o) => <option key={o.owner}>{o.owner}</option>) : <option value="">No buyers</option>}</select></label>}
          {offer && <div className={styles.stat}><b>${faab} → ${after}</b><span>~${offer.faab} back · lineup −{sel!.lineupLoss}</span></div>}
        </div>
        {offer && <div className={styles.scroll} style={{ marginTop: 10 }}><table className={styles.table}><thead><tr><th>Target</th><th>Win % at ${faab}</th><th>At ${after}</th></tr></thead><tbody>
          {rows.slice(0, 6).map((r) => { const t = targetById.get(r.id)!; return <tr key={t.id}><td>{t.name}</td><td>{pct(winAt(t.bid.curve, faab))}</td><td>{pct(winAt(t.bid.curve, after))}</td></tr>; })}
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
      <div className={styles.foot}>Estimates only. Net = weighted lineup points over the next 3 weeks (week 1 counts most). Prices come from this season&apos;s and last season&apos;s Guillotine Mania claims.</div>
    </div>
  );
}
