"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { winAt } from "@/lib/in-season-guillotine";
import shared from "./in-season-management.module.css";
import styles from "./guillotine-waivers.module.css";

type Bid = { p50: number; p75: number; p90: number; winAtMax: number; tooExpensive: boolean; mainRivals: { owner: string; gain: number; budget: number; typical: number }[]; confidence: string; curve: { bid: number; win: number }[] };
type Target = { id: string; name: string; position: string; team: string; age: number | null; injury: string; proj: number[]; byeWeeks: number[]; newlyReleased: boolean; previouslyChopped: boolean; gains: number[]; weightedGain: number; drop: { name: string; position: string; team: string; injury: string } | null; bid: Bid; valueAtMax: number; rivalsInterested: number };
type Offer = { rosterId: string; owner: string; theirGain: number; faab: number; theirBudget: number };
type Idea = { id: string; name: string; position: string; team: string; injury: string; proj: number[]; byeWeeks: number[]; lineupLoss: number; offers: Offer[]; topOffer: number };
type Data = {
  week: number; horizon: number[]; error?: string;
  league: { name: string; budget: number };
  me: { faab: number; waiverPosition: number; rosterSize: number };
  rivals: { owner: string; faab: number; aggression: number }[];
  calibration: { samples: number };
  lastChop: { leg: number; owner: string; released: { id: string; name: string; onRoster: boolean }[] } | null;
  chopPreview: { scoringPosted: boolean; teams: { owner: string; chance: number; pointsSoFar: number; projectedRemaining: number; best: { name: string; position: string; team: string; gainForMe: number }[] }[] };
  simulatedChop: { owner: string; released: number } | null;
  owners: string[];
  targets: Target[]; tradeIdeas: Idea[];
};

const pctText = (v: number) => `${Math.round(v * 100)}%`;
const wk = (w: number[], horizon: number[]) => w.map((g, i) => `Wk ${horizon[i]}: ${g > 0 ? "+" : ""}${g}`).join("  ·  ");

export default function GuillotineWaivers() {
  const [chop, setChop] = useState<string>(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("chop") || ""));
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sellId, setSellId] = useState<string>("");
  const [buyer, setBuyer] = useState<string>("");

  const load = useCallback(async (owner: string) => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/in-season/guillotine-waivers${owner ? `?chop=${encodeURIComponent(owner)}` : ""}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || json.error) throw new Error(json.error || `HTTP ${response.status}`);
      setData(json);
    } catch (e: any) { setError(e.message || "Could not load guillotine data."); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(chop); }, [chop, load]);

  const selected = data?.tradeIdeas.find((i) => i.id === sellId) || null;
  const offer = selected?.offers.find((o) => o.owner === buyer) || null;
  const faabNow = data?.me.faab ?? 0;
  const faabAfter = faabNow + (offer?.faab || 0);
  const ranked = useMemo(() => (data?.targets || []).slice(0, 15), [data]);

  if (error) return <div className={styles.banner}>Guillotine waiver data failed to load: {error}</div>;
  if (!data) return <div className={styles.banner}>{loading ? "Loading guillotine waiver strategy…" : ""}</div>;
  const tier = (t: Target) => (t.bid.p75 <= faabNow ? ["Affordable", styles.good] : t.bid.p50 <= faabNow ? ["Stretch", styles.warn] : ["Likely out of reach", styles.bad]);

  return (
    <div className={styles.wrap}>
      <div className={shared.moduleHero}><div><div className={shared.sectionKicker}>{data.league.name} · bids for Wednesday</div><h2>Guillotine waiver strategy</h2><p>Targets ranked by what they add to your lineup over weeks {data.horizon.join(", ")} (week 1 counts most), with the bid it should take to win and what you could raise by trading players for FAAB. Estimates only: other managers&apos; bids are not visible until they process.</p></div></div>

      {data.simulatedChop && <div className={styles.banner}><b>Test mode:</b> assuming {data.simulatedChop.owner} is chopped this week. Their {data.simulatedChop.released} players are treated as available and their FAAB is out of the bidding. Real data replaces this after the chop (about 3am ET Tuesday).</div>}

      <div className={styles.row}>
        <div className={styles.stat}><b>${faabNow}</b><span>Your FAAB left</span></div>
        <div className={styles.stat}><b>#{data.me.waiverPosition}</b><span>Your waiver priority</span></div>
        <div className={styles.stat}><b>{data.calibration.samples}</b><span>Claims the bid model learned from</span></div>
        <label className={styles.small}>Assume chopped:<br /><select className={styles.select} value={chop} onChange={(e) => setChop(e.target.value)}>
          <option value="">None (use real data)</option>{data.owners.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
      </div>

      <section className={shared.panel}>
        <h3 className={styles.h}>Ranked targets</h3>
        <p className={styles.note}>Win % at your max is the model&apos;s chance that a bid of ${faabNow} beats every rival. &quot;Likely out of reach&quot; means even a coin-flip bid is more than you have.</p>
        <div className={styles.wrap}>
          {ranked.map((t, i) => { const [label, cls] = tier(t); return (
            <div key={t.id} className={styles.card}>
              <div className={styles.top}><div><span className={styles.name}>{i + 1}. {t.name}</span> <span className={styles.meta}>{t.position} · {t.team}{t.injury ? ` · ${t.injury}` : ""}{t.age ? ` · age ${t.age}` : ""}</span></div>
                <div className={styles.badges}>{t.newlyReleased && <span className={`${styles.badge} ${styles.good}`}>{data.simulatedChop ? "Released by test chop" : "Released by last chop"}</span>}<span className={`${styles.badge} ${cls}`}>{label}</span>{t.byeWeeks.length > 0 && <span className={`${styles.badge} ${styles.warn}`}>Bye wk {t.byeWeeks.join(", ")}</span>}</div></div>
              <div className={styles.grid}>
                <div className={styles.cell}><b>+{t.weightedGain}</b><span>Weighted lineup gain</span></div>
                <div className={styles.cell}><b>${t.bid.p50} / ${t.bid.p75} / ${t.bid.p90}</b><span>Bid for 50 / 75 / 90% win</span></div>
                <div className={styles.cell}><b>{pctText(t.bid.winAtMax)}</b><span>Win % at ${faabNow}</span></div>
                <div className={styles.cell}><b>{t.rivalsInterested}</b><span>Rivals who gain 1.5+ pts</span></div>
              </div>
              <div className={styles.small}>Projected: {t.proj.map((p, k) => `Wk ${data.horizon[k]} ${p}`).join(" · ")}. Lineup effect: {wk(t.gains, data.horizon)}.{t.drop ? ` Drop: ${t.drop.name} (${t.drop.position}, ${t.drop.team}${t.drop.injury ? `, ${t.drop.injury}` : ""}).` : ""}</div>
              {t.bid.mainRivals.length > 0 && <div className={styles.small}>Main competition: {t.bid.mainRivals.map((r) => `${r.owner} (has $${r.budget}, would pay about $${r.typical})`).join("; ")}. Confidence: {t.bid.confidence}.</div>}
            </div>); })}
          {!ranked.length && <div className={styles.small}>No available player improves your lineup enough over the next three weeks.</div>}
        </div>
      </section>

      <section className={shared.panel}>
        <h3 className={styles.h}>This week&apos;s chop: who is likely out</h3>
        <p className={styles.note}>{data.chopPreview.scoringPosted ? "Chance each team finishes lowest, from points so far plus projections for players still to play." : "Sleeper has not posted this week's scoring yet, so these odds are rough."} Use the dropdown above to test any team being chopped. Best players you could gain from each are listed.</p>
        <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Team</th><th>Chop chance</th><th>Points so far</th><th>Best adds for you if chopped</th><th /></tr></thead><tbody>
          {data.chopPreview.teams.slice(0, 6).map((t) => <tr key={t.owner}><td>{t.owner}</td><td>{t.chance}%</td><td>{t.pointsSoFar}</td><td>{t.best.filter((b) => b.gainForMe > 0).slice(0, 3).map((b) => `${b.name} (${b.position}, +${b.gainForMe})`).join(", ") || "—"}</td><td><button className={styles.btn} onClick={() => setChop(t.owner)}>Test</button></td></tr>)}
        </tbody></table></div>
      </section>

      <section className={shared.panel}>
        <h3 className={styles.h}>Trade for FAAB</h3>
        <p className={styles.note}>Players you could sell, least lineup damage first. Offers are estimates: roughly half of what that team would bid for the player on waivers, capped near the $30–70 this league&apos;s FAAB-for-player trades have cleared at.</p>
        <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Player</th><th>Lineup cost to you</th><th>Likely buyers (est. FAAB)</th><th /></tr></thead><tbody>
          {data.tradeIdeas.filter((i) => i.topOffer > 0).slice(0, 10).map((i) => <tr key={i.id}><td>{i.name} <span className={styles.meta}>{i.position} · {i.team}</span></td><td>{i.lineupLoss > 0 ? `−${i.lineupLoss}` : "None"}</td><td>{i.offers.slice(0, 3).map((o) => `${o.owner} ~$${o.faab}`).join(", ")}</td><td><button className={styles.btn} onClick={() => { setSellId(i.id); setBuyer(i.offers[0]?.owner || ""); }}>Simulate</button></td></tr>)}
        </tbody></table></div>
      </section>

      <section className={shared.panel}>
        <h3 className={styles.h}>Trade simulator</h3>
        <div className={styles.row}>
          <label className={styles.small}>If I trade<br /><select className={styles.select} value={sellId} onChange={(e) => { setSellId(e.target.value); setBuyer(data.tradeIdeas.find((i) => i.id === e.target.value)?.offers[0]?.owner || ""); }}>
            <option value="">Pick a player</option>{data.tradeIdeas.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.position})</option>)}</select></label>
          {selected && <label className={styles.small}>to<br /><select className={styles.select} value={buyer} onChange={(e) => setBuyer(e.target.value)}>
            {selected.offers.length ? selected.offers.map((o) => <option key={o.owner} value={o.owner}>{o.owner}</option>) : <option value="">No interested teams</option>}</select></label>}
        </div>
        {selected && offer && <>
          <p className={styles.note} style={{ marginTop: 10 }}>Selling {selected.name} to {offer.owner} could bring about <b>${offer.faab}</b> FAAB (they gain about {offer.theirGain} lineup points and have ${offer.theirBudget}). Your lineup would lose about {selected.lineupLoss} weighted points. FAAB: ${faabNow} → <b>${faabAfter}</b>.</p>
          <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Target</th><th>Win % now</th><th>Win % after trade</th><th>Bid for 75%</th></tr></thead><tbody>
            {ranked.slice(0, 8).map((t) => <tr key={t.id}><td>{t.name}</td><td>{pctText(winAt(t.bid.curve, faabNow - 0.5))}</td><td>{pctText(winAt(t.bid.curve, faabAfter - 0.5))}</td><td>${t.bid.p75}</td></tr>)}
          </tbody></table></div>
        </>}
        {selected && !selected.offers.length && <p className={styles.note}>No team has enough to gain from {selected.name} to pay real FAAB for him.</p>}
      </section>
    </div>
  );
}
