"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import NflPlayerName from "@/components/NflPlayerName";
import { ManagerLink } from "./league-nav";
import { buildClaimSheet, buildMatrix, lastName, lineupShift, orderedPairs, tierOf, winAt, type ClaimSheet, type PlayerInfo } from "@/lib/in-season-guillotine";
import shared from "./in-season-management.module.css";
import styles from "./guillotine-waivers.module.css";

type Bid = { p50: number; p75: number; p90: number; mainRivals: { owner: string; gain: number; budget: number; typical: number }[]; curve: { bid: number; win: number }[] };
type Target = { id: string; name: string; position: string; team: string; age: number | null; injury: string; proj: number[]; byeWeeks: number[]; nextBye?: number | null; newlyReleased: boolean; gains: number[]; weightedGain: number; bid: Bid; rivalsInterested: number };
type Offer = { owner: string; theirGain: number; faab: number; theirBudget: number };
type Idea = { id: string; name: string; position: string; team: string; injury: string; lineupLoss: number; tier: number; offers: Offer[]; topOffer: number };
type Data = {
  eliminated?: boolean; week: number; horizon: number[]; league: { id: string; name: string; slots: string[]; bidMin?: number };
  learning?: Learning;
  me: { faab: number; waiverPosition: number; roster: PlayerInfo[] };
  faab: { teams: number; top: { owner: string; faab: number }; second: { owner: string; faab: number } | null; leadOverSecond: number; leadOverAverage: number; average: number; lowest: { owner: string; faab: number }; mine: number; mineRank: number };
  chop: { week: number; scoringPosted: boolean; result: { owner: string } | null; teams: { owner: string; ownerId?: string; chance: number; pointsSoFar: number; projectedRemaining: number; best: { id: string; name: string; position: string; team: string; gainForMe: number }[] }[] };
  simulatedChop: { owner: string; released: number } | null; owners: string[]; targets: Target[]; tradeIdeas: Idea[];
};
type Learning = { topPickCount?: number; winsThisYear: number; winsLastYear: number; chopsThisYear: number; priceSamples: number; tradeCeiling: number; baseline: number[]; builtAt: string; trades: { week: number; faab: number; from: string; to: string; players: string[]; picks: number; year: string }[] };
type LeagueTab = { id: string; name: string; eliminated: boolean };
const pct = (v: number) => `${Math.round(v * 100)}%`;
const r1 = (v: number) => Math.round(v * 10) / 10;
const sign = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(r1(v))}`;
const last = lastName;
const tag = (p: { position: string; team: string; injury?: string }) => `${p.position} · ${p.team}${p.injury ? ` · ${p.injury}` : ""}`;
const tierClass = (net: number) => [styles.t1, styles.t1, styles.t2, styles.t3, styles.t4][tierOf(net)];
const avgPlayed = (p: PlayerInfo) => { const x = p.proj.filter((v) => v > 0); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0; };

type Found = { id: string; name: string; position: string; team: string };
/** `oy` = elite players you mark out for the year (so they may be cut). `bid` = bids you typed and `placed` = bids you entered in Sleeper, both keyed "week:addId|dropId" so they expire with the week. */
type Saved = { t: string[]; d: string[]; rt: string[]; rd: string[]; custom: Found[]; oy: string[]; bid: Record<string, number>; placed: Record<string, number> };
const EMPTY: Saved = { t: [], d: [], rt: [], rd: [], custom: [], oy: [], bid: {}, placed: {} };

/** Small "i" button: hover on desktop, tap on mobile. Holds the long definitions so they are not always on screen. */
function Info({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <span ref={box} className={styles.infoWrap} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button className={styles.info} onClick={() => setOpen((v) => !v)} aria-label="Definition" aria-expanded={open}>i</button>
      {open && <span className={styles.pop} role="tooltip">{children}</span>}
    </span>
  );
}

/** A panel whose table can be minimized. */
function Sec({ id, title, folded, toggle, info, children }: { id: string; title: string; folded: boolean; toggle: (id: string) => void; info?: ReactNode; children: ReactNode }) {
  return (
    <section className={shared.panel}>
      <div className={styles.head}><h3 className={styles.h} style={{ margin: 0 }}>{title}{info && <Info>{info}</Info>}</h3><button className={styles.mv} onClick={() => toggle(id)} aria-expanded={!folded}>{folded ? "＋ Show" : "－ Hide"}</button></div>
      {!folded && children}
    </section>
  );
}

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

/** A bid you can type over. Commits on Enter or when you click away. */
function BidInput({ value, max, onCommit }: { value: number; max: number; onCommit: (n: number) => void }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = () => { const n = Math.round(Number(v)); if (!Number.isFinite(n) || n < 1) { setV(String(value)); return; } if (n !== value) onCommit(Math.min(max, n)); else setV(String(value)); };
  return <span style={{ whiteSpace: "nowrap" }}>$<input className={styles.select} style={{ width: 64, marginLeft: 2 }} inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9]/g, ""))} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} aria-label="Bid" /></span>;
}

export default function GuillotineWaivers({ onOpenManager }: { onOpenManager?: (ownerId: string) => void } = {}) {
  const [leagues, setLeagues] = useState<LeagueTab[]>([]);
  const [leagueId, setLeagueId] = useState("");
  const [chop, setChop] = useState<string>(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("chop") || ""));
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [sellId, setSellId] = useState("");
  const [buyer, setBuyer] = useState("");
  const [useTrade, setUseTrade] = useState(false);
  const [building, setBuilding] = useState(false);
  const [saved, setSaved] = useState<Saved>(EMPTY);
  const [savedFor, setSavedFor] = useState("");
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [addOpen, setAddOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const lastKey = useRef("");
  const [showAllDrops, setShowAllDrops] = useState(false);
  const [focus, setFocus] = useState<{ add: string; drop: string } | null>(null);
  const [sheets, setSheets] = useState<{ now: ClaimSheet; after: ClaimSheet | null; budgetNow: number; budgetAfter: number; loss: number; sold: string } | null>(null);

  useEffect(() => {
    fetch("/api/in-season/guillotine-waivers?list=1", { cache: "no-store" }).then((r) => r.json()).then((j) => {
      const list: LeagueTab[] = j.leagues || [];
      setLeagues(list); setLeagueId((list.find((l) => !l.eliminated) || list[0])?.id || "");
    }).catch((e) => setError(e.message || "Could not load leagues."));
  }, []);

  const load = useCallback(async (id: string, owner: string, wantIds: string[]) => {
    const key = `${id}|${owner}`;
    setError(""); setSheets(null);
    if (key !== lastKey.current) setData(null); // adding a custom target reloads in place; switching league or chop test starts fresh
    lastKey.current = key;
    try {
      const qs = new URLSearchParams({ league: id }); if (owner) qs.set("chop", owner); if (wantIds.length) qs.set("wantIds", wantIds.join(","));
      const r = await fetch(`/api/in-season/guillotine-waivers?${qs}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
      setData(j);
    } catch (e: any) { setError(e.message || "Could not load."); }
  }, []);
  const customKey = saved.custom.map((c) => c.id).join(",");
  useEffect(() => { if (leagueId && savedFor === leagueId) load(leagueId, chop, customKey ? customKey.split(",") : []); }, [leagueId, chop, load, savedFor, customKey]);
  useEffect(() => { try { const raw = window.localStorage.getItem("guillotine-folded"); if (raw) setFolded(JSON.parse(raw)); } catch { /* optional */ } }, []);
  const toggle = (id: string) => setFolded((cur) => { const next = { ...cur, [id]: !cur[id] }; try { window.localStorage.setItem("guillotine-folded", JSON.stringify(next)); } catch { /* optional */ } return next; });

  useEffect(() => {
    try { const raw = window.localStorage.getItem(`guillotine-order:${leagueId}`); setSaved(raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY); } catch { setSaved(EMPTY); }
    setFocus(null); setSavedFor(leagueId);
  }, [leagueId]);
  const persist = (next: Saved) => { setSaved(next); try { window.localStorage.setItem(`guillotine-order:${leagueId}`, JSON.stringify(next)); } catch { /* storage unavailable: order lasts until reload */ } };

  useEffect(() => {
    if (!addOpen || q.trim().length < 2 || !leagueId) { setResults([]); return; }
    const h = setTimeout(async () => {
      try { const qs = new URLSearchParams({ league: leagueId, search: q.trim() }); if (chop) qs.set("chop", chop); const j = await (await fetch(`/api/in-season/guillotine-waivers?${qs}`, { cache: "no-store" })).json(); setResults(j.results || []); } catch { setResults([]); }
    }, 250);
    return () => clearTimeout(h);
  }, [q, addOpen, leagueId, chop]);

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
  const customIds = useMemo(() => saved.custom.map((c) => c.id), [saved.custom]);
  const defaultT = useMemo(() => {
    const base = (matrix?.rows || []).filter((r) => (r.best?.net ?? -9) >= 2).slice(0, 12).map((r) => r.id);
    const extra = customIds.filter((id) => !base.includes(id) && (matrix?.rows || []).some((r) => r.id === id));
    return [...base, ...extra].filter((id) => !saved.rt.includes(id));
  }, [matrix, customIds, saved.rt]);
  /** Players drafted in the first three rounds, and elite players, are never offered as cuts (even when injured) unless you mark them out for the year. */
  const shielded = useCallback((id: string) => !!(info[id]?.elite || info[id]?.topPick), [info]);
  const isProtected = useCallback((id: string) => shielded(id) && !saved.oy.includes(id), [shielded, saved.oy]);
  const protectedIds = useMemo(() => (matrix?.drops || []).map((d) => d.id).filter((id) => isProtected(id)), [matrix, isProtected]);
  const markedOut = useMemo(() => (matrix?.drops || []).map((d) => d.id).filter((id) => shielded(id) && saved.oy.includes(id)), [matrix, shielded, saved.oy]);
  const defaultD = useMemo(() => (matrix?.drops || []).map((d) => d.id).filter((id) => !saved.rd.includes(id) && !isProtected(id)), [matrix, saved.rd, isProtected]);
  const targetIds = useMemo(() => merge(saved.t, defaultT), [saved.t, defaultT]);
  const dropIds = useMemo(() => merge(saved.d, defaultD), [saved.d, defaultD]);
  const rowOf = useMemo(() => new Map((matrix?.rows || []).map((r) => [r.id, r])), [matrix]);
  /** The matrix never shows more drops than you have targets. */
  const cols = useMemo(() => dropIds.slice(0, targetIds.length), [dropIds, targetIds]);
  /** Target number k is only compared with drops 1 to k. Its Net is its best swap among those. */
  const ranked = useMemo(() => targetIds.map((id, i) => {
    const row = rowOf.get(id)!;
    const allowed = dropIds.slice(0, i + 1);
    let best: { drop: string; net: number } | null = null;
    for (const d of allowed) { const n = row.nets[d]; if (n !== undefined && (!best || n > best.net)) best = { drop: d, net: n }; }
    return { id, row, allowed, best };
  }), [targetIds, dropIds, rowOf]);
  const removeItem = (kind: "t" | "d", id: string) => persist(kind === "t" ? { ...saved, rt: [...saved.rt, id] } : { ...saved, rd: [...saved.rd, id] });
  const restoreItem = (kind: "t" | "d", id: string) => persist(kind === "t" ? { ...saved, rt: saved.rt.filter((x) => x !== id) } : { ...saved, rd: saved.rd.filter((x) => x !== id) });
  const addTarget = (f: Found) => { persist({ ...saved, rt: saved.rt.filter((x) => x !== f.id), t: saved.t.filter((x) => x !== f.id), custom: saved.custom.some((c) => c.id === f.id) ? saved.custom : [...saved.custom, f] }); setQ(""); setResults([]); setAddOpen(false); };
  const move = (kind: "t" | "d", id: string, dir: -1 | 1) => {
    const list = [...(kind === "t" ? targetIds : dropIds)];
    const i = list.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    persist({ ...saved, t: kind === "t" ? list : targetIds, d: kind === "d" ? list : dropIds });
  };

  const wk = live?.week ?? 0;
  const bkey = (add: string, drop: string) => `${wk}:${add}|${drop}`;
  /** Bids you typed or already placed in Sleeper this week, keyed "add|drop". A rebuild leaves these alone. */
  const lockedFor = (sv: Saved) => {
    const out: Record<string, number> = {};
    for (const src of [sv.placed, sv.bid]) for (const [k, v] of Object.entries(src)) if (k.startsWith(`${wk}:`)) out[k.slice(String(wk).length + 1)] = v;
    return out;
  };
  const build = (next?: Saved) => {
    if (!live || !matrix) return;
    const sv = next ?? saved;
    setBuilding(true);
    setTimeout(() => {
      const run = (budget: number, roster: string[], locked?: Record<string, number>) => {
        const mx = buildMatrix(live.league.slots, roster, info, live.targets.map((t) => t.id));
        const tg = targetIds.map((id) => targetById.get(id)!).filter(Boolean).map((t) => ({ id: t.id, curve: t.bid.curve, p50: t.bid.p50, p75: t.bid.p75, p90: t.bid.p90 }));
        return buildClaimSheet({ slots: live.league.slots, roster, info, targets: tg, pairs: orderedPairs(mx, targetIds, dropIds.filter((id) => roster.includes(id))), budget, ladder: true, locked, bidMin: live.league.bidMin });
      };
      const now = run(faab, rosterIds, lockedFor(sv));
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
  const weeks = live.horizon.length || 3;
  const mover = (kind: "t" | "d", id: string, i: number, n: number) => (
    <span style={{ whiteSpace: "nowrap" }}>
      <button className={styles.mv} disabled={i === 0} onClick={() => move(kind, id, -1)} aria-label="Move up">▲</button>
      <button className={styles.mv} disabled={i === n - 1} onClick={() => move(kind, id, 1)} aria-label="Move down">▼</button>
      <button className={styles.mv} onClick={() => removeItem(kind, id)} aria-label="Remove" title="Remove">✕</button>
    </span>
  );
  const restoreRow = (kind: "t" | "d", ids: string[]) => {
    const list = ids.filter((id) => info[id] && !(kind === "d" && isProtected(id)));
    return list.length ? <div className={styles.meta} style={{ marginTop: 6 }}>Removed: {list.map((id) => <button key={id} className={styles.link} style={{ marginRight: 8 }} onClick={() => restoreItem(kind, id)}>＋ {info[id].name}</button>)}</div> : null;
  };
  /** A player name that opens the NFL player card. */
  const pn = (id: string, label?: string) => { const p = info[id]; return p ? <NflPlayerName name={p.name} label={label} position={p.position} team={p.team} sleeperId={p.id} /> : null; };
  const names = (xs: { id: string; value: number; note?: string }[]) => xs.length ? xs.map((x, k) => <span key={x.id}>{k ? ", " : ""}{pn(x.id, last(info[x.id].name))} {r1(x.value)}{x.note ? ` (${x.note})` : ""}</span>) : "none";
  const shiftRows = (add: string, drop: string) => lineupShift(live.league.slots, rosterIds, info, add, drop).slice(0, weeks).map((s) => (
    <td key={s.week} style={{ whiteSpace: "normal", minWidth: 150 }}>
      <b>{sign(s.gain)}</b>
      <div className={styles.meta}>{s.ins.length || s.outs.length ? <>In: {names(s.ins)}<br />Out: {names(s.outs.map((x) => ({ ...x, note: x.dropped ? "cut" : "to bench" })))}</> : "Starting lineup unchanged"}</div>
    </td>));
  const shown = new Set(targetIds);

  return (
    <div className={styles.wrap}>
      {hero}{tabs}
      {live.simulatedChop && <div className={styles.banner}>Test: {live.simulatedChop.owner} assumed chopped ({live.simulatedChop.released} players released).</div>}

      <div className={styles.row}>
        <div className={styles.stat}><b>${faab}</b><span>Your FAAB</span></div>
        <div className={styles.stat}><b>#{live.me.waiverPosition}</b><span>Priority</span></div>
        <label className={styles.meta}>Assume chopped<br /><select className={styles.select} value={chop} onChange={(e) => setChop(e.target.value)}><option value="">None (live)</option>{live.owners.map((o) => <option key={o}>{o}</option>)}</select></label>
      </div>

      <Sec id="faab" title="FAAB across the league" folded={!!folded.faab} toggle={toggle}>
        <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Most FAAB</th><th>Lead over #2</th><th>Lead over avg of others</th><th>League average</th><th>Least FAAB</th><th>You</th></tr></thead><tbody><tr>
          <td><b>${f.top.faab}</b> <span className={styles.meta}>{f.top.owner}</span></td>
          <td>{f.second ? <>+${f.leadOverSecond} <span className={styles.meta}>vs {f.second.owner} ${f.second.faab}</span></> : "—"}</td>
          <td>+${f.leadOverAverage}</td><td>${f.average}</td>
          <td><b>${f.lowest.faab}</b> <span className={styles.meta}>{f.lowest.owner}</span></td>
          <td>#{f.mineRank} of {f.teams}</td>
        </tr></tbody></table></div>
      </Sec>

      <div className={styles.split}>
        <Sec id="targets" title="Targets" folded={!!folded.targets} toggle={toggle} info={<><b>How Net works.</b> Net is your best possible starting lineup after the swap minus your best lineup today, added up over the next 3 weeks and weighted 1.0 / 0.8 / 0.6 (week 1 counts most; total weight 2.4). It is total lineup points, not points per game: divide by about 2.4 for a rough per-week number (+12 is about +5 a week). It is not a head-to-head between two players: your whole lineup is re-set each week, so a player who would start over someone is credited only with the difference. A target is only scored against the drops ranked at or above his number.</>}>
          <div className={styles.scroll}><table className={styles.table}><thead><tr><th>#</th><th>Player</th><th>Net</th><th>Bid 50 / 75 / 90%</th><th>Win % at ${faab}</th><th>Order</th></tr></thead><tbody>
            {ranked.map((r, i) => { const t = targetById.get(r.id)!; return (
              <tr key={r.id}>
                <td>{i + 1}</td>
                <td><b>{pn(t.id)}</b><br /><span className={styles.meta}>{tag(t)}{t.byeWeeks.length ? ` · bye wk ${t.byeWeeks.join(",")}` : ""}</span>{t.newlyReleased && <span className={`${styles.badge} ${styles.good}`}>New</span>}{customIds.includes(r.id) && <span className={styles.badge}>Custom</span>}</td>
                <td><span className={`${styles.cell} ${tierClass(r.best?.net ?? -9)}`}>{sign(r.best?.net ?? 0)}</span></td>
                <td>${t.bid.p50} / ${t.bid.p75} / ${t.bid.p90}</td>
                <td>{pct(winAt(t.bid.curve, faab))}</td>
                <td>{mover("t", r.id, i, ranked.length)}</td>
              </tr>); })}
            {!ranked.length && <tr><td colSpan={6} className={styles.meta}>No targets. Add one below.</td></tr>}
          </tbody></table></div>
          <div style={{ marginTop: 8 }}>
            {!addOpen ? <button className={styles.btn} onClick={() => setAddOpen(true)}>＋ Add new target</button> : <div>
              <div className={styles.row}>
                <input className={styles.select} style={{ minWidth: 200 }} autoFocus placeholder="Search players on waivers" value={q} onChange={(e) => setQ(e.target.value)} />
                <button className={styles.link} onClick={() => { setAddOpen(false); setQ(""); setResults([]); }}>Cancel</button>
              </div>
              {q.trim().length >= 2 && <div style={{ marginTop: 6, display: "grid", gap: 4 }}>
                {results.filter((x) => !shown.has(x.id)).map((x) => <button key={x.id} className={styles.btn} style={{ textAlign: "left" }} onClick={() => addTarget(x)}>{x.name} <span className={styles.meta}>{x.position} · {x.team}</span></button>)}
                {!results.filter((x) => !shown.has(x.id)).length && <span className={styles.meta}>No matches on waivers.</span>}
              </div>}
            </div>}
          </div>
          {restoreRow("t", saved.rt)}
          <div className={styles.meta} style={{ marginTop: 8 }}><button className={styles.link} onClick={() => persist({ ...EMPTY, bid: saved.bid, placed: saved.placed })}>Reset to the model&apos;s list</button></div>
        </Sec>

        <Sec id="drops" title="Drops" folded={!!folded.drops} toggle={toggle}>
          <div className={styles.scroll}><table className={styles.table}><thead><tr><th>#</th><th>Player</th><th>Costs you</th><th>Order</th></tr></thead><tbody>
            {(showAllDrops ? dropIds : dropIds.slice(0, 10)).map((id, i) => { const p = info[id]; const cost = costOf.get(id) ?? 0; return (
              <tr key={id}><td>{i + 1}</td><td><b>{pn(id)}</b> <span className={styles.meta}>{tag(p)}</span><br /><span className={styles.meta}>{dropNote(p, cost, rosterInfo)}</span></td><td>{cost < 0.05 ? "0" : `−${r1(cost)}`}</td><td>{mover("d", id, i, dropIds.length)}</td></tr>); })}
          </tbody></table></div>
          {dropIds.length > 10 && <button className={styles.link} style={{ marginTop: 6 }} onClick={() => setShowAllDrops(!showAllDrops)}>{showAllDrops ? "Show top 10" : `Show all ${dropIds.length}`}</button>}
          {restoreRow("d", saved.rd)}
          {protectedIds.length > 0 && <div className={styles.meta} style={{ marginTop: 8 }}>Protected, never suggested as a cut: {protectedIds.map((id) => <span key={id} style={{ marginRight: 10 }}>{pn(id)}{info[id].injury ? ` (${info[id].injury})` : ""} <button className={styles.link} onClick={() => persist({ ...saved, oy: [...saved.oy, id] })}>Out for the year, allow cut</button></span>)}</div>}
          {markedOut.length > 0 && <div className={styles.meta} style={{ marginTop: 6 }}>Marked out for the year: {markedOut.map((id) => <span key={id} style={{ marginRight: 10 }}>{pn(id)} <button className={styles.link} onClick={() => persist({ ...saved, oy: saved.oy.filter((x) => x !== id) })}>Protect again</button></span>)}</div>}
        </Sec>
      </div>

      <Sec id="matrix" title="Add / drop matrix" folded={!!folded.matrix} toggle={toggle} info={<>Net lineup points over the next 3 weeks if you add the player on the left and cut the player on top. Each target is only compared with the drops ranked at or above his number (#1 vs drop 1, #2 vs drops 1–2, and so on), and there are never more drops than targets. Tap a cell to see who it moves in and out of your lineup. The outlined cell is each target&apos;s best swap.</>}>
        <div className={styles.meta} style={{ marginBottom: 8 }}><span className={`${styles.cell} ${styles.t1}`}>+10 Do it</span> <span className={`${styles.cell} ${styles.t2}`}>+5 Worth it</span> <span className={`${styles.cell} ${styles.t3}`}>+2 Marginal</span> <span className={`${styles.cell} ${styles.t4}`}>Skip</span></div>
        <div className={styles.scroll}><table className={`${styles.table} ${styles.mx}`}><thead><tr><th>Add / Drop</th>{cols.map((d, ci) => <th key={d}>{ci + 1}. {pn(d, last(info[d].name))}<span className={styles.sub}>{(costOf.get(d) ?? 0) < 0.05 ? "free" : `−${r1(costOf.get(d) ?? 0)}`}</span></th>)}</tr></thead><tbody>
          {ranked.map((r, i) => <tr key={r.id}><td><b>{i + 1}. {pn(r.id, last(targetById.get(r.id)!.name))}</b></td>{cols.map((d, ci) => { if (ci > i) return <td key={d} className={styles.meta}>·</td>; const net = r.row.nets[d]; const on = focus?.add === r.id && focus?.drop === d; return <td key={d}><button className={`${styles.cell} ${styles.pick} ${tierClass(net)} ${r.best?.drop === d ? styles.best : ""}`} style={on ? { boxShadow: "0 0 0 2px #9fd2ff" } : undefined} onClick={() => setFocus({ add: r.id, drop: d })}>{sign(net)}</button></td>; })}</tr>)}
        </tbody></table></div>
        {focus && info[focus.add] && info[focus.drop] && <div style={{ marginTop: 10 }}>
          <div className={styles.meta} style={{ marginBottom: 4 }}><b>{pn(focus.add)}</b> in, <b>{pn(focus.drop)}</b> cut: who moves in and out of your starting lineup.</div>
          <div className={styles.scroll}><table className={styles.table}><thead><tr>{live.horizon.slice(0, weeks).map((w) => <th key={w}>Week {w}</th>)}</tr></thead><tbody><tr>{shiftRows(focus.add, focus.drop)}</tr></tbody></table></div>
        </div>}
      </Sec>

      <Sec id="shifts" title="Lineup Impact" folded={!!folded.shifts} toggle={toggle} info={<>Net is not Player A against Player B. Each swap re-sets your whole starting lineup, so it also counts whoever the new player pushes to the bench. This shows the best swap for each target (among the drops he is compared with) and the players actually moving in and out of your lineup each week.</>}>
        <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Add → Drop</th>{live.horizon.slice(0, weeks).map((w) => <th key={w}>Week {w}</th>)}</tr></thead><tbody>
          {ranked.filter((r) => r.best).map((r, i) => <tr key={r.id}><td style={{ whiteSpace: "nowrap" }}><b>{i + 1}. {pn(r.id)}</b><br /><span className={styles.meta}>for {pn(r.best!.drop)} · net {sign(r.best!.net)}</span></td>{shiftRows(r.id, r.best!.drop)}</tr>)}
        </tbody></table></div>
      </Sec>

      <Sec id="claims" title="Claim sheet" folded={!!folded.claims} toggle={toggle} info={<>Rows run in target order. Each target&apos;s bids step down by drop number: drop 1 is the most aggressive bid (about a 90% chance to beat the other bids), because it can fire with nothing else won. Drop 2 only fires if an earlier target already took drop 1, so you have already landed a player and it bids less; drop 3 means two earlier wins and bids less again, and so on. Bids never exceed your FAAB. Only swaps worth +2 or more appear.<br /><br /><b>Edit any bid.</b> Type over a bid and everything below rebuilds around it; your bid stays put. Player #2&apos;s second claim can only spend what #1 left, so it is capped at that, and left off if nothing is left (Lamb $81 of $82 leaves Nabers $1). <b>Tick Placed</b> once the claim is in Sleeper; placed bids are locked so a rebuild never changes them.<br /><br /><b>Two percentages.</b> <b>Win</b> is the chance this bid beats the best rival bid, from the same curve as the Targets table (the &quot;Win % at your FAAB&quot; column). <b>Lands</b> is the chance this exact claim is the one that goes through, after the claims above it have had their turn, so it is never higher than Win.</>}>
        <div className={styles.row}>
          <button className={styles.btn} onClick={() => build()} disabled={building}>{building ? "Building…" : "Build claim sheet"}</button>
          <label className={styles.meta}><input type="checkbox" checked={useTrade} onChange={(e) => setUseTrade(e.target.checked)} disabled={!offer} /> Also show it after the trade selected below{offer ? ` (${sel!.name} → $${after})` : ""}</label>
        </div>
        {sheets && <>
          <div className={styles.meta} style={{ margin: "10px 0 6px" }}>With ${sheets.budgetNow}: expected gain <b>+{r1(sheets.now.expected)}</b> · {pct(sheets.now.landAny)} chance to land at least one player.
            {sheets.after && <> After trading {sheets.sold} (${sheets.budgetAfter}): <b>+{r1(sheets.after.expected)}</b>, minus {sheets.loss} lineup points given up = <b>{sign(sheets.after.expected - sheets.loss - sheets.now.expected)}</b> net vs. no trade.</>}</div>
          <div className={styles.meta} style={{ margin: "0 0 6px" }}>Placed in Sleeper: <b>{sheets.now.rows.filter((r) => saved.placed[bkey(r.add, r.drop)] === r.bid).length} of {sheets.now.rows.length}</b>{Object.keys(saved.bid).some((k) => k.startsWith(`${wk}:`)) && <> · <button className={styles.link} onClick={() => { const next = { ...saved, bid: {} }; persist(next); build(next); }}>Clear my bid edits</button></>}</div>
          <div className={styles.scroll}><table className={styles.table}><thead><tr><th>#</th><th>Placed</th><th>Add</th><th>Drop</th><th>Net</th><th>Bid</th>{sheets.after && <th>After trade</th>}<th>Win</th><th>Lands</th></tr></thead><tbody>
            {sheets.now.rows.map((r, i) => { const a = sheets.after?.rows.find((x) => x.add === r.add && x.drop === r.drop); const k = bkey(r.add, r.drop); const placedBid = saved.placed[k]; const isPlaced = placedBid === r.bid; const typed = saved.bid[k] !== undefined; return (
              <tr key={i} style={isPlaced ? { opacity: 0.6 } : undefined}>
                <td>{i + 1}</td>
                <td><input type="checkbox" checked={isPlaced} aria-label="Bid placed in Sleeper" onChange={(e) => { const placed = { ...saved.placed }; if (e.target.checked) placed[k] = r.bid; else delete placed[k]; persist({ ...saved, placed }); }} />{placedBid !== undefined && !isPlaced && <span className={styles.meta} style={{ color: "#f5b942" }}> changed since placed</span>}</td>
                <td>{pn(r.add)}</td><td>{pn(r.drop)}</td><td><span className={`${styles.cell} ${tierClass(r.net)}`}>{sign(r.net)}</span></td>
                <td><BidInput value={r.bid} max={sheets.budgetNow} onCommit={(n) => { const placed = { ...saved.placed }; delete placed[k]; const next = { ...saved, placed, bid: { ...saved.bid, [k]: n } }; persist(next); build(next); }} />{typed && <button className={styles.link} style={{ marginLeft: 6 }} title="Back to the model's bid" onClick={() => { const bid = { ...saved.bid }; delete bid[k]; const placed = { ...saved.placed }; delete placed[k]; const next = { ...saved, bid, placed }; persist(next); build(next); }}>↺</button>}{r.capped !== undefined && <div className={styles.meta}>only ${r.capped} left after #1</div>}</td>
                {sheets.after && <td>{a ? `$${a.bid}` : "—"}</td>}
                <td>{pct(r.win)}</td><td>{r.hit >= 0.005 ? pct(r.hit) : "<1%"}</td></tr>); })}
          </tbody></table></div>
        </>}
      </Sec>

      <Sec id="trade" title="Trade for FAAB" folded={!!folded.trade} toggle={toggle}>
        <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Player</th><th>Lineup cost</th><th>Est. FAAB from</th><th /></tr></thead><tbody>
          {live.tradeIdeas.map((i) => <tr key={i.id}><td><NflPlayerName name={i.name} position={i.position} team={i.team} sleeperId={i.id} /> <span className={styles.meta}>{tag(i)}</span>{i.tier === 2 ? <span className={`${styles.badge} ${styles.good}`}>Elite</span> : i.tier === 1 ? <span className={styles.badge}>Star</span> : null}</td><td>{i.lineupLoss > 0 ? `−${i.lineupLoss}` : "None"}</td><td className={styles.meta}>{i.offers.length ? i.offers.slice(0, 3).map((o) => `${o.owner} ~$${o.faab}`).join(", ") : "No buyers"}</td><td>{i.offers.length > 0 && <button className={styles.btn} onClick={() => { setSellId(i.id); setBuyer(i.offers[0].owner); }}>Simulate</button>}</td></tr>)}
        </tbody></table></div>
        <div className={styles.row} style={{ marginTop: 12 }}>
          <label className={styles.meta}>Trade<br /><select className={styles.select} value={sellId} onChange={(e) => { setSellId(e.target.value); setBuyer(live.tradeIdeas.find((i) => i.id === e.target.value)?.offers[0]?.owner || ""); }}><option value="">Pick a player</option>{live.tradeIdeas.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.position})</option>)}</select></label>
          {sel && <label className={styles.meta}>To<br /><select className={styles.select} value={buyer} onChange={(e) => setBuyer(e.target.value)}>{sel.offers.length ? sel.offers.map((o) => <option key={o.owner}>{o.owner}</option>) : <option value="">No buyers</option>}</select></label>}
          {offer && <div className={styles.stat}><b>${faab} → ${after}</b><span>~${offer.faab} back · lineup −{sel!.lineupLoss}</span></div>}
        </div>
        {offer && <div className={styles.scroll} style={{ marginTop: 10 }}><table className={styles.table}><thead><tr><th>Target</th><th>Win % at ${faab}</th><th>At ${after}</th></tr></thead><tbody>
          {ranked.slice(0, 6).map((r) => { const t = targetById.get(r.id)!; return <tr key={t.id}><td>{pn(t.id)}</td><td>{pct(winAt(t.bid.curve, faab))}</td><td>{pct(winAt(t.bid.curve, after))}</td></tr>; })}
        </tbody></table></div>}
      </Sec>

      <Sec id="chop" title={`Week ${live.chop.week} chop watch`} folded={!!folded.chop} toggle={toggle}>
        {live.chop.result ? <div className={styles.meta}>Week {live.chop.week}: {live.chop.result.owner} was chopped. Their players are on the wire for Wednesday.</div> : <>
          <div className={styles.meta} style={{ marginBottom: 6 }}>Chance each team has the lowest Week {live.chop.week} score and is chopped (about midnight to 3am ET Tuesday).{live.chop.scoringPosted ? "" : " Scoring isn't posted yet, so treat as rough."}</div>
          <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Team</th><th>Chopped %</th><th>Wk {live.chop.week} pts</th><th>Left to play</th><th>Your best adds if chopped</th><th /></tr></thead><tbody>
            {live.chop.teams.map((t) => <tr key={t.owner}><td><ManagerLink ownerId={t.ownerId} onOpen={onOpenManager}>{t.owner}</ManagerLink></td><td>{t.chance}%</td><td>{t.pointsSoFar}</td><td>{t.projectedRemaining}</td><td className={styles.meta}>{t.best.filter((b) => b.gainForMe > 0).map((b, k) => <span key={b.id}>{k ? ", " : ""}<NflPlayerName name={b.name} position={b.position} team={b.team} sleeperId={b.id} /> +{b.gainForMe}</span>)}{!t.best.some((b) => b.gainForMe > 0) && "—"}</td><td><button className={styles.btn} onClick={() => setChop(t.owner)}>Test</button></td></tr>)}
          </tbody></table></div></>}
      </Sec>
      <Sec id="learning" title="What the model has learned" folded={!!folded.learning} toggle={toggle} info={<>The bid prices are rebuilt from the league&apos;s own transactions every time the page loads, so each new waiver result and FAAB trade is picked up on refresh. Rival rosters and FAAB are live, so a player trade changes who wants whom right away. What does not adjust itself: the shape of the price model, trade-price percentages and the elite cut-offs. Those change when we recalibrate them together.</>}>
        {live.learning ? <>
          <div className={styles.meta} style={{ marginBottom: 8 }}>Prices come from <b>{live.learning.winsThisYear}</b> winning claims this season ({live.learning.chopsThisYear} weeks of chops) and <b>{live.learning.winsLastYear}</b> from last season, rebuilt just now. Ordinary-player trade ceiling: <b>${live.learning.tradeCeiling}</b>{live.learning.tradeCeiling > 70 ? " (raised by an actual trade in this league)" : ""}. Elite status is judged on week {live.learning.baseline.join(", ") || "n/a"} projections; {live.learning.topPickCount || 0} round 1–3 picks (2014–2026) are protected from cuts.</div>
          <div className={styles.scroll}><table className={styles.table}><thead><tr><th>Season</th><th>Week</th><th>FAAB</th><th>Players</th><th>Picks in deal</th></tr></thead><tbody>
            {live.learning.trades.map((t, i) => <tr key={i}><td>{t.year}</td><td>{t.week}</td><td>${t.faab}{t.year === "this year" ? <span className={styles.meta}> {t.from} → {t.to}</span> : null}</td><td className={styles.meta}>{t.players.join(", ") || "—"}</td><td>{t.picks || "—"}</td></tr>)}
            {!live.learning.trades.length && <tr><td colSpan={5} className={styles.meta}>No FAAB trades found in the league&apos;s transactions yet.</td></tr>}
          </tbody></table></div></> : <div className={styles.meta}>Not available.</div>}
      </Sec>
      <div className={styles.foot}>Trade prices are estimates: ordinary starters are priced inside the range this league has actually seen (about $30–70); stars and elites (top few at RB, WR, TE, QB by projection) are priced off what each buyer would bid on waivers, scaled to his remaining FAAB, with no flat ceiling.</div>
      <div className={styles.foot}>Estimates only. Net = weighted lineup points over the next 3 weeks (week 1 counts most; weights 1.0 / 0.8 / 0.6). Prices come from this season&apos;s and last season&apos;s Guillotine Mania claims.</div>
    </div>
  );
}
