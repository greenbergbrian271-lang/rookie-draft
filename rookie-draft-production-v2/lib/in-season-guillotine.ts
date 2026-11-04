// Guillotine waiver strategy: who to add, what it takes to win the claim, and which players could be traded for FAAB.
// Advice only: nothing here places a claim or proposes a trade in Sleeper. Every number is an estimate and is labelled as one.
import { assignLineup, type ValuedPlayer } from "./in-season-waivers";

/** Next three fantasy weeks count less the further out they are: injuries and byes make later weeks less certain. */
export const HORIZON_WEIGHTS = [1, 0.8, 0.6];

export type PlayerInfo = { id: string; name: string; position: string; team: string; injury: string; age: number | null; proj: number[]; byeWeeks: number[]; /** Next bye week still ahead this season (null once it has passed). */ nextBye?: number | null; /** QB only: rank by projected points among every QB in the league pool, 1 is best. */ qbRank?: number | null };
export type GRoster = { rosterId: string; owner: string; isMine: boolean; eliminated: boolean; players: string[]; faab: number; waiverPosition: number };
export type Tx = { type: string; status: string; leg: number; created: number; status_updated?: number; roster_ids?: number[]; adds?: Record<string, number> | null; drops?: Record<string, number> | null; settings?: { waiver_bid?: number; seq?: number } | null; waiver_budget?: { amount: number; sender: number; receiver: number }[] };

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
export const round1 = (value: number) => Math.round(value * 10) / 10;
const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))] : 0);
const projOf = (info: Record<string, PlayerInfo>, id: string, week: number) => info[id]?.proj[week] ?? 0;

/* ---------- lineup value ---------- */

export function lineupTotals(slots: string[], ids: string[], info: Record<string, PlayerInfo>): number[] {
  return HORIZON_WEIGHTS.map((_, week) => assignLineup(slots, ids.filter((id) => info[id]).map((id): ValuedPlayer => ({ id, position: info[id].position, value: projOf(info, id, week) }))).total);
}
export const weighted = (totals: number[]) => sum(totals.map((t, i) => t * HORIZON_WEIGHTS[i]));

/** Lineup points a roster gains by adding `add` (and dropping `drop`, if given), per horizon week. */
export function gainsFor(slots: string[], ids: string[], info: Record<string, PlayerInfo>, add: string, drop?: string | null, base?: number[]): number[] {
  const before = base || lineupTotals(slots, ids, info);
  const roster = ids.filter((id) => id !== drop && id !== add);
  const after = lineupTotals(slots, [...roster, add], info);
  return after.map((t, i) => t - before[i]);
}

/** The drop that costs a roster the least (lineup first, then total projection). `protectedIds` are never suggested. */
export function bestDrop(slots: string[], ids: string[], info: Record<string, PlayerInfo>, add: string, protectedIds: Set<string> = new Set()) {
  const base = lineupTotals(slots, ids, info);
  let best: { id: string; gains: number[]; score: number } | null = null;
  for (const id of ids) {
    if (protectedIds.has(id) || !info[id]) continue;
    const gains = gainsFor(slots, ids, info, add, id, base);
    const score = weighted(gains) - 0.01 * sum(info[id].proj);
    if (!best || score > best.score) best = { id, gains, score };
  }
  return best;
}

/* ---------- bid history ---------- */

/** FAAB each roster had left at the start of a given scoring week, from the league's own transactions. */
export function budgetBefore(txs: Tx[], budget: number, rosterId: number, leg: number): number {
  let left = budget;
  for (const tx of txs) {
    if (tx.leg >= leg) continue;
    if (tx.type === "waiver" && tx.status === "complete" && tx.roster_ids?.[0] === rosterId) left -= Number(tx.settings?.waiver_bid || 0);
    for (const b of tx.waiver_budget || []) {
      if (b.sender === rosterId) left -= b.amount;
      if (b.receiver === rosterId) left += b.amount;
    }
  }
  return Math.max(1, left);
}

export type ShareBins = { edges: number[]; median: number[]; sd: number; n: number[]; samples: number };
const DEFAULT_SHARE = [0.004, 0.02, 0.06, 0.15, 0.3];
export const BIN_EDGES = [1.5, 4, 9, 18, Infinity];
const binOf = (gain: number) => BIN_EDGES.findIndex((edge) => gain < edge);

/**
 * How big a share of their remaining FAAB managers in this league bid for a player, by how many lineup points he would add.
 * Built from every claim (won or lost) so it reflects willingness to pay, not just prices that cleared.
 */
export function calibrateShare(claims: { gain: number; fraction: number }[]): ShareBins {
  const buckets: number[][] = BIN_EDGES.map(() => []);
  for (const c of claims) if (c.fraction > 0 && c.fraction <= 1.5) buckets[binOf(c.gain)].push(c.fraction);
  let run = 0;
  const median = buckets.map((list, i) => {
    const sorted = [...list].sort((a, b) => a - b);
    const m = sorted.length >= 4 ? pct(sorted, 0.5) : DEFAULT_SHARE[i];
    // Bigger upgrades never get a smaller share than smaller ones.
    run = Math.max(run, m);
    return run;
  });
  const logs = claims.filter((c) => c.fraction > 0).map((c) => Math.log(Math.max(1e-4, c.fraction)));
  const mean = logs.length ? sum(logs) / logs.length : 0;
  const sd = logs.length > 3 ? Math.min(1.1, Math.max(0.4, Math.sqrt(sum(logs.map((l) => (l - mean) ** 2)) / (logs.length - 1)) * 0.6)) : 0.6;
  return { edges: BIN_EDGES.map((e) => (Number.isFinite(e) ? e : 999)), median, sd, n: buckets.map((b) => b.length), samples: claims.length };
}

/** Per-manager bidding style: how their typical bid compares with the league norm. Clamped, and neutral with little history. */
export function aggression(claims: { roster: number; gain: number; fraction: number }[], bins: ShareBins): Map<number, number> {
  const ratios = new Map<number, number[]>();
  for (const c of claims) {
    if (c.fraction <= 0) continue;
    const norm = bins.median[binOf(c.gain)] || 0.01;
    (ratios.get(c.roster) || ratios.set(c.roster, []).get(c.roster)!).push(Math.log(c.fraction / norm));
  }
  const out = new Map<number, number>();
  ratios.forEach((list, roster) => { out.set(roster, list.length >= 4 ? Math.min(1.8, Math.max(0.55, Math.exp(sum(list) / list.length * 0.7))) : 1); });
  return out;
}

/* ---------- market: who wants a player, and what that rank cost in earlier weeks ---------- */

export type Rival = { rosterId: string; owner: string; gain: number; budget: number; mult: number };

/** Chance a rival with this much to gain actually puts in a claim. Assumed (claims not placed are invisible in Sleeper's data). */
export const participation = (gain: number) => (gain < 1.5 ? 0.03 : Math.min(0.92, 0.12 + 0.05 * gain));
/** What a rival would typically bid, before the market-wide price check below. Used to rank players by demand, not to set prices. */
export const typicalBid = (rival: Rival, bins: ShareBins) => Math.min(rival.budget, Math.max(1, bins.median[binOf(rival.gain)] * rival.budget * rival.mult));
/** How much rival money is chasing a player. Only its order matters. */
export const demand = (rivals: Rival[], bins: ShareBins) => sum(rivals.map((r) => participation(r.gain) * typicalBid(r, bins)));
export const rankOf = (value: number, list: number[]) => 1 + list.filter((v) => v > value).length;

/** One winning bid from a past weekly batch: how many managers could bid, whether the player came off the chopped team, his rank by price, and the price as a share of the median FAAB left. */
export type PriceSample = { year: string; leg: number; bidders: number; released: boolean; rank: number; ratio: number; bid: number };
const median = (list: number[]) => { const s = [...list].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
export const LADDER_DEPTH = 12;

/** Build the price ladder from a finished or in-progress guillotine league's own transactions. */
export function buildPriceBook(tx: Tx[], year: string, budget: number, teams: number, bidMin = 1): PriceSample[] {
  const chops = new Map<number, Tx>();
  tx.filter((t) => t.type === "chopped").forEach((t) => chops.set(t.leg, t));
  const lastLeg = Math.max(0, ...chops.keys());
  const out: PriceSample[] = [];
  for (let leg = 1; leg <= lastLeg; leg++) {
    const chopped = new Set<number>();
    chops.forEach((t, l) => { if (l <= leg) chopped.add(t.roster_ids?.[0] as number); });
    const alive = Array.from({ length: teams }, (_, i) => i + 1).filter((r) => !chopped.has(r));
    const mid = median(alive.map((r) => budgetBefore(tx, budget, r, leg)));
    const released = new Set(Object.keys(chops.get(leg)?.drops || {}));
    const wins = tx.filter((t) => t.type === "waiver" && t.status === "complete" && t.leg === leg);
    for (const isReleased of [true, false]) {
      const bids = wins.filter((t) => released.has(Object.keys(t.adds || {})[0]) === isReleased).map((t) => Number(t.settings?.waiver_bid || 0)).sort((a, b) => b - a);
      for (let k = 0; k < LADDER_DEPTH; k++) { const bid = bids[k] ?? bidMin; out.push({ year, leg, bidders: teams - leg, released: isReleased, rank: k + 1, ratio: bid / Math.max(1, mid), bid }); }
    }
  }
  return out;
}

/** Weighted price points for the player at this demand rank: nearby ranks and similar field sizes count most. */
export function priceSamples(book: PriceSample[], opts: { bidders: number; released: boolean; rank: number; medianBudget: number; ceiling: number }): { value: number; w: number }[] {
  const rankW: Record<number, number> = { [-1]: 0.25, 0: 0.5, 1: 0.25 };
  const out: { value: number; w: number }[] = [];
  for (const s of book) {
    if (s.released !== opts.released) continue;
    const d = s.rank - opts.rank;
    if (!(d in rankW) || Math.abs(s.bidders - opts.bidders) > 4) continue;
    const w = rankW[d] * Math.exp(-0.5 * ((s.bidders - opts.bidders) / 2.5) ** 2);
    if (w < 0.01) continue;
    out.push({ value: Math.min(opts.ceiling, Math.max(1, Math.round(Math.min(1.5, s.ratio) * opts.medianBudget))), w });
  }
  return out.sort((a, b) => a.value - b.value);
}
export const priceQuantile = (points: { value: number; w: number }[], p: number) => wq(points, p);
const wq = (points: { value: number; w: number }[], p: number) => {
  const total = sum(points.map((x) => x.w)); let run = 0;
  for (const x of points) { run += x.w; if (run >= p * total) return x.value; }
  return points.length ? points[points.length - 1].value : 1;
};

export type BidProjection = {
  /** Bid needed to win with about 50%, 75% and 90% confidence. A tie goes to the better waiver priority, so each is one above the winning price. */
  p50: number; p75: number; p90: number;
  /** Chance a bid of exactly `mine` FAAB wins. */
  winAtMax: number;
  tooExpensive: boolean;
  mainRivals: { owner: string; gain: number; budget: number; typical: number }[];
  confidence: "Low" | "Medium";
  /** Win chance at fixed bids, so a different FAAB total (after a trade, say) can be read off. */
  curve: { bid: number; win: number }[];
};
export const CURVE_BIDS = [3, 6, 10, 15, 20, 30, 40, 50, 65, 79, 100, 130, 160, 200, 260, 330, 420, 550];
export function winAt(curve: { bid: number; win: number }[], bid: number): number {
  if (!curve.length || bid <= 0) return 0;
  if (bid <= curve[0].bid) return curve[0].win * (bid / curve[0].bid);
  for (let i = 1; i < curve.length; i++) if (bid <= curve[i].bid) { const a = curve[i - 1], b = curve[i]; return a.win + ((b.win - a.win) * (bid - a.bid)) / (b.bid - a.bid); }
  return curve[curve.length - 1].win;
}

/** Players no rival needs go for next to nothing: this is the spread of uncontested winning bids in both seasons. */
const UNCONTESTED = [1, 1, 1, 1, 2, 2, 3, 5, 10].map((value) => ({ value, w: 1 }));

export function projectBid(points: { value: number; w: number }[] | null, rivals: Rival[], bins: ShareBins, mine: number, bidMin = 1, cap = Infinity): BidProjection {
  const pts = points && points.length ? points : UNCONTESTED;
  const total = sum(pts.map((x) => x.w));
  const below = (b: number) => sum(pts.filter((x) => x.value < b).map((x) => x.w)) / (total || 1);
  // Nobody can bid more than the richest interested rival has, so no recommendation goes above that.
  const need = (p: number) => Math.min(cap, Math.max(bidMin, wq(pts, p) + 1));
  const mainRivals = rivals.filter((r) => r.gain >= 1.5).sort((a, b) => typicalBid(b, bins) - typicalBid(a, bins)).slice(0, 3).map((r) => ({ owner: r.owner, gain: round1(r.gain), budget: r.budget, typical: Math.round(typicalBid(r, bins)) }));
  const p50 = need(0.5), p75 = need(0.75), p90 = need(0.9);
  return { p50, p75, p90, winAtMax: below(mine), tooExpensive: p50 > mine, mainRivals, confidence: points && total >= 6 ? "Medium" : "Low", curve: CURVE_BIDS.map((bid) => ({ bid, win: Math.round(below(bid) * 1000) / 1000 })) };
}

/* ---------- trading players for FAAB ---------- */

export type TradeOffer = { rosterId: string; owner: string; theirGain: number; faab: number; theirBudget: number };
/** Highest FAAB-for-player price seen in this league across two seasons (excluding the trade that included a draft pick). */
export const TRADE_CEILING = 70;
/**
 * What a rival might pay in a trade. A trade needs only one buyer, so it clears well below what a waiver fight would: 30 to 70 FAAB for useful players
 * in both seasons, a few FAAB late. The offer is a quarter of what that team would bid for the player on waivers, shrunk late in the season, capped at
 * the league's highest observed price and at a fifth of the buyer's FAAB.
 */
export function tradeOffers(rivals: Rival[], bins: ShareBins, timeFactor: number): TradeOffer[] {
  return rivals
    .filter((r) => r.gain >= 0.5)
    .map((r) => ({ rosterId: r.rosterId, owner: r.owner, theirGain: round1(r.gain), theirBudget: r.budget, faab: Math.max(1, Math.round(Math.min(TRADE_CEILING, 0.2 * r.budget, 0.25 * typicalBid(r, bins) * timeFactor))) }))
    .sort((a, b) => b.faab - a.faab);
}

/* ---------- drops when several claims land ---------- */

/** For claims added in order, the cheapest player to cut for each one (never one just added). */
export function dropPlan(slots: string[], roster: string[], info: Record<string, PlayerInfo>, adds: string[]) {
  let current = [...roster];
  const added = new Set<string>();
  const plan: { add: string; drop: string | null; change: number }[] = [];
  for (const add of adds) {
    if (!info[add]) continue;
    const before = weighted(lineupTotals(slots, current, info));
    let best: { id: string; score: number; after: number } | null = null;
    for (const id of current) {
      if (added.has(id) || !info[id]) continue;
      const after = weighted(lineupTotals(slots, [...current.filter((x) => x !== id), add], info));
      const score = after - 0.01 * sum(info[id].proj);
      if (!best || score > best.score) best = { id, score, after };
    }
    plan.push({ add, drop: best?.id || null, change: best ? best.after - before : 0 });
    current = best ? [...current.filter((x) => x !== best!.id), add] : [...current, add];
    added.add(add);
  }
  return plan;
}

function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* ---------- add / drop matrix ---------- */

/** Net lineup gain (weighted points over the next three weeks) at which an add-for-drop swap is worth doing. */
export const TIER_CUTS = [10, 5, 2];
export const tierOf = (net: number) => (net >= TIER_CUTS[0] ? 1 : net >= TIER_CUTS[1] ? 2 : net >= TIER_CUTS[2] ? 3 : 4);
export const TIER_LABEL = ["", "Do it", "Worth it", "Marginal", "Skip"];

/** What each roster player is worth to your lineup over the window, i.e. the points lost by cutting him with no replacement. */
export function dropCosts(slots: string[], roster: string[], info: Record<string, PlayerInfo>): Record<string, number> {
  const base = weighted(lineupTotals(slots, roster, info));
  const out: Record<string, number> = {};
  for (const id of roster) if (info[id]) out[id] = Math.max(0, base - weighted(lineupTotals(slots, roster.filter((x) => x !== id), info)));
  return out;
}

export type Matrix = { drops: { id: string; cost: number }[]; rows: { id: string; nets: Record<string, number>; best: { drop: string; net: number } | null }[] };
/** Net gain of every add-for-drop swap. Rows are sorted by their best swap, drops by how little they cost. */
export function buildMatrix(slots: string[], roster: string[], info: Record<string, PlayerInfo>, targetIds: string[]): Matrix {
  const costs = dropCosts(slots, roster, info);
  const drops = roster.filter((id) => info[id]).map((id) => ({ id, cost: costs[id] ?? 0 })).sort((a, b) => a.cost - b.cost);
  const base = lineupTotals(slots, roster, info);
  const rows = targetIds.filter((id) => info[id]).map((id) => {
    const nets: Record<string, number> = {};
    let best: { drop: string; net: number } | null = null;
    for (const d of drops) {
      const net = weighted(gainsFor(slots, roster, info, id, d.id, base));
      nets[d.id] = net;
      if (!best || net > best.net) best = { drop: d.id, net };
    }
    return { id, nets, best };
  }).sort((a, b) => (b.best?.net ?? -99) - (a.best?.net ?? -99));
  return { drops, rows };
}

/** The claims worth entering, in Sleeper order: cheapest drop first, then the best add for it. Swaps below the Marginal tier are left out. */
export function claimPairs(matrix: Matrix, minNet = TIER_CUTS[2], maxRows = 36): { add: string; drop: string; net: number }[] {
  const pairs: { add: string; drop: string; net: number }[] = [];
  for (const d of matrix.drops) for (const r of matrix.rows) if ((r.nets[d.id] ?? -99) >= minNet && pairs.length < maxRows) pairs.push({ add: r.id, drop: d.id, net: r.nets[d.id] });
  return pairs;
}

/* ---------- claim sheet (the Sleeper claims list, in order) ---------- */

export type SheetTarget = { id: string; curve: { bid: number; win: number }[]; p50: number; p75: number; p90: number };
export type SheetRow = { add: string; drop: string; bid: number; hit: number; net: number };
export type ClaimSheet = { rows: SheetRow[]; expected: number; landAny: number; chance: { id: string; win: number }[] };

/** Draw one rival top bid from a win-probability curve (the curve is P(rival top bid < bid)). */
function drawRivalMax(curve: { bid: number; win: number }[], u: number, v: number): number {
  if (!curve.length) return 1;
  for (let i = 0; i < curve.length; i++) {
    if (curve[i].win >= u) {
      const lo = i === 0 ? { bid: 0, win: 0 } : curve[i - 1];
      const span = curve[i].win - lo.win;
      return lo.bid + (span > 0 ? (curve[i].bid - lo.bid) * ((u - lo.win) / span) : 0);
    }
  }
  return curve[curve.length - 1].bid * (1 + 0.3 * v);
}

/**
 * Prices a list of add-for-drop claims. A claim wins when its bid beats the rival top bid, its add is not already won, its drop is still on the
 * roster and enough FAAB is left. Rival bids are drawn once per player per simulated week, so every row for a player faces the same competition.
 * Bids are tuned for expected lineup gain over the simulated weeks, then trimmed so no row bids more than it needs to.
 */
export function buildClaimSheet(opts: { slots: string[]; roster: string[]; info: Record<string, PlayerInfo>; targets: SheetTarget[]; pairs: { add: string; drop: string; net?: number }[]; budget: number; worlds?: number; seed?: number }): ClaimSheet {
  const targets = opts.targets.slice(0, 14);
  const budget = Math.max(0, Math.floor(opts.budget));
  const tIndex = new Map(targets.map((t, i) => [t.id, i]));
  const dropIds = Array.from(new Set(opts.pairs.map((p) => p.drop))).slice(0, 14);
  const dIndex = new Map(dropIds.map((id, i) => [id, i]));
  type R = { t: number; d: number; bid: number; net: number; add: string; drop: string };
  const base: R[] = opts.pairs.filter((p) => tIndex.has(p.add) && dIndex.has(p.drop)).slice(0, 40).map((p) => ({ t: tIndex.get(p.add)!, d: dIndex.get(p.drop)!, bid: 1, net: p.net ?? 0, add: p.add, drop: p.drop }));
  if (!base.length || budget < 1) return { rows: [], expected: 0, landAny: 0, chance: [] };
  const W = opts.worlds ?? 400;
  const random = mulberry32(opts.seed ?? 7);
  const M = Array.from({ length: W }, () => targets.map((t) => drawRivalMax(t.curve, random(), random())));
  const baseValue = weighted(lineupTotals(opts.slots, opts.roster, opts.info));
  const cache = new Map<string, number>();
  const outcome = (won: number, dropped: number) => {
    const key = won + ":" + dropped;
    let v = cache.get(key);
    if (v === undefined) {
      const removed = new Set(dropIds.filter((_, d) => (dropped >> d) & 1));
      const ids = [...opts.roster.filter((id) => !removed.has(id)), ...targets.filter((_, t) => (won >> t) & 1).map((t) => t.id)];
      v = weighted(lineupTotals(opts.slots, ids, opts.info)) - baseValue;
      cache.set(key, v);
    }
    return v;
  };
  const run = (rows: R[], detail?: { hit: number[]; chance: number[]; any: number }) => {
    let total = 0;
    for (let w = 0; w < W; w++) {
      let left = budget, won = 0, dropped = 0;
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (((won >> row.t) & 1) || ((dropped >> row.d) & 1) || row.bid > left || row.bid <= M[w][row.t]) continue;
        left -= row.bid; won |= 1 << row.t; dropped |= 1 << row.d;
        if (detail) { detail.hit[r]++; detail.chance[row.t]++; }
      }
      if (won) { total += outcome(won, dropped); if (detail) detail.any++; }
    }
    return total / W;
  };

  const grid = targets.map((t) => Array.from(new Set([1, 2, 3, 5, 8, 12, 17, 25, 35, 50, 65, 80, 100, 130, 160, 200, 260, 330, 420, 550, t.p50, t.p75, t.p90, budget].filter((b) => b >= 1 && b <= budget))).sort((a, b) => a - b));
  const seen = new Map<number, number>();
  const rows = base.map((r) => { const k = seen.get(r.t) || 0; seen.set(r.t, k + 1); return { ...r, bid: Math.min(budget, Math.max(1, Math.round(targets[r.t].p75 * 0.5 ** k))) }; });
  let value = run(rows);
  for (let sweep = 0; sweep < 3; sweep++) {
    let changed = false;
    for (let r = 0; r < rows.length; r++) {
      let bestBid = rows[r].bid, bestValue = value;
      for (const candidate of grid[rows[r].t]) {
        const old = rows[r].bid; rows[r].bid = candidate;
        const v = run(rows);
        rows[r].bid = old;
        if (v > bestValue + 1e-9) { bestValue = v; bestBid = candidate; }
      }
      if (bestBid !== rows[r].bid) { rows[r].bid = bestBid; value = bestValue; changed = true; }
    }
    if (!changed) break;
  }
  // Trim: drop each bid to the lowest value that keeps the expected gain the same.
  for (let r = 0; r < rows.length; r++) {
    for (const candidate of grid[rows[r].t]) {
      if (candidate >= rows[r].bid) break;
      const old = rows[r].bid; rows[r].bid = candidate;
      if (run(rows) >= value - 1e-9) break;
      rows[r].bid = old;
    }
  }
  const detail = { hit: rows.map(() => 0), chance: targets.map(() => 0), any: 0 };
  const expected = run(rows, detail);
  return { rows: rows.map((r, i) => ({ add: r.add, drop: r.drop, bid: r.bid, hit: detail.hit[i] / W, net: r.net })), expected, landAny: detail.any / W, chance: targets.map((t, i) => ({ id: t.id, win: detail.chance[i] / W })) };
}
