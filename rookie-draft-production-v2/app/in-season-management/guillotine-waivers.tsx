"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { winAt } from "@/lib/in-season-guillotine";
import shared from "./in-season-management.module.css";
import styles from "./guillotine-waivers.module.css";

type Bid = { p50: number; p75: number; p90: number; winAtMax: number; mainRivals: { owner: string; gain: number; budget: number; typical: number }[]; curve: { bid: number; win: number }[] };
type Target = { id: string; name: string; position: string; team: string; injury: string; proj: number[]; byeWeeks: number[]; newlyReleased: boolean; gains: number[]; weightedGain: number; drop: { name: string; position: string; team: string; injury: string } | null; bid: Bid };
type Offer = { owner: string; theirGain: number; faab: number; theirBudget: number };
type Idea = { id: string; name: string; position: string; team: string; lineupLoss: number; offers: Offer[]; topOffer: number };
type Data = {
  horizon: number[]; me: { faab: number; waiverPosition: number };
  chopPreview: { teams: { owner: string; chance: number; best: { name: string; position: string; gainForMe: number }[] }[] };
  simulatedChop: { owner: string; released: number } | null; owners: string[]; targets: Target[]; tradeIdeas: Idea[];
};
const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function GuillotineWaivers() {
  const [chop, setChop] = useState<string>(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("chop") || ""));
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState("");
  const [sellId, setSellId] = useState("");
  const [buyer, setBuyer] = useState("");

  const load = useCallback(async (owner: string) => {
    setError("");
    try {
      const r = await fetch(`/api/in-season/guillotine-waivers${owner ? `?chop=${encodeURIComponent(owner)}` : ""}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e: any) { setError(e.message || "Could not load."); }
  }, []);
  useEffect(() => { load(chop); }, [chop, load]);

  if (error) return <div className={styles.banner}>Failed to load: {error}</div>;
  if (!data) return <div className={styles.banner}>Loading…</div>;
  const faab = data.me.faab;
  const sel = data.tradeIdeas.find((i) => i.id === sellId) || null;
  const offer = sel?.offers.find((o) => o.owner === buyer) || null;
  const after = faab + (offer?.faab || 0);
  const verdict = (t: Target): [string, string] => (t.bid.p75 <= faab ? ["Affordable", styles.good] : t.bid.p50 <= faab ? ["Stretch", styles.warn] : ["Too expensive", styles.bad]);
  const targets = data.targets.slice(0, 12);

  return (
    <div className={styles.wrap}>
      <div className={shared.moduleHero}><div><div className={shared.sectionKicker}>Guillotine Mania</div><h2>Guillotine</h2></div></div>
      {data.simulatedChop && <div className={styles.banner}>Test: {data.simulatedChop.owner} assumed chopped ({data.simulatedChop.released} players released).</div>}

      <div className={styles.row}>
        <div className={styles.stat}><b>${faab}</b><span>FAAB left</span></div>
        <div className={styles.stat}><b>#{data.me.waiverPosition}</b><span>Priority</span></div>
        <label className={styles.meta}>Assume chopped<br /><select className={styles.select} value={chop} onChange={(e) => setChop(e.target.value)}><option value="">None (live)</option>{data.owners.map((o) => <option key={o}>{o}</option>)}</select></label>
      </div>

      <section className={shared.panel}>
        <h3 className={styles.h}>Targets</h3>
        <div className={styles.scroll}><table className={styles.table}><thead><tr><th>#</th><th>Player</th><th>Gain</th><th>Bid 50/75/90%</th><th>Win @ ${faab}</th><th>Drop</th><th /></tr></thead><tbody>
          {targets.map((t, i) => { const [label, cls] = verdict(t); return (
            <Fragment key={t.id}>
              <tr>
                <td>{i + 1}</td>
                <td><b>{t.name}</b> <span className={styles.meta}>{t.position} · {t.team}{t.injury ? ` · ${t.injury}` : ""}</span><br />
                  <span className={`${styles.badge} ${cls}`} style={{ marginLeft: 0 }}>{label}</span>{t.newlyReleased && <span className={`${styles.badge} ${styles.good}`}>New</span>}{t.byeWeeks.length > 0 && <span className={`${styles.badge} ${styles.warn}`}>Bye {t.byeWeeks.join(",")}</span>}</td>
                <td>+{t.weightedGain}</td>
                <td>${t.bid.p50} / ${t.bid.p75} / ${t.bid.p90}</td>
                <td>{pct(t.bid.winAtMax)}</td>
                <td className={styles.meta}>{t.drop?.name || "—"}</td>
                <td><button className={styles.link} onClick={() => setOpen(open === t.id ? "" : t.id)}>{open === t.id ? "Less" : "More"}</button></td>
              </tr>
              {open === t.id && <tr className={styles.detail}><td /><td colSpan={6}>
                Proj {t.proj.map((p, k) => `Wk${data.horizon[k]} ${p}`).join(" · ")} · Lineup {t.gains.map((g, k) => `Wk${data.horizon[k]} ${g > 0 ? "+" : ""}${g}`).join(" · ")}
                {t.bid.mainRivals.length > 0 && <><br />Competition: {t.bid.mainRivals.map((r) => `${r.owner} ($${r.budget}, ~$${r.typical})`).join(", ")}</>}
              </td></tr>}
            </Fragment>); })}
          {!targets.length && <tr><td colSpan={7} className={styles.meta}>No available player improves your lineup.</td></tr>}
        </tbody></table></div>
      </section>

      <section className={shared.panel}>
        <h3 className={styles.h}>Chop watch</h3>
        <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Team</th><th>Chop %</th><th>Best adds if chopped</th><th /></tr></thead><tbody>
          {data.chopPreview.teams.slice(0, 5).map((t) => <tr key={t.owner}><td>{t.owner}</td><td>{t.chance}%</td><td className={styles.meta}>{t.best.filter((b) => b.gainForMe > 0).slice(0, 3).map((b) => `${b.name} +${b.gainForMe}`).join(", ") || "—"}</td><td><button className={styles.btn} onClick={() => setChop(t.owner)}>Test</button></td></tr>)}
        </tbody></table></div>
      </section>

      <section className={shared.panel}>
        <h3 className={styles.h}>Trade for FAAB</h3>
        <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Player</th><th>Lineup cost</th><th>Top buyers</th><th /></tr></thead><tbody>
          {data.tradeIdeas.filter((i) => i.topOffer > 0).slice(0, 8).map((i) => <tr key={i.id}><td>{i.name} <span className={styles.meta}>{i.position} · {i.team}</span></td><td>{i.lineupLoss > 0 ? `−${i.lineupLoss}` : "None"}</td><td className={styles.meta}>{i.offers.slice(0, 3).map((o) => `${o.owner} ~$${o.faab}`).join(", ")}</td><td><button className={styles.btn} onClick={() => { setSellId(i.id); setBuyer(i.offers[0]?.owner || ""); }}>Simulate</button></td></tr>)}
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
      <div className={styles.foot}>Estimates only. Gain = weighted lineup points over the next 3 weeks.</div>
    </div>
  );
}
