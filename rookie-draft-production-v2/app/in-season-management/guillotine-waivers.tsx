"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { buildClaimSheet, winAt, type ClaimSheet, type PlayerInfo } from "@/lib/in-season-guillotine";
import shared from "./in-season-management.module.css";
import styles from "./guillotine-waivers.module.css";

type Bid = { p50: number; p75: number; p90: number; mainRivals: { owner: string; gain: number; budget: number; typical: number }[]; curve: { bid: number; win: number }[] };
type Target = { id: string; name: string; position: string; team: string; age: number | null; injury: string; proj: number[]; byeWeeks: number[]; newlyReleased: boolean; gains: number[]; weightedGain: number; bid: Bid; rivalsInterested: number };
type Offer = { owner: string; theirGain: number; faab: number; theirBudget: number };
type Idea = { id: string; name: string; position: string; team: string; injury: string; lineupLoss: number; offers: Offer[]; topOffer: number };
type Data = {
  eliminated?: boolean; week: number; horizon: number[]; league: { id: string; name: string; slots: string[] };
  me: { faab: number; waiverPosition: number; roster: PlayerInfo[] };
  faab: { teams: number; top: { owner: string; faab: number }; second: { owner: string; faab: number } | null; leadOverSecond: number; leadOverAverage: number; average: number; lowest: { owner: string; faab: number }; mine: number; mineRank: number };
  chop: { week: number; scoringPosted: boolean; result: { owner: string } | null; teams: { owner: string; chance: number; pointsSoFar: number; projectedRemaining: number; best: { name: string; position: string; gainForMe: number }[] }[] };
  simulatedChop: { owner: string; released: number } | null; owners: string[]; targets: Target[]; tradeIdeas: Idea[];
  wanted: { query: string; id: string | null }[]; dropOrder: string[];
};
type LeagueTab = { id: string; name: string; eliminated: boolean };
const pct = (v: number) => `${Math.round(v * 100)}%`;
const tag = (p: { position: string; team: string; injury?: string }) => `${p.position} · ${p.team}${p.injury ? ` · ${p.injury}` : ""}`;
const lines = (text: string) => text.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

export default function GuillotineWaivers() {
  const [leagues, setLeagues] = useState<LeagueTab[]>([]);
  const [leagueId, setLeagueId] = useState("");
  const [chop, setChop] = useState<string>(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("chop") || ""));
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState("");
  const [wantText, setWantText] = useState("");
  const [dropText, setDropText] = useState("");
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

  const load = useCallback(async (id: string, owner: string, want: string[], drops: string[], keepText: boolean) => {
    setError(""); setSheets(null);
    try {
      const qs = new URLSearchParams({ league: id });
      if (owner) qs.set("chop", owner);
      if (want.length) qs.set("want", want.join(","));
      if (drops.length) qs.set("drops", drops.join(","));
      const r = await fetch(`/api/in-season/guillotine-waivers?${qs}`, { cache: "no-store" });
      const j: Data = await r.json();
      if (!r.ok || (j as any).error) throw new Error((j as any).error || `HTTP ${r.status}`);
      setData(j);
      if (!keepText && !j.eliminated) {
        const byId = new Map(j.me.roster.map((p) => [p.id, p.name]));
        setWantText(j.targets.slice(0, 6).map((t) => t.name).join("\n"));
        setDropText(j.dropOrder.map((id) => byId.get(id) || "").filter(Boolean).join("\n"));
      }
    } catch (e: any) { setError(e.message || "Could not load."); }
  }, []);
  useEffect(() => { if (leagueId) { setData(null); load(leagueId, chop, [], [], false); } }, [leagueId, chop, load]);

  const faab = data && !data.eliminated ? data.me.faab : 0;
  const sel = data?.tradeIdeas?.find((i) => i.id === sellId) || null;
  const offer = sel?.offers.find((o) => o.owner === buyer) || null;
  const after = faab + (offer?.faab || 0);
  const byId = useMemo(() => new Map((data?.me?.roster || []).map((p) => [p.id, p])), [data]);
  const targets = useMemo(() => (data?.targets || []).slice(0, 14), [data]);
  const targetById = useMemo(() => new Map((data?.targets || []).map((t) => [t.id, t])), [data]);

  const build = () => {
    if (!data || data.eliminated) return;
    setBuilding(true);
    setTimeout(() => {
      const info: Record<string, PlayerInfo> = {};
      data.me.roster.forEach((p) => { info[p.id] = p; });
      data.targets.forEach((t) => { info[t.id] = { id: t.id, name: t.name, position: t.position, team: t.team, injury: t.injury, age: t.age, proj: t.proj, byeWeeks: t.byeWeeks }; });
      const wantIds = data.wanted.map((w) => w.id).filter(Boolean) as string[];
      const list = (wantIds.length ? wantIds : data.targets.slice(0, 6).map((t) => t.id)).filter((id, i, a) => a.indexOf(id) === i);
      const sheetTargets = list.map((id) => targetById.get(id)).filter(Boolean).map((t) => ({ id: t!.id, curve: t!.bid.curve, p50: t!.bid.p50, p75: t!.bid.p75, p90: t!.bid.p90 }));
      const rosterIds = data.me.roster.map((p) => p.id);
      const run = (budget: number, roster: string[]) => buildClaimSheet({ slots: data.league.slots, roster, info, targets: sheetTargets, drops: data.dropOrder.filter((id) => roster.includes(id)), budget });
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
  if (data.eliminated) return <div className={styles.wrap}>{hero}{tabs}<section className={`${shared.panel} ${styles.out}`}><h2>You&apos;re eliminated</h2><div className={styles.meta}>{data.league.name} · see you next year.</div></section></div>;

  const f = data.faab;
  const missing = data.wanted.filter((w) => !w.id).map((w) => w.query);

  return (
    <div className={styles.wrap}>
      {hero}{tabs}
      {data.simulatedChop && <div className={styles.banner}>Test: {data.simulatedChop.owner} assumed chopped ({data.simulatedChop.released} players released).</div>}

      <div className={styles.row}>
        <div className={styles.stat}><b>${faab}</b><span>Your FAAB</span></div>
        <div className={styles.stat}><b>#{data.me.waiverPosition}</b><span>Priority</span></div>
        <label className={styles.meta}>Assume chopped<br /><select className={styles.select} value={chop} onChange={(e) => setChop(e.target.value)}><option value="">None (live)</option>{data.owners.map((o) => <option key={o}>{o}</option>)}</select></label>
      </div>

      <section className={shared.panel}>
        <h3 className={styles.h}>FAAB across the league</h3>
        <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Most FAAB</th><th>Lead over #2</th><th>Lead over avg of others</th><th>League average</th><th>Least FAAB</th><th>You</th></tr></thead><tbody><tr>
          <td><b>${f.top.faab}</b> <span className={styles.meta}>{f.top.owner}</span></td>
          <td>{f.second ? <>+${f.leadOverSecond} <span className={styles.meta}>vs {f.second.owner} ${f.second.faab}</span></> : "—"}</td>
          <td>+${f.leadOverAverage}</td>
          <td>${f.average}</td>
          <td><b>${f.lowest.faab}</b> <span className={styles.meta}>{f.lowest.owner}</span></td>
          <td>#{f.mineRank} of {f.teams}</td>
        </tr></tbody></table></div>
      </section>

      <section className={shared.panel}>
        <h3 className={styles.h}>Targets</h3>
        <div className={styles.scroll}><table className={styles.table}><thead><tr><th>#</th><th>Player</th><th>Gain</th><th>Bid 50 / 75 / 90%</th><th>Rivals</th><th /></tr></thead><tbody>
          {targets.map((t, i) => (
            <Fragment key={t.id}>
              <tr>
                <td>{i + 1}</td>
                <td><b>{t.name}</b> <span className={styles.meta}>{tag(t)}</span>{t.newlyReleased && <span className={`${styles.badge} ${styles.good}`}>New</span>}{t.byeWeeks.length > 0 && <span className={`${styles.badge} ${styles.warn}`}>Bye {t.byeWeeks.join(",")}</span>}</td>
                <td>+{t.weightedGain}</td>
                <td>${t.bid.p50} / ${t.bid.p75} / ${t.bid.p90}</td>
                <td>{t.rivalsInterested}</td>
                <td><button className={styles.link} onClick={() => setOpen(open === t.id ? "" : t.id)}>{open === t.id ? "Less" : "More"}</button></td>
              </tr>
              {open === t.id && <tr className={styles.detail}><td /><td colSpan={5}>
                Proj {t.proj.map((p, k) => `Wk${data.horizon[k]} ${p}`).join(" · ")} · Lineup {t.gains.map((g, k) => `Wk${data.horizon[k]} ${g > 0 ? "+" : ""}${g}`).join(" · ")}
                {t.bid.mainRivals.length > 0 && <><br />Competition: {t.bid.mainRivals.map((r) => `${r.owner} ($${r.budget})`).join(", ")}</>}
              </td></tr>}
            </Fragment>))}
          {!targets.length && <tr><td colSpan={6} className={styles.meta}>No available player improves your lineup.</td></tr>}
        </tbody></table></div>
      </section>

      <section className={shared.panel}>
        <h3 className={styles.h}>Your lists</h3>
        <div className={styles.row} style={{ alignItems: "flex-start" }}>
          <label className={styles.meta}>Players I want (priority order)<br /><textarea className={styles.select} rows={9} cols={22} value={wantText} onChange={(e) => setWantText(e.target.value)} /></label>
          <label className={styles.meta}>Drops (priority order)<br /><textarea className={styles.select} rows={9} cols={22} value={dropText} onChange={(e) => setDropText(e.target.value)} /></label>
          <div><button className={styles.btn} onClick={() => load(leagueId, chop, lines(wantText), lines(dropText), true)}>Apply lists</button>
            {missing.length > 0 && <div className={styles.meta} style={{ marginTop: 8 }}>Not on the wire: {missing.join(", ")}</div>}</div>
        </div>
        <div className={styles.meta} style={{ marginTop: 8 }}>Drop order: {data.dropOrder.map((id, i) => { const p = byId.get(id); return p ? `${i + 1}. ${p.name} (${p.position}${p.injury ? `, ${p.injury}` : ""})` : ""; }).filter(Boolean).join("  ·  ") || "—"}</div>
        <div className={styles.meta}>Your roster is full, so every claim needs a drop or it fails.</div>
      </section>

      <section className={shared.panel}>
        <h3 className={styles.h}>Claim sheet</h3>
        <div className={styles.row}>
          <button className={styles.btn} onClick={build} disabled={building}>{building ? "Building…" : "Build claim sheet"}</button>
          <label className={styles.meta}><input type="checkbox" checked={useTrade} onChange={(e) => setUseTrade(e.target.checked)} disabled={!offer} /> Also show it after the trade selected below{offer ? ` (${sel!.name} → $${after})` : ""}</label>
        </div>
        {sheets && <>
          <div className={styles.meta} style={{ margin: "10px 0 6px" }}>With ${sheets.budgetNow}: expected gain <b>+{Math.round(sheets.now.expected * 10) / 10}</b> · {pct(sheets.now.landAny)} chance to land at least one player.
            {sheets.after && <> After trading {sheets.sold} (${sheets.budgetAfter}): <b>+{Math.round(sheets.after.expected * 10) / 10}</b>, minus {sheets.loss} lineup points given up = <b>{Math.round((sheets.after.expected - sheets.loss - sheets.now.expected) * 10) / 10 >= 0 ? "+" : ""}{Math.round((sheets.after.expected - sheets.loss - sheets.now.expected) * 10) / 10}</b> net vs. no trade.</>}</div>
          <div className={styles.scroll}><table className={styles.table}><thead><tr><th>#</th><th>Add</th><th>Drop</th><th>Bid</th>{sheets.after && <th>Bid after trade</th>}<th>Chance it hits</th></tr></thead><tbody>
            {sheets.now.rows.map((r, i) => { const t = targetById.get(r.add); const d = byId.get(r.drop); const a = sheets.after?.rows[i]; return (
              <tr key={i} style={r.hit === 0 && r.bid === 1 ? { opacity: 0.55 } : undefined}><td>{i + 1}</td><td>{t?.name}</td><td>{d?.name}</td><td><b>${r.bid}</b></td>{sheets.after && <td>{a ? `$${a.bid}` : "—"}</td>}<td>{r.hit >= 0.005 ? pct(r.hit) : "<1%"}</td></tr>); })}
          </tbody></table></div>
          <div className={styles.meta} style={{ marginTop: 6 }}>Rows run top to bottom. A win uses up that row&apos;s drop and its bid, so later rows that need the same drop or more FAAB than is left fail.</div>
        </>}
      </section>

      <section className={shared.panel}>
        <h3 className={styles.h}>Trade for FAAB</h3>
        <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Player</th><th>Lineup cost</th><th>Est. FAAB from</th><th /></tr></thead><tbody>
          {data.tradeIdeas.map((i) => <tr key={i.id}><td>{i.name} <span className={styles.meta}>{tag(i)}</span></td><td>{i.lineupLoss > 0 ? `−${i.lineupLoss}` : "None"}</td><td className={styles.meta}>{i.offers.length ? i.offers.slice(0, 3).map((o) => `${o.owner} ~$${o.faab}`).join(", ") : "No buyers"}</td><td>{i.offers.length > 0 && <button className={styles.btn} onClick={() => { setSellId(i.id); setBuyer(i.offers[0].owner); }}>Simulate</button>}</td></tr>)}
        </tbody></table></div>
        <div className={styles.row} style={{ marginTop: 12 }}>
          <label className={styles.meta}>Trade<br /><select className={styles.select} value={sellId} onChange={(e) => { setSellId(e.target.value); setBuyer(data.tradeIdeas.find((i) => i.id === e.target.value)?.offers[0]?.owner || ""); }}><option value="">Pick a player</option>{data.tradeIdeas.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.position})</option>)}</select></label>
          {sel && <label className={styles.meta}>To<br /><select className={styles.select} value={buyer} onChange={(e) => setBuyer(e.target.value)}>{sel.offers.length ? sel.offers.map((o) => <option key={o.owner}>{o.owner}</option>) : <option value="">No buyers</option>}</select></label>}
          {offer && <div className={styles.stat}><b>${faab} → ${after}</b><span>~${offer.faab} back · lineup −{sel!.lineupLoss}</span></div>}
        </div>
        {offer && <div className={styles.scroll} style={{ marginTop: 10 }}><table className={styles.table}><thead><tr><th>Target</th><th>Win % at ${faab}</th><th>At ${after}</th></tr></thead><tbody>
          {targets.slice(0, 6).map((t) => <tr key={t.id}><td>{t.name}</td><td>{pct(winAt(t.bid.curve, faab))}</td><td>{pct(winAt(t.bid.curve, after))}</td></tr>)}
        </tbody></table></div>}
      </section>

      <section className={shared.panel}>
        <h3 className={styles.h}>Week {data.chop.week} chop watch</h3>
        {data.chop.result ? <div className={styles.meta}>Week {data.chop.week}: {data.chop.result.owner} was chopped. Their players are on the wire for Wednesday.</div> : <>
          <div className={styles.meta} style={{ marginBottom: 6 }}>Chance each team has the lowest Week {data.chop.week} score and is chopped (~midnight to 3am ET Tuesday).{data.chop.scoringPosted ? "" : " Scoring isn't posted yet, so treat as rough."}</div>
          <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Team</th><th>Chopped %</th><th>Wk {data.chop.week} pts</th><th>Left to play</th><th>Your best adds if chopped</th><th /></tr></thead><tbody>
            {data.chop.teams.map((t) => <tr key={t.owner}><td>{t.owner}</td><td>{t.chance}%</td><td>{t.pointsSoFar}</td><td>{t.projectedRemaining}</td><td className={styles.meta}>{t.best.filter((b) => b.gainForMe > 0).map((b) => `${b.name} +${b.gainForMe}`).join(", ") || "—"}</td><td><button className={styles.btn} onClick={() => setChop(t.owner)}>Test</button></td></tr>)}
          </tbody></table></div></>}
      </section>
      <div className={styles.foot}>Estimates only. Gain = weighted lineup points over the next 3 weeks. Prices come from this season&apos;s and last season&apos;s Guillotine Mania claims.</div>
    </div>
  );
}
