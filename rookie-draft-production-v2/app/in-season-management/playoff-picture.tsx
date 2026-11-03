"use client";

import { teamLabel, type PlayoffPairing, type PlayoffPicture as Picture, type StandingRow } from "@/lib/in-season";
import { ManagerLink } from "./league-nav";
import css from "./playoff-picture.module.css";

const TIER_TEXT = { upper: "Upper bracket (double elimination)", lower: "Lower bracket (single elimination)", out: "Outside the playoffs" } as const;
const signed = (value: number) => `${value > 0 ? "+" : ""}${Number.isInteger(value) ? value : value.toFixed(1)}`;

function Side({ row, align, onOpenManager }: { row: StandingRow; align?: "right"; onOpenManager?: (id: string) => void }) {
  return (
    <div className={`${css.team} ${align === "right" ? css.right : ""}`}>
      <b>#{row.rank}</b>
      {row.isMine ? <strong>{teamLabel(row.team)}</strong> : <ManagerLink ownerId={row.team.ownerId} onOpen={onOpenManager}>{teamLabel(row.team)}</ManagerLink>}
      <small>{row.wins}-{row.losses}{row.ties ? `-${row.ties}` : ""} · {row.pf.toFixed(1)} PF</small>
    </div>
  );
}

function Pairings({ items, onOpenManager }: { items: PlayoffPairing[]; onOpenManager?: (id: string) => void }) {
  return (
    <>
      {items.map((item) => (
        <div className={`${css.pairing} ${item.mine ? css.mine : ""}`} key={`${item.high.team.rosterId}-${item.low.team.rosterId}`}>
          <Side row={item.high} onOpenManager={onOpenManager} /><span className={css.vs}>vs</span><Side row={item.low} align="right" onOpenManager={onOpenManager} />
        </div>
      ))}
    </>
  );
}

export default function PlayoffPicture({ picture, onOpenManager }: { picture: Picture; onOpenManager?: (id: string) => void }) {
  const { format, mine } = picture;
  return (
    <section className={css.picture} aria-label="Playoff picture">
      <div className={css.kicker}>Playoff picture</div>
      <h4>How the playoffs work here</h4>
      <p className={css.lede}>{format.teams} teams make it. Seeds 1–{format.topTier} play a double-elimination bracket and seeds {format.topTier + 1}–{format.teams} play single elimination. Matchups below show where each team would land if the season ended today.</p>

      {mine && (
        <div className={css.status}>
          <span className={css[mine.tier]}>You are seed {mine.rank}: {TIER_TEXT[mine.tier]}</span>
          {mine.winsVsFirstOut != null && mine.rank <= format.teams && <span>{mine.winsVsFirstOut === 0 ? "Level on wins with" : `${signed(mine.winsVsFirstOut)} wins vs`} the first team out</span>}
          {mine.winsVsFirstOut != null && mine.rank > format.teams && <span>{mine.winsVsFirstOut === 0 ? "Level on wins with" : `${signed(mine.winsVsFirstOut)} wins vs`} the first team out</span>}
          {mine.winsVsTopTier != null && <span>{mine.rank <= format.topTier ? `${signed(mine.winsVsTopTier)} wins vs seed ${format.topTier + 1}` : `${signed(mine.winsVsTopTier)} wins vs seed ${format.topTier}`}</span>}
        </div>
      )}

      <div className={css.rounds}>
        <div className={css.round}>
          <h5>Round 1</h5>
          <p>Playoff week 1.</p>
          <div className={css.bracket}>
            <div className={`${css.bracketTitle} ${css.upperTitle}`}>Upper bracket <span>1 v 4 · 2 v 3</span></div>
            <Pairings items={picture.upper} onOpenManager={onOpenManager} />
            <div className={`${css.rule} ${css.advance}`}>Winners go straight to the Final. Losers drop to Round 2.</div>
          </div>
          <div className={css.bracket}>
            <div className={`${css.bracketTitle} ${css.lowerTitle}`}>Lower bracket <span>5 v 8 · 6 v 7</span></div>
            <Pairings items={picture.lower} onOpenManager={onOpenManager} />
            <div className={`${css.rule} ${css.cut}`}>Winners move to Round 2. Losers are eliminated.</div>
          </div>
        </div>
        <div className={css.round}>
          <h5>Round 2</h5>
          <p>Four-team scoring round.</p>
          <ul className={css.slots}><li>The 2 upper-bracket losers</li><li>The 2 lower-bracket winners</li></ul>
          <div className={`${css.rule} ${css.advance}`}>Top 2 scorers advance to the Final.</div>
          <div className={`${css.rule} ${css.cut}`}>Bottom 2 scorers are eliminated.</div>
        </div>
        <div className={css.round}>
          <h5>Final</h5>
          <p>Four-team round robin.</p>
          <ul className={css.slots}><li>The 2 upper-bracket winners</li><li>The 2 teams that advanced from Round 2</li></ul>
        </div>
      </div>
      <p className={css.note}>Seeds follow the standings below (wins, then points for). Sleeper doesn&rsquo;t track this bracket, so it is based on the rules you described.</p>
    </section>
  );
}
