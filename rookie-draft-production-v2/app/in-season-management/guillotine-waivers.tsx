"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { dropPlan, winAt, type PlayerInfo } from "@/lib/in-season-guillotine";
import shared from "./in-season-management.module.css";
import styles from "./guillotine-waivers.module.css";

type Bid = { p50: number; p75: number; p90: number; winAtMax: number; mainRivals: { owner: string; gain: number; budget: number; typical: number }[]; curve: { bid: number; win: number }[] };
type Target = { id: string; name: string; position: string; team: string; age: number | null; injury: string; proj: number[]; byeWeeks: number[]; newlyReleased: boolean; gains: number[]; weightedGain: number; bid: Bid };
type Offer = { owner: string; theirGain: number; faab: number; theirBudget: number };
type Idea = { id: string; name: string; position: string; team: string; injury: string; lineupLoss: number; offers: Offer[]; topOffer: number };
type Data = {
  eliminated?: boolean; week: number; horizon: number[]; league: { id: string; name: string; slots: string[] };
  me: { faab: number; waiverPosition: number; roster: PlayerInfo[] };
  chop: { week: number; scoringPosted: boolean; result: { owner: string } | null; teams: { owner: string; chance: number; pointsSoFar: number; projectedRemaining: number; best: { name: string; position: string; gainForMe: number }[] }[] };
  simulatedChop: { owner: string; released: number } | null; owners: string[]; targets: Target[]; tradeIdeas: Idea[];
};
type LeagueTab = { id: string; name: string; eliminated: boolean };
const pct = (v: number) => `${Math.round(v * 100)}%`;
const tag = (p: { position: string; team: string; injury?: string }) => `${p.position} · ${p.team}${p.injury ? ` · ${p.injury}` : ""}`;

export default function GuillotineWaivers() {
  const [leagues, setLeagues] = useState<LeagueTab[]>([]);
  const [leagueId, setLeagueId] = useState("");
  const [chop, setChop] = useState<string>(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("chop") || ""));
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState("");
  const [picked, setPicked] = useState<Record<string, boolean> | null>(null);
  const [sellId, setSellId] = useState("");
  const [buyer, setBuyer] = useState("");

  useEffect(() => {
    fetch("/api/in-season/guillotine-waivers?list=1", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      const list: LeagueTab[] = j.leagues || [];
      setLeagues(list); setLeagueId((list.find((l) => !l.eliminated) || list[0])?.id || "");
    }).catch((e) => setError(e.message || "Could not load leagues."));
  }, []);

  const load = useCallback(async (id: string, owner: string) => {
    setError(""); setData(null); setPicked(null);
    try {
      const qs = new URLSearchParams({ league: id }); if (owner) qs.set("chop", owner);
      const r = await fetch(`/api/in-season/guillotine-waivers?${qs}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e: any) { setError(e.message || "Could not load."); }
  }, []);
  useEffect(() => { if (leagueId) load(leagueId, chop); }, [leagueId, chop, load]);

  const targets = useMemo(() => (data?.targets || []).slice(0, 12), [data]);
  const selected = useMemo(() => targets.filter((t) => (picked ? picked[t.id] : targets.indexOf(t) < 4)), [targets, picked]);
  const plan = useMemo(() => {
    if (!data || data.eliminated) return [];
    const info: Record<string, PlayerInfo> = {};
    data.me.roster.forEach((p) => { info[p.id] = p; });
    selected.forEach((t) => { info[t.id] = { id: t.id, name: t.name, position: t.position, team: t.team, injury: t.injury, age: t.age, proj: t.proj, byeWeeks: t.byeWeeks }; });
    return dropPlan(data.league.slots, data.me.roster.map((p) => p.id), info, selected.map((t) => t.id)).map((step) => ({ ...step, addP: info[step.add], dropP: step.drop ? info[step.drop] : null }));
  }, [data, selected]);

  const tabs = (
    <div className={styles.tabs}>
      {leagues.map((l) => <button key={l.id} className={`${styles.tab} ${l.id === leagueId ? styles.tabOn : ""}`} onClick={() => { setLeagueId(l.id); setChop(""); }}>{l.name}{l.eliminated ? " · Eliminated" : ""}</button>)}
    </div>
  );
  const hero = <div className={shared.moduleHero}><div><div className={shared.sectionKicker}>In-season</div><h2>Guillotine</h2></div></div>;

  if (error) return <div className={styles.wrap}>{hero}{tabs}<div className={styles.banner}>Failed to load: {error}</div></div>;
  if (!data) return <div className={styles.wrap}>{hero}{tabs}<div className={styles.banner}>Loading…</div></div>;
  if (data.eliminated) return <div className={styles.wrap}>{hero}{tabs}<section className={`${shared.panel} ${styles.out}`}><h2>You&apos;re eliminated</h2><div className={styles.meta}>{data.league.name} · see you next year.</div></section></div>;

  const faab = data.me.faab;
  const sel = data.tradeIdeas.find((i) => i.id === sellId) || null;
  const offer = sel?.offers.find((o) => o.owner === buyer) || null;
  const after = faab + (offer?.faab || 0);
  const verdict = (t: Target): [string, string] => (t.bid.p75 <= faab ? ["Affordable", styles.good] : t.bid.p50 <= faab ? ["Stretch", styles.warn] : ["Too expensive", styles.bad]);

  return (
    <div className={styles.wrap}>
      {hero}{tabs}
      {data.simulatedChop && <div className={styles.banner}>Test: {data.simulatedChop.owner} assumed chopped ({data.simulatedChop.released} players released).</div>}

      <div className={styles.row}>
        <div className={styles.stat}><b>${faab}</b><span>FAAB left</span></div>
        <div className={styles.stat}><b>#{data.me.waiverPosition}</b><span>Priority</span></div>
        <label className={styles.meta}>Assume chopped<br /><select className={styles.select} value={chop} onChange={(e) => setChop(e.target.value)}><option value="">None (live)</option>{data.owners.map((o) => <option key={o}>{o}</option>)}</select></label>
      </div>

      <section className={shared.panel}>
        <h3 className={styles.h}>Targets</h3>
        <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Claim</th><th>#</th><th>Player</th><th>Gain</th><th>Bid 50/75/90%</th><th>Win @ ${faab}</th><th /></tr></thead><tbody>
          {targets.map((t, i) => { const [label, cls] = verdict(t); const on = selected.some((s) => s.id === t.id); return (
            <Fragment key={t.id}>
              <tr>
                <td><input type="checkbox" checked={on} onChange={() => setPicked({ ...Object.fromEntries(targets.map((x) => [x.id, selected.some((s) => s.id === x.id)])), [t.id]: !on })} /></td>
                <td>{i + 1}</td>
                <td><b>{t.name}</b> <span className={styles.meta}>{tag(t)}</span><br />
                  <span className={`${styles.badge} ${cls}`} style={{ marginLeft: 0 }}>{label}</span>{t.newlyReleased && <span className={`${styles.badge} ${styles.good}`}>New</span>}{t.byeWeeks.length > 0 && <span className={`${styles.badge} ${styles.warn}`}>Bye {t.byeWeeks.join(",")}</span>}</td>
                <td>+{t.weightedGain}</td>
                <td>${t.bid.p50} / ${t.bid.p75} / ${t.bid.p90}</td>
                <td>{pct(t.bid.winAtMax)}</td>
                <td><button className={styles.link} onClick={() => setOpen(open === t.id ? "" : t.id)}>{open === t.id ? "Less" : "More"}</button></td>
              </tr>
              {open === t.id && <tr className={styles.detail}><td colSpan={2} /><td colSpan={5}>
                Proj {t.proj.map((p, k) => `Wk${data.horizon[k]} ${p}`).join(" · ")} · Lineup {t.gains.map((g, k) => `Wk${data.horizon[k]} ${g > 0 ? "+" : ""}${g}`).join(" · ")}
                {t.bid.mainRivals.length > 0 && <><br />Competition: {t.bid.mainRivals.map((r) => `${r.owner} ($${r.budget})`).join(", ")}</>}
              </td></tr>}
            </Fragment>); })}
          {!targets.length && <tr><td colSpan={7} className={styles.meta}>No available player improves your lineup.</td></tr>}
        </tbody></table></div>
      </section>

      <section className={shared.panel}>
        <h3 className={styles.h}>Drops</h3>
        <div className={styles.meta} style={{ marginBottom: 6 }}>For the checked claims, in order, assuming you win all of them.</div>
        <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Win</th><th>Add</th><th>Drop</th><th>Lineup change</th></tr></thead><tbody>
          {plan.map((s, i) => <tr key={s.add}><td>#{i + 1}</td><td>{s.addP.name} <span className={styles.meta}>{tag(s.addP)}</span></td><td>{s.dropP ? <>{s.dropP.name} <span className={styles.meta}>{tag(s.dropP)}</span></> : "—"}</td><td>{s.change >= 0 ? "+" : ""}{Math.round(s.change * 10) / 10}</td></tr>)}
          {!plan.length && <tr><td colSpan={4} className={styles.meta}>Check claims above.</td></tr>}
        </tbody></table></div>
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
        {offer && <div className={styles.scroll} style={{ marginTop: 10 }}><table className={styles.table}><thead><tr><th>Target</th><th>Win % now</th><th>After trade</th></tr></thead><tbody>
          {targets.slice(0, 6).map((t) => <tr key={t.id}><td>{t.name}</td><td>{pct(winAt(t.bid.curve, faab - 0.5))}</td><td>{pct(winAt(t.bid.curve, after - 0.5))}</td></tr>)}
        </tbody></table></div>}
      </section>

      <section className={shared.panel}>
        <h3 className={styles.h}>Week {data.chop.week} chop watch</h3>
        {data.chop.result ? <div className={styles.meta}>Week {data.chop.week}: {data.chop.result.owner} was chopped. Their players are on the wire for Wednesday.</div> : <>
        <div className={styles.meta} style={{ marginBottom: 6 }}>Chance each team has the lowest Week {data.chop.week} score and is chopped (~3am ET Tuesday).{data.chop.scoringPosted ? "" : " Scoring isn't posted yet, so treat as rough."}</div>
        <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Team</th><th>Chopped %</th><th>Wk {data.chop.week} pts</th><th>Left to play</th><th>Your best adds if chopped</th><th /></tr></thead><tbody>
          {data.chop.teams.map((t) => <tr key={t.owner}><td>{t.owner}</td><td>{t.chance}%</td><td>{t.pointsSoFar}</td><td>{t.projectedRemaining}</td><td className={styles.meta}>{t.best.filter((b) => b.gainForMe > 0).map((b) => `${b.name} +${b.gainForMe}`).join(", ") || "—"}</td><td><button className={styles.btn} onClick={() => setChop(t.owner)}>Test</button></td></tr>)}
        </tbody></table></div></>}
      </section>
      <div className={styles.foot}>Estimates only. Gain = weighted lineup points over the next 3 weeks. Bid prices come from this season&apos;s and last season&apos;s Guillotine Mania claims.</div>
    </div>
  );
}
