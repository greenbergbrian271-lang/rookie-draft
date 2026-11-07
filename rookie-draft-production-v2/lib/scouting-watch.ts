// Shared by Scouting Tools > New Player Watched and Game Notes > Add Unwatched Players.
// "Active profile" = the player is on the position scouting tabs, i.e. scouting_status === "WATCHED".

export type DbPlayer = {
  id: string | number;
  name: string;
  position: string;
  college?: string | null;
  draft_class: number;
  scouting_status: string;
};

export type NotePlayer = { name: string; position: string; college: string; key: string };

/** "Harold Fannin Jr." and "Harold Fannin" resolve to the same key. */
export function nameKey(raw: unknown) {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/[.,'’]/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv|v)$/, "")
    .replace(/[^a-z0-9]/g, "");
}

const POSITION_ALIASES: Record<string, string> = { QB: "QB", RB: "RB", HB: "RB", WR: "WR", TE: "TE" };

/**
 * Reads the player lines out of a game note. A player line is a top-level bullet such as
 * "• #12 WR Jeremiah Smith". Plain lines are treated as the team heading above the bullets;
 * "◦" lines are sub-notes and are ignored.
 */
export function parseGameNotePlayers(notes: string): NotePlayer[] {
  let team = "";
  const found: NotePlayer[] = [];
  for (const raw of String(notes || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[◦▪‣]/.test(line)) continue;
    const bullet = line.match(/^[•\-*]\s*(.+)$/);
    if (!bullet) {
      team = line.replace(/[:：]\s*$/, "");
      continue;
    }
    const m = bullet[1].match(/^(?:#?\d{1,3}\s+)?(QB|RB|HB|WR|TE)\b[.:]?\s+(.+)$/i);
    if (!m) continue;
    const name = m[2]
      .split(/\s+[-–—]\s+|\s*\(|\s*:\s/)[0]
      .trim();
    const key = nameKey(name);
    if (!key || found.some((p) => p.key === key)) continue;
    found.push({ name, position: POSITION_ALIASES[m[1].toUpperCase()], college: team, key });
  }
  return found;
}

export type NoteMatch = {
  toAdd: DbPlayer[];
  hasProfile: DbPlayer[];
  onMaybe: DbPlayer[];
  finished: DbPlayer[];
  notFound: NotePlayer[];
};

/** Splits the players listed in a note by whether they already have an active scouting profile. */
export function matchNotePlayers(listed: NotePlayer[], db: DbPlayer[], draftClass: number): NoteMatch {
  const pool = db.filter((p) => p.draft_class === draftClass);
  const out: NoteMatch = { toAdd: [], hasProfile: [], onMaybe: [], finished: [], notFound: [] };
  const seen = new Set<string>();
  for (const n of listed) {
    const same = pool.filter((p) => nameKey(p.name) === n.key);
    const hit =
      same.find((p) => p.position === n.position && nameKey(p.college) === nameKey(n.college)) ||
      same.find((p) => p.position === n.position) ||
      same[0];
    if (!hit) {
      out.notFound.push(n);
      continue;
    }
    const id = String(hit.id);
    if (seen.has(id)) continue;
    seen.add(id);
    if (hit.scouting_status === "WATCHED") out.hasProfile.push(hit);
    else if (hit.scouting_status === "MAYBE") out.onMaybe.push(hit);
    else if (hit.scouting_status === "FINISHED") out.finished.push(hit);
    else out.toAdd.push(hit);
  }
  return out;
}

const defaultsFor = (position: string) =>
  position === "QB"
    ? { "Injury Concerns": "No", "Off-Field?": "No", "All Star Game?": "None" }
    : position === "TE"
      ? { "Special Teams": "No", "Injury Concerns": "No", "Off-Field?": "No", "All Star Game?": "None" }
      : { "Special Teams?": "No", "Injury Concerns": "No", "Off-Field?": "No", "All Star Game?": "None" };

/**
 * Puts players on their position scouting page: marks them WATCHED and seeds the default evaluation rows.
 * Same steps New Player Watched has always used. Never throws; reports per-player failures instead.
 */
export async function addPlayersToScouting(players: Pick<DbPlayer, "id" | "name" | "position">[]) {
  const added: typeof players = [];
  const failed: { name: string; message: string }[] = [];
  for (const p of players) {
    try {
      const r = await fetch("/api/players", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: p.id, status: "WATCHED" }),
      });
      if (!r.ok) throw new Error("Could not add " + p.name + " to scouting.");
      await Promise.all(
        Object.entries(defaultsFor(p.position)).map(([category, commentary]) =>
          fetch("/api/evaluations", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ playerId: p.id, category, value: null, commentary }),
          }),
        ),
      );
      added.push(p);
    } catch (e: any) {
      failed.push({ name: p.name, message: e?.message || "Could not add " + p.name + "." });
    }
  }
  if (added.length && typeof window !== "undefined") window.dispatchEvent(new Event("rookie-draft:players-changed"));
  return { added, failed };
}
