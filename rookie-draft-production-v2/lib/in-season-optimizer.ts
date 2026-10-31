// Lineup optimizer: the highest-projection lineup the league's slots allow, with plain-language reasons for each change.
// Advice only. Nothing here edits a lineup in Sleeper.
import {
  buildLineup,
  findMine,
  livePlayerProjection,
  playerFlag,
  sortLeagues,
  SLOT_ELIGIBILITY,
  slotLabel,
  type InSeasonAlert,
  type LeagueData,
  type LineupSlot,
  type LineupView,
  type MatchupData,
  type PlayerDetail,
  type TeamData,
} from "./in-season";

export type OptimizerChange = {
  slot: string;
  label: string;
  out: PlayerDetail | null;
  outValue: number;
  in: PlayerDetail;
  inValue: number;
  delta: number;
  /** The player coming out is Out/IR/etc., so a player alert already covers this swap. */
  outFlagged: boolean;
  reason: string;
};

/** One player coming into the lineup and the player he replaces. Deltas add up to the lineup's total gain. */
export type OptimizerSwap = {
  in: PlayerDetail;
  out: PlayerDetail | null;
  inValue: number;
  outValue: number;
  delta: number;
  outFlagged: boolean;
  slot: string;
  reason: string;
};

export type OptimizerResult = {
  current: LineupView;
  suggested: LineupView;
  currentTotal: number;
  suggestedTotal: number;
  delta: number;
  /** Slot-by-slot differences (used to highlight rows). */
  changes: OptimizerChange[];
  /** Net story: who comes in for whom. */
  swaps: OptimizerSwap[];
  /** Players who change slots but stay in the lineup, e.g. "Malik Washington: FLEX to WR". */
  moves: string[];
  optimal: boolean;
  /** Players whose games have already been played; their slots cannot change. */
  lockedCount: number;
  note?: string;
};

const round1 = (value: number) => Math.round(value * 10) / 10;
const todayET = (now: Date) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayOf = (date: string | null | undefined) => (date ? DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()] : "");

function allowedFor(slot: string): string[] {
  return SLOT_ELIGIBILITY[slot] || [slot];
}

export function optimizeLineup(league: LeagueData, team: TeamData, matchup?: MatchupData, now: Date = new Date()): OptimizerResult {
  const current = buildLineup(league, team, matchup, now);
  const today = todayET(now);
  const details = new Map((team.playerDetails || []).map((player) => [player.id, player]));
  const startingIds = new Set(current.starters.map((row) => row.id).filter(Boolean) as string[]);
  const reserve = new Set(team.reserve || []);
  const taxi = new Set(team.taxi || []);

  const played = (id: string) => {
    const date = league.projections?.[id]?.date;
    return Boolean(date && date < today);
  };
  // Value of a player this week: starters use live numbers (actual once played); bench players use the weekly projection.
  const valueOf = (id: string) => {
    const points = matchup?.startersPoints?.[id];
    return livePlayerProjection(league, id, startingIds.has(id) ? points : undefined, now);
  };
  const flagged = (player: PlayerDetail | null | undefined) => (player ? playerFlag(player) : null);
  const isOut = (player: PlayerDetail | null | undefined) => flagged(player)?.severity === "critical";

  // Slots whose starter has already played are locked, as are those players.
  const slots = current.starters.map((row, index) => ({ index, slot: row.slot, row }));
  const lockedSlot = new Set<number>();
  slots.forEach(({ index, row }) => { if (row.id && played(row.id)) lockedSlot.add(index); });
  const free = slots.filter(({ index }) => !lockedSlot.has(index));

  // Candidates: anyone on the active roster who is not out, not already played, and not on IR/taxi.
  const pool = (team.playerDetails || []).filter((player) =>
    !reserve.has(player.id) && !taxi.has(player.id) && !isOut(player) && !played(player.id) && !(startingIds.has(player.id) && lockedSlot.has(slots.findIndex((s) => s.row.id === player.id))));

  // Greedy by value over a transversal matroid: add a player when the chosen set can still be matched to slots.
  const ranked = [...pool].sort((a, b) => valueOf(b.id) - valueOf(a.id) || Number(startingIds.has(b.id)) - Number(startingIds.has(a.id)) || a.name.localeCompare(b.name));
  const slotOwner = new Map<number, string>();
  const eligible = (player: PlayerDetail, slotIndex: number) => allowedFor(slots[slotIndex].slot).includes(player.position);
  const tryPlace = (playerId: string, seen: Set<number>, owner: Map<number, string>, candidates: Map<string, PlayerDetail>): boolean => {
    const player = candidates.get(playerId)!;
    for (const { index } of free) {
      if (!eligible(player, index) || seen.has(index)) continue;
      seen.add(index);
      const holder = owner.get(index);
      if (holder === undefined || tryPlace(holder, seen, owner, candidates)) { owner.set(index, playerId); return true; }
    }
    return false;
  };
  const candidates = new Map(pool.map((player) => [player.id, player]));
  const chosen: string[] = [];
  for (const player of ranked) {
    if (chosen.length >= free.length) break;
    const trial = new Map(slotOwner);
    if (tryPlace(player.id, new Set(), trial, candidates)) { slotOwner.clear(); trial.forEach((v, k) => slotOwner.set(k, v)); chosen.push(player.id); }
  }

  // Among assignments of the chosen players, prefer the one that keeps the most players in their current slots, so the change list stays short.
  const assign = new Map(slotOwner);
  const currentSlotOf = new Map<string, number>();
  free.forEach(({ index, row }) => { if (row.id) currentSlotOf.set(row.id, index); });
  const stays = (slotIndex: number, id: string) => (currentSlotOf.get(id) === slotIndex ? 1 : 0);
  for (let pass = 0, improved = true; improved && pass < 50; pass++) {
    improved = false;
    const indexes = [...assign.keys()];
    for (let i = 0; i < indexes.length; i++) {
      for (let j = i + 1; j < indexes.length; j++) {
        const a = indexes[i], b = indexes[j];
        const x = assign.get(a)!, y = assign.get(b)!;
        if (!eligible(candidates.get(x)!, b) || !eligible(candidates.get(y)!, a)) continue;
        if (stays(a, y) + stays(b, x) > stays(a, x) + stays(b, y)) { assign.set(a, y); assign.set(b, x); improved = true; }
      }
    }
  }
  const finalOwner = assign;

  // Build the suggested lineup in the same shape as the current one.
  const suggestedStarters: LineupSlot[] = current.starters.map((row, index) => {
    if (lockedSlot.has(index)) return row;
    const id = finalOwner.get(index) ?? null;
    const player = id ? details.get(id) || null : null;
    const projection = id ? league.projections?.[id] : undefined;
    return {
      slot: row.slot, label: slotLabel(row.slot), id, player,
      points: id ? matchup?.startersPoints?.[id] ?? null : null,
      proj: id && projection ? Math.round(valueOf(id) * 100) / 100 : id ? 0 : null,
      game: projection ? { opp: projection.opp, date: projection.date } : null,
    };
  });
  const used = new Set(suggestedStarters.map((row) => row.id).filter(Boolean) as string[]);
  const reservePlayers = current.reserve, taxiPlayers = current.taxi;
  const suggested: LineupView = {
    starters: suggestedStarters,
    bench: (team.playerDetails || []).filter((p) => !used.has(p.id) && !reserve.has(p.id) && !taxi.has(p.id)),
    reserve: reservePlayers,
    taxi: taxiPlayers,
    projectedTotal: suggestedStarters.reduce((sum, row) => sum + (row.proj ?? 0), 0),
  };

  // An Out player is worth nothing this week, so the current total does not count him.
  const currentValue = (row: LineupSlot) => (!row.id ? 0 : isOut(row.player) ? 0 : row.proj ?? valueOf(row.id));
  const suggestedValue = (row: LineupSlot) => (row.id ? row.proj ?? 0 : 0);
  const currentTotal = current.starters.reduce((sum, row) => sum + currentValue(row), 0);
  const suggestedTotal = suggestedStarters.reduce((sum, row) => sum + suggestedValue(row), 0);

  const changes: OptimizerChange[] = [];
  suggestedStarters.forEach((row, index) => {
    const before = current.starters[index];
    if (!row.id || row.id === before.id) return;
    const incoming = row.player!;
    const outgoing = before.player;
    const inValue = suggestedValue(row), outValue = currentValue(before);
    const delta = Math.round((inValue - outValue) * 100) / 100;
    const outFlag = flagged(outgoing);
    const inFlag = flagged(incoming);
    const parts: string[] = [];
    if (!outgoing) parts.push(`${row.label} is empty, and ${incoming.name} projects ${round1(inValue)}.`);
    else if (outFlag?.severity === "critical") parts.push(`${outgoing.name} is ${outFlag.label}, so he scores nothing this week. ${incoming.name} projects ${round1(inValue)}.`);
    else if (!league.projections?.[outgoing.id] && !played(outgoing.id)) parts.push(`${outgoing.name} has no game projected this week (likely a bye), so ${incoming.name} projects ${round1(inValue)} in his place.`);
    else parts.push(`${incoming.name} projects ${round1(inValue)} vs ${round1(outValue)} for ${outgoing.name} (${delta >= 0 ? "+" : ""}${round1(delta)}).`);
    const inDay = dayOf(league.projections?.[incoming.id]?.date);
    if (inDay) parts.push(`Plays ${inDay}${league.projections?.[incoming.id]?.opp ? ` vs ${league.projections![incoming.id].opp}` : ""}.`);
    if (inFlag) parts.push(`He is listed ${inFlag.label}, so check his status before kickoff.`);
    changes.push({ slot: row.slot, label: row.label, out: outgoing, outValue, in: incoming, inValue, delta, outFlagged: outFlag?.severity === "critical", reason: parts.join(" ") });
  });

  // Net view: who comes in, who goes out, and who merely changes slots.
  const currentIds = new Set(current.starters.map((row) => row.id).filter(Boolean) as string[]);
  const suggestedIds = new Set(suggestedStarters.map((row) => row.id).filter(Boolean) as string[]);
  const incoming = suggestedStarters.filter((row) => row.id && !currentIds.has(row.id) && !lockedSlot.has(suggestedStarters.indexOf(row))).sort((a, b) => suggestedValue(b) - suggestedValue(a));
  const outgoing = current.starters.filter((row, index) => !lockedSlot.has(index) && (!row.id || !suggestedIds.has(row.id)));
  const swaps: OptimizerSwap[] = [];
  const pool2 = [...outgoing];
  for (const row of incoming) {
    const player = row.player!;
    let pickIndex = pool2.findIndex((candidate) => candidate.player?.position === player.position);
    if (pickIndex < 0) pickIndex = pool2.findIndex((candidate) => !candidate.id);
    if (pickIndex < 0) pickIndex = pool2.length ? 0 : -1;
    const before = pickIndex >= 0 ? pool2.splice(pickIndex, 1)[0] : null;
    const outgoingPlayer = before?.player ?? null;
    const inValue = suggestedValue(row), outValue = before ? currentValue(before) : 0;
    const swapDelta = Math.round((inValue - outValue) * 100) / 100;
    const outFlag = flagged(outgoingPlayer), inFlag = flagged(player);
    const parts: string[] = [];
    if (!outgoingPlayer) parts.push(`${row.label} is empty, and ${player.name} projects ${round1(inValue)}.`);
    else if (outFlag?.severity === "critical") parts.push(`${outgoingPlayer.name} is ${outFlag.label}, so he scores nothing this week. ${player.name} projects ${round1(inValue)}.`);
    else if (!league.projections?.[outgoingPlayer.id] && !played(outgoingPlayer.id)) parts.push(`${outgoingPlayer.name} has no game projected this week (likely a bye), so ${player.name} projects ${round1(inValue)} in his place.`);
    else parts.push(`${player.name} projects ${round1(inValue)} vs ${round1(outValue)} for ${outgoingPlayer.name} (${swapDelta >= 0 ? "+" : ""}${round1(swapDelta)}).`);
    const day = dayOf(league.projections?.[player.id]?.date);
    if (day) parts.push(`Plays ${day}${league.projections?.[player.id]?.opp ? ` vs ${league.projections![player.id].opp}` : ""}.`);
    if (inFlag) parts.push(`He is listed ${inFlag.label}, so check his status before kickoff.`);
    swaps.push({ in: player, out: outgoingPlayer, inValue, outValue, delta: swapDelta, outFlagged: outFlag?.severity === "critical", slot: row.label, reason: parts.join(" ") });
  }
  const moves: string[] = [];
  suggestedStarters.forEach((row, index) => {
    const before = current.starters.findIndex((c) => c.id && c.id === row.id);
    if (row.id && before >= 0 && before !== index && !lockedSlot.has(index)) moves.push(`${row.player!.name}: ${current.starters[before].label} to ${row.label}`);
  });

  const delta = Math.round((suggestedTotal - currentTotal) * 100) / 100;
  const hasProjections = Object.keys(league.projections || {}).length > 0;
  return {
    current, suggested, currentTotal: round1(currentTotal), suggestedTotal: round1(suggestedTotal), delta, changes, swaps, moves,
    optimal: changes.length === 0 || delta < 0.05, lockedCount: lockedSlot.size,
    note: hasProjections ? undefined : "Projections are unavailable right now, so no lineup advice is shown.",
  };
}

/** One queue alert per league when a non-injury change is worth at least `minDelta` projected points. */
export function buildLineupAlerts(leagues: LeagueData[], minDelta = 1, now: Date = new Date()): InSeasonAlert[] {
  const alerts: InSeasonAlert[] = [];
  for (const league of sortLeagues(leagues)) {
    if (!league.ok || league.eliminated || league.status !== "in_season") continue;
    const mine = findMine(league);
    if (!mine || mine.eliminated) continue;
    const matchup = league.matchups?.find((m) => m.rosterId === mine.rosterId);
    const result = optimizeLineup(league, mine, matchup, now);
    // Swaps for Out/IR starters already have their own player alert, so only count the rest here.
    const real = result.swaps.filter((swap) => !swap.outFlagged && swap.delta > 0);
    const delta = Math.round(real.reduce((sum, swap) => sum + swap.delta, 0) * 100) / 100;
    if (!real.length || delta < minDelta) continue;
    alerts.push({
      id: `lineup:${league.id}`, kind: "lineup", severity: delta >= 5 ? "high" : "watch",
      title: `${league.name}: a lineup change is worth +${delta.toFixed(1)} projected points`,
      detail: `${real.length} change${real.length === 1 ? "" : "s"} would raise your projected total from ${result.currentTotal.toFixed(1)} to ${(result.currentTotal + delta).toFixed(1)}.`,
      details: [...real.map((swap) => `Start ${swap.in.name} in place of ${swap.out?.name ?? "an empty slot"}. ${swap.reason}`), ...(result.moves.length ? [`Slot moves needed: ${result.moves.join("; ")}.`] : [])],
      quality: Math.max(...real.map((swap) => swap.inValue)),
      leagues: [{ id: league.id, name: league.name, type: league.type }],
    });
  }
  return alerts;
}
