// Guillotine waiver strategy: who to add, what it takes to win the claim, and which players could be traded for FAAB.
// Advice only: nothing here places a claim or proposes a trade in Sleeper. Every number is an estimate and is labelled as one.
import { assignLineup, type ValuedPlayer } from "./in-season-waivers";

/** Next three fantasy weeks count less the further out they are: injuries and byes make later weeks less certain. */
export const HORIZON_WEIGHTS = [1, 0.8, 0.6];

export type PlayerInfo = { id: string; name: string; position: string; team: string; injury: string; age: number | null; proj: number[]; byeWeeks: number[] };
export type GRoster = { rosterId: string; owner: string; isMine: boolean; eliminated: boolean; players: string[]; faab: number; waiverPosition: number };
export type Tx = { type: string; status: string; leg: number; created: number; roster_ids?: number[]; adds?: Record<string, number> | null; drops?: Record<string, number> | null; settings?: { waiver_bid?: number; seq?: number } | null; waiver_budget?: { amount: number; sender: number; receiver: number }[] };

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

/* ---------- competing-bid simulation ---------- */

function mulberry32(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export type Rival = { rosterId: string; owner: string; gain: number; budget: number; mult: number };

/** Chance a rival with this much to gain actually puts in a claim. Assumed (claims not placed are invisible in Sleeper's data). */
export const participation = (gain: number) => (gain < 1.5 ? 0.03 : Math.min(0.92, 0.12 + 0.05 * gain));
/** A rival's typical bid before randomness. */
export const typicalBid = (rival: Rival, bins: ShareBins) => Math.min(rival.budget, Math.max(1, bins.median[binOf(rival.gain)] * rival.budget * rival.mult));

/** Simulated highest rival bid, one sample per simulation. */
export function simulateRivalMax(rivals: Rival[], bins: ShareBins, sims = 3000, seed = 11): number[] {
  const random = mulberry32(seed);
  const normal = () => Math.sqrt(-2 * Math.log(random() || 1e-12)) * Math.cos(2 * Math.PI * random());
  const out: number[] = [];
  for (let i = 0; i < sims; i++) {
    let top = 0;
    for (const r of rivals) {
      if (random() > participation(r.gain)) continue;
      const bid = Math.min(r.budget, Math.max(1, Math.round(typicalBid(r, bins) * Math.exp(bins.sd * normal()))));
      if (bid > top) top = bid;
    }
    out.push(top);
  }
  return out.sort((a, b) => a - b);
}

export type BidProjection = {
  /** Bid needed to win with about 50%, 75% and 90% confidence. Ties go to the better waiver priority, so the bid is one above the rival total. */
  p50: number; p75: number; p90: number;
  /** Chance a bid of exactly `mine` FAAB wins. */
  winAtMax: number;
  /** True when even a 50% bid is out of reach. */
  tooExpensive: boolean;
  /** Rivals most likely to push the price up. */
  mainRivals: { owner: string; gain: number; budget: number; typical: number }[];
  confidence: "Low" | "Medium";
  /** Chance a bid of each size wins, so a different FAAB total (after a trade, say) can be read off without re-running anything. */
  curve: { bid: number; win: number }[];
};
export const CURVE_BIDS = [5, 15, 30, 50, 79, 100, 130, 160, 200, 260, 330, 420, 550];
/** Win chance at an arbitrary bid, interpolated from the curve. */
export function winAt(curve: { bid: number; win: number }[], bid: number): number {
  if (!curve.length || bid <= 0) return 0;
  if (bid <= curve[0].bid) return curve[0].win * (bid / curve[0].bid);
  for (let i = 1; i < curve.length; i++) if (bid <= curve[i].bid) { const a = curve[i - 1], b = curve[i]; return a.win + ((b.win - a.win) * (bid - a.bid)) / (b.bid - a.bid); }
  return curve[curve.length - 1].win;
}
export function projectBid(rivals: Rival[], bins: ShareBins, mine: number, bidMin = 1): BidProjection {
  const samples = simulateRivalMax(rivals, bins);
  const need = (p: number) => Math.max(bidMin, pct(samples, p) + 1);
  const winAtMax = samples.length ? samples.filter((s) => s < mine).length / samples.length : 0;
  const mainRivals = rivals.filter((r) => r.gain >= 1.5).sort((a, b) => typicalBid(b, bins) - typicalBid(a, bins)).slice(0, 3).map((r) => ({ owner: r.owner, gain: round1(r.gain), budget: r.budget, typical: Math.round(typicalBid(r, bins)) }));
  const p50 = need(0.5), p75 = need(0.75), p90 = need(0.9);
  const curve = CURVE_BIDS.map((bid) => ({ bid, win: samples.length ? Math.round((samples.filter((s) => s < bid).length / samples.length) * 1000) / 1000 : 0 }));
  return { p50, p75, p90, winAtMax, tooExpensive: p50 > mine, mainRivals, confidence: bins.samples >= 80 ? "Medium" : "Low", curve };
}

/* ---------- trading players for FAAB ---------- */

export type TradeOffer = { rosterId: string; owner: string; theirGain: number; faab: number; theirBudget: number };
/**
 * FAAB a rival might pay for a player. Anchored on what they would bid for him on waivers, discounted because a trade needs
 * two parties to agree, and capped by the 30 to 70 FAAB prices the league's own FAAB-for-player trades have cleared at.
 */
export function tradeOffers(rivals: Rival[], bins: ShareBins, ceiling = 120): TradeOffer[] {
  return rivals
    .filter((r) => r.gain >= 1.5)
    .map((r) => ({ rosterId: r.rosterId, owner: r.owner, theirGain: round1(r.gain), theirBudget: r.budget, faab: Math.round(Math.min(ceiling, r.budget * 0.35, Math.max(5, 0.5 * typicalBid(r, bins)))) }))
    .filter((o) => o.faab >= 5)
    .sort((a, b) => b.faab - a.faab);
}
