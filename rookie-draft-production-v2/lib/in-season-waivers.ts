// Waiver / FAAB recommendations and guillotine chop odds. Advice only: nothing here places a claim in Sleeper.
import {
  guillotineBoard,
  playerFlag,
  SLOT_ELIGIBILITY,
  slotLabel,
  type LeagueData,
  type PlayerDetail,
  type TeamData,
} from "./in-season";

export type OutlookCandidate = { id: string; name: string; position: string; team: string; age: number | null; injury: string; proj: number[]; trend: number };
export type BidStats = {
  n: number; median: number; p25: number; p75: number; p90: number; max: number;
  byPosition: Record<string, { n: number; median: number; p75: number }>;
  recent: { player: string; amount: number; week: number }[];
};
export type WaiverProcessing = { weekday: string; time: string; share: number; n: number } | null;
export type OutlookLeague = {
  leagueId: string;
  /** Fantasy weeks the projections cover (the next three). */
  weeks: number[];
  rules: { budget: number; used: number; remaining: number; clearDays: number | null; daily: boolean; bidMin: number; tradeDeadlineWeek: number | null; rosterCapacity: number };
  processing: WaiverProcessing;
  /** Projection per horizon week for every player on my roster (active, IR and taxi). */
  myProjections: Record<string, number[]>;
  candidates: OutlookCandidate[];
  bids: BidStats | null;
  /** Dynasty leagues only: KeepTradeCut value for my roster and the candidates. */
  ktc?: Record<string, number>;
  error?: string;
};

/* ---------- lineup assignment ---------- */

export type ValuedPlayer = { id: string; position: string; value: number };

/** Best total a set of slots can score: greedy by value, accepting a player only if everyone chosen can still be placed. */
export function assignLineup(slots: string[], players: ValuedPlayer[]): { total: number; slotOf: Map<string, number>; owner: Map<number, string> } {
  const owner = new Map<number, string>();
  const byId = new Map(players.map((player) => [player.id, player]));
  const allowed = (slot: string) => SLOT_ELIGIBILITY[slot] || [slot];
  // Try the most specific slots first so a player is shown in "WR" before "FLEX" when either works.
  const order = slots.map((_, index) => index).sort((a, b) => allowed(slots[a]).length - allowed(slots[b]).length || a - b);
  const place = (id: string, seen: Set<number>): boolean => {
    const player = byId.get(id)!;
    for (const index of order) {
      if (seen.has(index) || !allowed(slots[index]).includes(player.position)) continue;
      seen.add(index);
      const holder = owner.get(index);
      if (holder === undefined || place(holder, seen)) { owner.set(index, id); return true; }
    }
    return false;
  };
  for (const player of [...players].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))) {
    if (owner.size >= slots.length) break;
    place(player.id, new Set());
  }
  const slotOf = new Map<string, number>();
  let total = 0;
  owner.forEach((id, index) => { slotOf.set(id, index); total += byId.get(id)!.value; });
  return { total, slotOf, owner };
}

/* ---------- recommendations ---------- */

export type BidSuggestion = { low: number; high: number; basis: string; affordable: boolean; note?: string };
export type WaiverRecommendation = {
  add: OutlookCandidate;
  drop: PlayerDetail | null;
  /** Lineup points gained in each horizon week, net of the drop. */
  gains: number[];
  total: number;
  /** Slot the add would fill in the first horizon week, if he starts. */
  startsAt: string | null;
  reasons: string[];
  bid: BidSuggestion;
};
export type WaiverPlan = {
  openSpots: number;
  faab: { remaining: number; budget: number };
  recommendations: WaiverRecommendation[];
  /** Why nothing was suggested, when the list is empty. */
  empty?: string;
};

export const MIN_NET_GAIN = 1;
/** Dynasty players at or above this KeepTradeCut value are never suggested as drops. Tunable: most of a dynasty bench sits between 1000 and 3500. */
export const DYNASTY_PROTECT_KTC = 2500;

const round1 = (value: number) => Math.round(value * 10) / 10;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export function suggestBid(total: number, rank: number, position: string, trend: number, bids: BidStats | null, rules: OutlookLeague["rules"]): BidSuggestion {
  const remaining = rules.remaining;
  if (remaining <= 0) return { low: 0, high: 0, basis: "No FAAB left in this league.", affordable: false };
  const position_ = bids?.byPosition[position];
  const stats = position_ && position_.n >= 8 ? { n: position_.n, median: position_.median, p25: bids!.p25, p75: position_.p75, p90: bids!.p90, label: `${position} claims` } : bids && bids.n >= 5 ? { n: bids.n, median: bids.median, p25: bids.p25, p75: bids.p75, p90: bids.p90, label: "claims" } : null;
  let tier: 0 | 1 | 2 = total >= 6 || (rank === 0 && total >= 4) ? 2 : total >= 3 ? 1 : 0;
  if (trend >= 100000 && tier < 2) tier = (tier + 1) as 1 | 2;
  let low: number, high: number, basis: string;
  if (stats) {
    [low, high] = tier === 2 ? [stats.p75, stats.p90] : tier === 1 ? [stats.median, stats.p75] : [Math.max(1, stats.p25), stats.median];
    basis = `Based on ${stats.n} winning ${stats.label} in this league this season (median $${Math.round(stats.median)}, 75th percentile $${Math.round(stats.p75)}).`;
  } else {
    const share = tier === 2 ? [0.08, 0.15] : tier === 1 ? [0.04, 0.08] : [0.01, 0.04];
    low = remaining * share[0]; high = remaining * share[1];
    basis = "This league has too little bid history, so this is a share of your remaining FAAB.";
  }
  low = Math.max(rules.bidMin || 1, Math.round(low));
  high = Math.max(low, Math.round(high));
  const affordable = remaining >= low;
  high = Math.min(high, remaining);
  low = Math.min(low, high);
  const note = !affordable ? `You have $${remaining} left, below the usual price.` : high > remaining * 0.4 ? `The top of this range is ${Math.round((high / remaining) * 100)}% of your remaining $${remaining}.` : trend >= 100000 ? "He is being added heavily across Sleeper, so expect competition." : undefined;
  return { low, high, basis, affordable, note };
}

export function buildWaiverPlan(league: LeagueData, team: TeamData, outlook: OutlookLeague): WaiverPlan {
  const slots = (league.rosterPositions || []).filter((slot) => slot !== "BN");
  const reserve = new Set(team.reserve || []), taxi = new Set(team.taxi || []);
  const details = new Map((team.playerDetails || []).map((player) => [player.id, player]));
  const active = (team.players || []).map((id) => details.get(id)).filter((p): p is PlayerDetail => Boolean(p) && !reserve.has(p!.id) && !taxi.has(p!.id));
  const weeks = outlook.weeks.length;
  const valueOf = (id: string, index: number) => outlook.myProjections[id]?.[index] ?? 0;
  const toValued = (players: PlayerDetail[], index: number): ValuedPlayer[] => players.map((p) => ({ id: p.id, position: p.position, value: valueOf(p.id, index) }));
  const base = Array.from({ length: weeks }, (_, i) => assignLineup(slots, toValued(active, i)).total);
  const openSpots = Math.max(0, outlook.rules.rosterCapacity - active.length);
  const dynasty = Boolean(outlook.ktc);
  const ktc = outlook.ktc || {};
  const faab = { remaining: outlook.rules.remaining, budget: outlook.rules.budget };
  const protectedPlayer = (p: PlayerDetail) => dynasty && (ktc[p.id] ?? 0) >= DYNASTY_PROTECT_KTC;
  const droppable = active.filter((p) => !playerFlag(p) && !protectedPlayer(p));

  const candidateAs = (c: OutlookCandidate): PlayerDetail => ({ id: c.id, name: c.name, position: c.position, team: c.team, status: "Active", injuryStatus: c.injury, age: c.age });
  const gainsWith = (c: OutlookCandidate, without?: string) => {
    const roster = without ? active.filter((p) => p.id !== without) : active;
    return Array.from({ length: weeks }, (_, i) => {
      const valued = [...toValued(roster, i), { id: c.id, position: c.position, value: c.proj[i] ?? 0 }];
      return assignLineup(slots, valued).total - base[i];
    });
  };

  // First pass ignores roster limits to find the candidates worth pricing, then pair the best with a drop if the roster is full.
  const screened = outlook.candidates
    .filter((c) => !playerFlag(candidateAs(c)))
    .map((c) => ({ c, free: gainsWith(c) }))
    .filter((item) => sum(item.free) >= MIN_NET_GAIN)
    .sort((a, b) => sum(b.free) - sum(a.free))
    .slice(0, 12);

  const recs: Omit<WaiverRecommendation, "bid">[] = [];
  for (const { c, free } of screened) {
    let gains = free, drop: PlayerDetail | null = null;
    if (openSpots <= 0) {
      let best: { player: PlayerDetail; gains: number[]; value: number } | null = null;
      for (const d of droppable) {
        const g = gainsWith(c, d.id);
        // Equal lineup impact: prefer losing the player with less depth value (projection, and KeepTradeCut value in dynasty).
        const value = sum(g) - 0.01 * sum(outlook.myProjections[d.id] || []) - (dynasty ? (ktc[d.id] ?? 0) / 5000 : 0);
        if (!best || value > best.value) best = { player: d, gains: g, value };
      }
      if (!best) continue;
      gains = best.gains; drop = best.player;
    }
    if (sum(gains) < MIN_NET_GAIN) continue;
    const roster0 = (drop ? active.filter((p) => p.id !== drop!.id) : active);
    const placed = assignLineup(slots, [...toValued(roster0, 0), { id: c.id, position: c.position, value: c.proj[0] ?? 0 }]);
    let slotIndex = placed.slotOf.get(c.id);
    // If he lands in a flex slot but could just as well hold his own position's slot (swapping with a player who fits the flex), say so.
    if (slotIndex !== undefined && (SLOT_ELIGIBILITY[slots[slotIndex]] || []).length > 1) {
      const specific = slots.findIndex((slot, index) => slot === c.position && placed.owner.get(index) !== undefined && (SLOT_ELIGIBILITY[slots[slotIndex!]] || []).includes(roster0.find((p) => p.id === placed.owner.get(index))?.position || ""));
      if (specific >= 0) slotIndex = specific;
    }
    const startsAt = slotIndex === undefined ? null : slotLabel(slots[slotIndex]);
    const reasons: string[] = [];
    const startWeeks = gains.map((g, i) => (g > 0.05 ? outlook.weeks[i] : null)).filter((w): w is number => w !== null);
    reasons.push(startWeeks.length ? `Improves your lineup in Week${startWeeks.length > 1 ? "s" : ""} ${startWeeks.join(", ")} by ${round1(sum(gains))} projected points in total${drop ? `, after losing ${drop.name}` : ""}.` : `Adds depth worth ${round1(sum(gains))} projected points.`);
    const noGame = c.proj.map((p, i) => (p <= 0 ? outlook.weeks[i] : null)).filter((w): w is number => w !== null);
    if (noGame.length) reasons.push(`No projection for Week${noGame.length > 1 ? "s" : ""} ${noGame.join(", ")} (bye or inactive).`);
    if (c.trend > 0) reasons.push(`${c.trend.toLocaleString("en-US")} adds on Sleeper in the last 24 hours.`);
    if (dynasty && ktc[c.id]) reasons.push(`KeepTradeCut value ${ktc[c.id]}.`);
    recs.push({ add: c, drop, gains, total: sum(gains), startsAt, reasons });
  }
  recs.sort((a, b) => b.total - a.total);
  const top = recs.slice(0, 6).map((r, index) => ({ ...r, bid: suggestBid(r.total, index, r.add.position, r.add.trend, outlook.bids, outlook.rules) }));
  const empty = top.length ? undefined
    : !outlook.candidates.length ? "No available players with projections were found."
    : openSpots <= 0 && !droppable.length ? "Your roster is full and every player is either injured or protected, so there is nothing safe to drop."
    : "No available player improves your lineup enough over the next three weeks.";
  return { openSpots, faab, recommendations: top, empty };
}

/* ---------- guillotine chop odds ---------- */

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Week-to-week volatility of a team's scores, clamped to a sensible range. */
export function teamSd(scores: number[] | undefined, fallback = 20): number {
  const played = (scores || []).filter((value) => value > 0);
  if (played.length < 3) return fallback;
  const mean = sum(played) / played.length;
  const sd = Math.sqrt(sum(played.map((value) => (value - mean) ** 2)) / (played.length - 1));
  return Math.min(35, Math.max(10, sd));
}

export type ChopOdds = { rosterId: string; lowest: number; bottomFour: number };

/** Monte Carlo estimate of who ends the week lowest. An estimate only: projections are noisy and each team's spread comes from its own history. */
export function simulateChop(rows: { id: string; mean: number; sd: number }[], sims = 5000, seed = 7): ChopOdds[] {
  const random = mulberry32(seed);
  const normal = () => Math.sqrt(-2 * Math.log(random() || 1e-12)) * Math.cos(2 * Math.PI * random());
  const lowest = new Map(rows.map((r) => [r.id, 0])), bottom = new Map(rows.map((r) => [r.id, 0]));
  for (let i = 0; i < sims; i++) {
    const scores = rows.map((r) => ({ id: r.id, score: r.mean + r.sd * normal() })).sort((a, b) => a.score - b.score);
    lowest.set(scores[0].id, lowest.get(scores[0].id)! + 1);
    scores.slice(0, 4).forEach((s) => bottom.set(s.id, bottom.get(s.id)! + 1));
  }
  return rows.map((r) => ({ rosterId: r.id, lowest: lowest.get(r.id)! / sims, bottomFour: bottom.get(r.id)! / sims }));
}

export function guillotineOdds(league: LeagueData, now: Date = new Date()): Map<string, ChopOdds> {
  const board = guillotineBoard(league, now);
  const pooled = teamSd(board.flatMap((row) => league.weeklyScores?.[row.rosterId] || []).length ? board.flatMap((row) => league.weeklyScores?.[row.rosterId] || []) : undefined, 20);
  const rows = board.map((row) => ({ id: row.rosterId, mean: row.projected, sd: teamSd(league.weeklyScores?.[row.rosterId], pooled) }));
  return new Map(simulateChop(rows).map((odds) => [odds.rosterId, odds]));
}
