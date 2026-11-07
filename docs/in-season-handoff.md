# In-Season Management: handoff and next steps

Last updated: 2026-11-01. Tracks GitHub issue #44 (Sleeper In-Season Management). Written so a new session can continue with no other context.

## 1. Where things stand

### Production (what is live)
- Production is **not** built from `main`. It is built from release branches deployed with the Vercel connector. The live deployment is from `release/lineup-optimizer-20261031` (commit `c3088ad`), which stacks on `release/niskayuna-playoffs-20261030` (`898c51f`), which stacks on the homepage / Game Notes branch `feature/homepage-split-auto-selection-20261030` (`84a4d30`).
- `main` on GitHub is **stale** (commit `0a3640c`). **Never push to `main` to publish.** Doing so redeploys production without the homepage and Game Notes work.
- Live in-season features: data layer for all 7 leagues, action queue (grouped alerts, Auto-Sub vs swap advice, IR rules, filters, dismiss until Tuesday, hide), Lineups with opponent lineup and the lineup optimizer, League Overview with standings, rooting guide, Contend/Rebuild declaration and the Niskayuna playoff bracket (weeks 15-17), Overview snapshot cards (projected win/lose, guillotine zones), Manager Cards.
- Not live: Phase 3 Waivers & Guillotine rebuild, Player Intelligence, the Phase 2 leftovers below.

### How to publish safely (the process that has worked)
1. Check the latest production deployment: Vercel `list_deployments` with `target: production`, and note its branch and commit. Another session may have deployed since.
2. Branch from that exact commit (fetch the branch), then `cherry-pick` only the commits for the pages in scope. Check `git diff --stat <production commit> HEAD` touches only the intended files.
3. Push the release branch (not `main`). Wait for the preview build, fetch the page on the preview URL to confirm.
4. Publish with Vercel `create_deployment`: `deploymentId` = the READY preview deployment, `target: "production"`, `forceNew: "1"`. This makes a fresh production build with production env vars. The previous production deployment remains a rollback candidate.
5. Vercel authentication blocks the connector from fetching production URLs, so verify on the preview and ask the user to open production.

### Workflow the user expects
Build in a preview branch, share the preview link, wait for approval, then publish. Only change the pages the user names; the user has said not to touch the homepage or Game Notes. Keep updates short (the user is often on mobile). A GitHub fine-grained token is pasted per session and is never stored; ask the user to revoke it afterwards. The token currently has Contents write but **not** Issues or Pull requests write.

### Known issues (not caused by this work)
- `npm run test:regression` fails on production's own code (an assertion about `app/api/college-football/route.ts` expecting `fresh?null:await cacheGet`, changed by the homepage / Game Notes release). Typecheck, `npm run test:unit` and the build pass.
- Issue #44 was auto-closed when PR #45 merged. It should be reopened and updated (needs Issues write on the token). Update text: `issue-44-production-update.md` (also pasted in the previous session's outputs).

## 2. This branch: `feature/phase2-leftovers-phase3`

Base: production commit `c3088ad`. **Preview only; nothing here is in production.** Contents so far are the data layer and tested logic; **no page changes yet** (no UI is wired), so the preview looks identical to production.

### Done
- `lib/espn-nfl-schedule.ts`: ESPN scoreboard to schedule (kickoff, home/away, indoor, forecast text and temperature, game state, bye = `null`). Team codes follow Sleeper (`WSH` to `WAS`). Bare numeric weather text is ignored.
- `lib/in-season-schedule.ts`: `hasKickedOff`, `weatherFlag`, `byeWeeks`, `buildWeatherAlerts` (one alert per game, grouped by player, only for not-started outdoor games with rain/snow/storm/wind text or 25F or colder; ESPN gives no wind speed).
- `lib/in-season-waivers.ts`: `assignLineup` (max-value slot assignment), `buildWaiverPlan` (pickups ranked by lineup gain over the next three weeks, drop chosen to minimise loss, injured players never dropped, dynasty players at KeepTradeCut 2500 or above protected), `suggestBid` (FAAB ranges from the league's own winning-bid percentiles, with a share-of-budget fallback), `simulateChop` / `guillotineOdds` (seeded Monte Carlo, per-team spread from its own weekly scores).
- `app/api/in-season/outlook/route.ts`: one endpoint with everything above for the next three weeks plus, per league: FAAB budget / used / remaining, clear days, daily waivers, trade deadline, roster capacity, observed waiver processing time (Eastern), my roster's projections, free-agent candidate pool (top per position, with Sleeper 24h trending adds), bid statistics, and KeepTradeCut values (dynasty only).
- `lib/sleeper-projections.ts`: projection cache now holds several weeks.
- `action-queue.tsx`: supports `details` lines ("See the changes") used by lineup and weather alerts.
- Unit tests for all of the above in `scripts/in-season.test.mjs` (`npm run test:unit`).

### Verified against real data (preview, 2026-11-01)
- ESPN returns kickoff times, indoor flags, forecasts and byes for weeks 8-11. Week 8 byes are NYG, NO, HOU, SF. Thursday games show `state: "post"`.
- Sleeper projections work for future weeks (3 fetches per request).
- All 7 leagues use FAAB. Observed processing: Niskayuna Wed ~3:15 AM ET, Guillotine Mania Wed ~9:00 AM, Last Man Standing Wed ~8:00 AM, the others Wed ~3:00 AM. Bid history per league: 22 to 189 winning bids.
- KeepTradeCut values are returned for the four dynasty leagues.

### Still to build (in this order)
1. **Wire `outlook` into `app/in-season-management/page.tsx`**: fetch `/api/in-season/outlook` alongside league data (it is heavy, so do not block first paint); keep it in state; pass to the views.
2. **Overview action queue**: `alerts = [...buildAlerts(...), ...buildLineupAlerts(leagueData), ...buildWeatherAlerts(leagueData, outlook.schedule, outlook.week)]` sorted by `quality`. `buildLineupAlerts` already exists in `lib/in-season-optimizer.ts` (held back from the Lineups release on purpose).
3. **Lineups page** (`lineup-view.tsx`): a "Next 3 weeks" panel per league (players by week 9-11: opponent and projection, amber BYE cells, from `outlook.leagues[id].myProjections` and `outlook.schedule`); kickoff time and weather chips on starter rows; "N starters on bye next week" summary. Optional: make the optimizer lock players by kickoff time (it currently locks by game date).
4. **Waivers & Guillotine page**: new `waivers-view.tsx` replacing `LiveLeagueView kind="waivers"`. Per league (reuse `LeagueNav`, `LeagueHeader`, `useCollapsible`): FAAB remaining of budget; "Waivers usually process Wednesday ~3:15 AM ET" (from `processing`); `buildWaiverPlan` recommendations (add, drop, gain by week, slot, reasons, suggested bid with its basis and note); candidate pool; market bids summary. Guillotine leagues: zone and rank card plus `guillotineOdds` clearly labelled an estimate. Skip eliminated leagues with a message. Put styles in a new CSS module file to avoid merge conflicts.
5. Verify on a preview with real data, then publish using the process above, **scoped to the Overview, Lineups and Waivers pages only**. Player Intelligence stays untouched until Phase 4.

### Assumptions and decisions to revisit with the user
- Waiver claims placed now process Wednesday morning, so the value horizon is the next three weeks (weeks 9-11), not the current week.
- A pickup is only suggested if it adds at least 1.0 projected points over the horizon. Suggestions are independent of each other (two may name the same drop).
- Bid ranges: strong adds use the 75th-90th percentile of the league's winning bids, solid adds the median to the 75th, marginal adds the 25th to the median; heavily added players move up a tier. Position-specific percentiles are used when at least 8 comparable bids exist.
- Dynasty drop protection is a flat KeepTradeCut value of 2500; consider a per-league percentile instead.
- Guillotine: one team is chopped per week; the danger zone is the next three lowest. The user said percentage odds are not a priority, so keep them secondary.
- Out/IR swaps are direct swaps; Auto-Subs are suggested for Questionable/Doubtful starters only where the league's `max_subs` is above 0 (Last Minute Dynasty has 0). Sleeper does not expose the user's own Auto-Sub choices.
- Niskayuna's playoff format is hardcoded by league id in `lib/in-season.ts` (`NISKAYUNA_LEAGUE_ID`); Sleeper's own settings for it are wrong.

## 3. After this branch
- **Phase 4, Player Intelligence + monitoring**: compare Sleeper's projections with a second free source, usage trends, news and injury timestamps, deduplicated alerts, after-game reconciliation.
- **Phase 5, Calibration**: log recommendations and score them against outcomes.
- Housekeeping: fix the regression assertion, bring `main` in line with production deliberately (not by a blind push), reopen and update issue #44.
