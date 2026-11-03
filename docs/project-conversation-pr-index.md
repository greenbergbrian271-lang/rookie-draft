# Project conversation → pull request index

This index records the Project conversations and the GitHub PRs that represent their implementation or historical record. It is an audit/traceability document; it does not itself claim that every historical change is safe to re-merge.

Repository: https://github.com/greenbergbrian271-lang/rookie-draft

## PR mapping

| Project conversation / request | PR(s) | Status / notes |
|---|---:|---|
| Game workflow: schedule controls, notes, watch list and jerseys | #1 | Existing implementation PR |
| Schedule completeness and scouting filters / Top 25 filter | #2 | Existing implementation PR; includes schedule/filter work |
| Scouting Tools Add Player workflow | #3 | Existing implementation PR |
| Scouting Glossary editor | #4 | Existing implementation PR |
| Dynasty trade calculator | #5 | Existing implementation PR |
| Approved 5:30 batch | #6 | Existing batch PR |
| QB scouting workspace | #7, #8 | Existing feature and production PRs |
| Colleges Players + Stats | #9 | Existing implementation PR |
| RB scouting workspace | #10 | Existing production PR |
| Scouting persistence hotfix | #11 | Existing hotfix PR |
| TE scouting workspace, data source and metrics follow-ups | #12–#16 | Existing implementation / production PRs |
| WR scouting cards and refinements | #17, #18 | Existing implementation PRs |
| Scouting profile unification and consistency | #19, #20 | Existing implementation PRs |
| Player card manual overrides and elevated grades | #21 | Existing implementation PR |
| Final Draft Board consolidation and production batches | #22–#24 | Existing implementation / release PRs |
| Player profile opens from player name | #25 | Existing implementation PR |
| Combine Status / Draft Day | #26–#28 | Existing implementation / batch PRs |
| Mock Draft Simulator v2 | #29 | Existing implementation PR |
| NFL grade warehouse / War Room lookups | #30 | Existing implementation PR |
| Home-stretch UI polish | #31 | Existing implementation PR |
| Player profile grade detail and board data fidelity | #32 | Existing implementation PR |
| Transition to Next Year workflow | #33 | Existing implementation PR |
| Hardening, owner sharing and scouting UX | #34 | Existing implementation PR |
| Managed share links and read-only player cards | #35 | Existing implementation PR |
| Data integrity and reliability hardening | #36 | Existing implementation PR |
| Scouting grades and player intelligence / site data extraction follow-up | #37 | Closed/superseded; production replacement noted in the PR body |
| KTC-style league strength rankings | #38 | Existing merged PR |
| Game-log typing lag and scouting tab performance | #39 | Existing merged PR |
| Draft-feed caching, slider drag and grade calculation optimization | #40 | Existing merged PR |
| League Intelligence: League Rosters tab | #41 | Existing merged PR |
| Brand guidelines and UI consistency audit | #42 | Existing merged documentation PR |
| Brand-system foundation | #43 | Existing merged implementation PR |
| Initial Sleeper In-Season Management workspace | #45 | Existing merged PR |
| NFL/CFB home page and game-day history | #46 | Existing open draft PR |
| Game Notes / homepage Auto mode and selected-control correction | #47 | New draft PR; overlaps #46 and requires reconciliation |
| In-Season Management expansion: personal lineups, league overview, optimizer and Guillotine strategy | #48 | New draft PR; overlaps initial #45 and requires regression review |
| Niskayuna league playoff picture | #49 | New draft PR |
| NFL player cards in supported views | #50 | New draft PR; branch is significantly behind main and must be reconciled before merge |

## Historical conversations without a distinct code change

The following conversations are retained here as project history rather than represented by a fabricated code change:

- Vercel Storage Investigation — operational investigation of storage/egress configuration and the Turso/Vercel distinction; no distinct source-code diff was identified in the accessible project history.
- Deployment Integration Details — explanation of the GitHub/Vercel deployment workflow and connector permissions; informational only.
- Turso storage limits — informational discussion of plan storage and read/write limits.
- Download this whole conversation as a PDF — artifact/export request, not an application feature.
- Update player card format / player-card height-weight follow-up — the named historical branch is now behind main with no unique diff against main; retain as historical context and do not reintroduce stale code.
- Forty-chip fix deployment request — the named historical branch is now behind main with no unique diff against main; retain as historical context and do not reintroduce stale code.

## Handling rules

1. Prefer the existing PR when it already represents the conversation; do not create duplicate PRs for the same implementation.
2. When production already contains the change, preserve its existing PR/commit reference rather than attempting to re-merge it.
3. For conversations with no remaining code diff, use this index as the archival record; do not invent a code change merely to create a PR.
4. New draft PRs are for traceability and review. Draft status means they are not approved to merge.
5. In particular, #47 overlaps #46, #48 overlaps #45, and #50 is based on a substantially stale branch. Reconcile those histories before any merge.
6. This index reflects the Project conversation history and repository state accessible during the 2026-11-03 audit. If older or archived Project chats are restored later, append their mapping here.
