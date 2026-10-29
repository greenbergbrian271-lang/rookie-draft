// Manager Cards: who you play with, what they own, and how they behave. Pure functions over league data + transaction history.
import { buildStandings, findMine, isDynasty, isGuillotine, sortLeagues, teamLabel, type Intents, type LeagueData, type StandingRow, type TeamData, type WindowInfo } from "./in-season";

type Pick = { season: string; round: number };
export type LeagueTransactions = {
  leagueId: string;
  seasons: string[];
  trades: { season: string; week: number; created: number; owners: string[]; got: Record<string, string[]>; gave: Record<string, string[]>; picksIn: Record<string, Pick[]>; picksOut: Record<string, Pick[]> }[];
  moves: Record<string, { claims: number; freeAgents: number; faabSpent: number }>;
  players: Record<string, { name: string; position: string; age: number | null }>;
};

export type ManagerLeague = {
  leagueId: string;
  leagueName: string;
  leagueType: string;
  team: TeamData;
  standing: StandingRow;
  teams: number;
  window?: WindowInfo;
  claims: number;
  freeAgents: number;
  faabSpent: number;
  faabBudget: number | null;
  tradesThere: number;
  facingMeThisWeek: boolean;
  positionCounts: Record<string, number>;
  averageAge: number | null;
};

export type ManagerTag = { label: string; detail: string; tone: "good" | "warn" | "info" };
export type Exposure = { id: string; name: string; position: string; leagues: string[]; sharedWithMe: boolean };
export type TradeNote = { season: string; league: string; summary: string };

export type ManagerCard = {
  ownerId: string;
  name: string;
  avatar: string | null;
  leagues: ManagerLeague[];
  tags: ManagerTag[];
  tradeCount: number;
  tradesWithMe: number;
  picksIn: number;
  picksOut: number;
  avgAgeGot: number | null;
  avgAgeGave: number | null;
  partners: { name: string; count: number }[];
  recentTrades: TradeNote[];
  faabSpent: number;
  faabBudget: number;
  claims: number;
  exposure: Exposure[];
  sharedPlayers: Exposure[];
  seasonsCovered: string[];
};

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const roundName = (pick: Pick) => `${pick.season} R${pick.round}`;

export function buildManagerCards(leagues: LeagueData[], transactions: LeagueTransactions[], intents: Intents = {}): ManagerCard[] {
  const txByLeague = new Map(transactions.map((tx) => [tx.leagueId, tx]));
  const myOwnerIds = new Set<string>();
  const myPlayers = new Set<string>();
  const cards = new Map<string, ManagerCard>();
  const scoped = sortLeagues(leagues).filter((league) => league.ok);

  for (const league of scoped) {
    const mine = findMine(league);
    if (mine?.ownerId) myOwnerIds.add(mine.ownerId);
    if (mine && !mine.eliminated) mine.players.forEach((id) => myPlayers.add(id));
  }

  // Per-league medians let us call someone a "heavy" waiver user relative to their own league.
  const medianClaims = new Map<string, number>();
  for (const league of scoped) {
    const tx = txByLeague.get(league.id);
    medianClaims.set(league.id, median((league.teams || []).map((team) => tx?.moves[team.ownerId || ""]?.claims ?? 0)));
  }

  for (const league of scoped) {
    const tx = txByLeague.get(league.id);
    const mine = findMine(league);
    const standings = buildStandings(league, mine?.rosterId, intents);
    const myMatch = mine ? league.matchups?.find((m) => m.rosterId === mine.rosterId) : undefined;
    const opponentId = myMatch ? league.matchups?.find((m) => m.matchupId === myMatch.matchupId && m.rosterId !== myMatch.rosterId)?.rosterId : undefined;

    for (const team of league.teams || []) {
      const ownerId = team.ownerId || "";
      if (!ownerId || myOwnerIds.has(ownerId)) continue;
      const row = standings.find((item) => item.team.rosterId === team.rosterId);
      if (!row) continue;
      const card = cards.get(ownerId) || {
        ownerId, name: team.owner, avatar: team.avatar || null, leagues: [], tags: [], tradeCount: 0, tradesWithMe: 0, picksIn: 0, picksOut: 0,
        avgAgeGot: null, avgAgeGave: null, partners: [], recentTrades: [], faabSpent: 0, faabBudget: 0, claims: 0, exposure: [], sharedPlayers: [], seasonsCovered: [],
      };
      const moves = tx?.moves[ownerId] || { claims: 0, freeAgents: 0, faabSpent: 0 };
      const budget = Number(league.settings?.waiver_budget || 0);
      const players = team.playerDetails || [];
      const positionCounts: Record<string, number> = {};
      players.forEach((player) => { positionCounts[player.position] = (positionCounts[player.position] || 0) + 1; });
      const ages = players.filter((p) => ["QB", "RB", "WR", "TE"].includes(p.position) && typeof p.age === "number").map((p) => p.age as number);
      card.leagues.push({
        leagueId: league.id, leagueName: league.name, leagueType: league.type, team, standing: row, teams: standings.length,
        window: row.window, claims: moves.claims, freeAgents: moves.freeAgents, faabSpent: moves.faabSpent, faabBudget: budget > 0 ? budget : null,
        tradesThere: tx ? tx.trades.filter((trade) => trade.owners.includes(ownerId)).length : 0,
        facingMeThisWeek: Boolean(opponentId && opponentId === team.rosterId),
        positionCounts, averageAge: mean(ages),
      });
      card.claims += moves.claims;
      card.faabSpent += moves.faabSpent;
      if (budget > 0) card.faabBudget += budget;
      cards.set(ownerId, card);
    }
  }

  for (const card of cards.values()) {
    // ---- exposure: who he rosters across the leagues he shares with me ----
    const exposure = new Map<string, Exposure>();
    for (const entry of card.leagues) {
      for (const player of entry.team.playerDetails || []) {
        const existing = exposure.get(player.id) || { id: player.id, name: player.name, position: player.position, leagues: [], sharedWithMe: myPlayers.has(player.id) };
        existing.leagues.push(entry.leagueName);
        exposure.set(player.id, existing);
      }
    }
    const all = [...exposure.values()];
    card.exposure = all.filter((item) => item.leagues.length > 1).sort((a, b) => b.leagues.length - a.leagues.length || a.name.localeCompare(b.name)).slice(0, 8);
    card.sharedPlayers = all.filter((item) => item.sharedWithMe).sort((a, b) => a.name.localeCompare(b.name));

    // ---- trades (this season plus last season for dynasty leagues) ----
    const gotAges: number[] = [], gaveAges: number[] = [];
    const partnerCounts = new Map<string, number>();
    const notes: (TradeNote & { created: number })[] = [];
    const seasons = new Set<string>();
    for (const entry of card.leagues) {
      const tx = txByLeague.get(entry.leagueId);
      if (!tx) continue;
      tx.seasons.forEach((season) => seasons.add(season));
      const league = scoped.find((item) => item.id === entry.leagueId);
      for (const trade of tx.trades.filter((item) => item.owners.includes(card.ownerId))) {
        card.tradeCount += 1;
        const ids = (list: string[] | undefined) => list || [];
        const got = ids(trade.got[card.ownerId]), gave = ids(trade.gave[card.ownerId]);
        const inPicks = trade.picksIn[card.ownerId] || [], outPicks = trade.picksOut[card.ownerId] || [];
        card.picksIn += inPicks.length; card.picksOut += outPicks.length;
        got.forEach((id) => { const age = tx.players[id]?.age; if (age != null) gotAges.push(age); });
        gave.forEach((id) => { const age = tx.players[id]?.age; if (age != null) gaveAges.push(age); });
        for (const other of trade.owners.filter((owner) => owner !== card.ownerId)) {
          const partner = (league?.teams || []).find((team) => team.ownerId === other);
          const name = partner ? (myOwnerIds.has(other) ? "You" : partner.owner) : "Unknown";
          partnerCounts.set(name, (partnerCounts.get(name) || 0) + 1);
          if (myOwnerIds.has(other)) card.tradesWithMe += 1;
        }
        const label = (list: string[], picks: Pick[]) => [...list.map((id) => tx.players[id]?.name || id), ...picks.map(roundName)].join(", ") || "nothing";
        notes.push({ season: trade.season, league: entry.leagueName, created: trade.created, summary: `Got ${label(got, inPicks)}; gave ${label(gave, outPicks)}` });
      }
    }
    card.avgAgeGot = mean(gotAges);
    card.avgAgeGave = mean(gaveAges);
    card.partners = [...partnerCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 4);
    card.recentTrades = notes.sort((a, b) => b.created - a.created).slice(0, 4).map(({ season, league, summary }) => ({ season, league, summary }));
    card.seasonsCovered = [...seasons].sort().reverse();

    // ---- tendencies ----
    const tags: ManagerTag[] = [];
    const years = Math.max(1, card.seasonsCovered.length);
    if (card.tradeCount >= 3) tags.push({ label: "Active trader", detail: `${card.tradeCount} trades across ${card.leagues.length} shared league${card.leagues.length > 1 ? "s" : ""}.`, tone: "good" });
    else if (card.tradeCount === 0) tags.push({ label: "Rarely trades", detail: `No completed trades in the ${years > 1 ? "last two seasons" : "season so far"}.`, tone: "warn" });
    if (card.picksIn - card.picksOut >= 2) tags.push({ label: "Collects picks", detail: `Received ${card.picksIn} picks and sent ${card.picksOut}.`, tone: "info" });
    else if (card.picksOut - card.picksIn >= 2) tags.push({ label: "Sells picks", detail: `Sent ${card.picksOut} picks and received ${card.picksIn}.`, tone: "info" });
    if (card.avgAgeGot != null && card.avgAgeGave != null) {
      const diff = card.avgAgeGot - card.avgAgeGave;
      if (diff >= 1.5) tags.push({ label: "Buys veterans", detail: `Players acquired average ${card.avgAgeGot.toFixed(1)} years old vs ${card.avgAgeGave.toFixed(1)} given up.`, tone: "info" });
      else if (diff <= -1.5) tags.push({ label: "Buys youth", detail: `Players acquired average ${card.avgAgeGot.toFixed(1)} years old vs ${card.avgAgeGave.toFixed(1)} given up.`, tone: "info" });
    }
    if (card.faabBudget > 0) {
      const share = card.faabSpent / card.faabBudget;
      if (share >= 0.5) tags.push({ label: "Big FAAB spender", detail: `Has spent ${Math.round(share * 100)}% of the FAAB available across shared leagues.`, tone: "good" });
      else if (share <= 0.1) tags.push({ label: "Hoards FAAB", detail: `Has spent only ${Math.round(share * 100)}% of FAAB so far.`, tone: "warn" });
    }
    const heavy = card.leagues.filter((entry) => entry.claims >= Math.max(4, (medianClaims.get(entry.leagueId) || 0) * 1.5));
    if (heavy.length) tags.push({ label: "Waiver regular", detail: `Well above the league median for claims in ${heavy.map((entry) => entry.leagueName).join(", ")}.`, tone: "good" });
    const overlap = card.sharedPlayers.length;
    if (overlap >= 5) tags.push({ label: "Heavy overlap with you", detail: `Owns ${overlap} players you also roster.`, tone: "info" });
    if (card.exposure.length >= 3) tags.push({ label: "Concentrated exposure", detail: `${card.exposure.length} players on his rosters in more than one shared league.`, tone: "info" });
    card.tags = tags;
  }

  return [...cards.values()].sort((a, b) => b.leagues.length - a.leagues.length || a.name.localeCompare(b.name));
}

export { isDynasty, isGuillotine, teamLabel };
