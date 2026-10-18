# Rookie Draft — Brand Guidelines & UI Consistency Audit

**Purpose:** Establish a consistent design standard for the Rookie Draft web application and identify where the current implementation diverges.  
**Audit basis:** Code-level review of the repository's main branch as of October 17, 2026. This is a styling-architecture audit, not a claim that every listed page has a visibly broken layout. Some differences are intentional for workbook-like data grids.

## 1. Brand direction

Rookie Draft should feel like a serious, fast, data-dense football scouting workstation: analytical, confident, compact, and easy to scan. The interface should use a consistent dark-navy foundation, restrained cyan accents, clear data hierarchy, and meaningful status colors.

**Design principles**
- **Data first:** prioritize readable rankings, grades, player names, stats, and decision-relevant context.
- **One system, different tools:** pages can have different information architecture, but shared navigation, typography, controls, cards, tabs, and player profiles should feel related.
- **Color carries meaning:** position colors identify positions; status colors communicate state; the primary action color identifies actions. Do not reuse these categories interchangeably.
- **Dense, not cramped:** keep tables efficient, but maintain predictable padding, line-height, and touch targets.
- **Workbook fidelity is a deliberate variant:** spreadsheet-matched grids may use white cells and Excel-like group headers, but that treatment must be contained to the grid and not redefine the rest of the page.

The existing NCAA player profile is the reference point for the player-card family. The NFL profile should change the information shown, not introduce a different visual identity: retain the same hero hierarchy, player metadata treatment, tabs, panel surfaces, and metric layout.

## 2. Color system

Use the following as the canonical application palette. Add new general-purpose colors only through this token system.

| Token | Value | Use |
|---|---|---|
| Page background | #06101e | Main application canvas |
| Sidebar / shared chrome | #081426 | Sidebar and persistent top-level chrome |
| Surface | #0c1930 | Cards, panels, menus |
| Raised surface | #11223d | Nested panels and elevated sections |
| Hover / active surface | #142844 | Navigation hover and active control backgrounds |
| Border | #20395f | Default panel and divider border |
| Strong border | #31527f | Inputs, focused boundaries, stronger separation |
| Primary text | #f4f7fb | Main content and headings |
| Secondary text | #8fa7c8 | Descriptions, metadata, secondary labels |
| Accent / focus | #20e2dd | Key highlights, selected indicators, focus ring |
| Primary action | #1677ff | Main action buttons and primary links when a button is needed |
| Success | #62e889 | Successful state and positive feedback |
| Warning | #ffd166 | Caution, pending attention, thresholds |
| Error / destructive | #ff7184 | Errors, failed states, destructive warnings |

### Position colors

These are semantic colors and should be used consistently wherever positions are identified.

| Position | Value | Recommended text on fill |
|---|---|---|
| QB | #fc2b6d | White |
| RB | #20ceb7 | Dark navy |
| WR | #58a7ff | Dark navy |
| TE | #fead58 | Dark navy |

Position colors should be reserved for position labels, workbook group headers, and position-specific data. They should not become generic success, warning, navigation, or primary-action colors.

For status badges, use the status color for the text and/or a subtle tinted background with a clear border. Never communicate status by color alone; include a label or icon.

## 3. Typography

Use one application-wide sans-serif stack: system-ui, -apple-system, Segoe UI, sans-serif.

| Element | Standard |
|---|---|
| Page title (H1) | 28–30 px, bold / extra-bold |
| Section title (H2) | 20–22 px, bold |
| Subsection title (H3) | 16–18 px, bold |
| Body copy | 14–15 px, regular |
| Secondary / table metadata | 12–13 px |
| Eyebrow / kicker | 10–11 px, bold, uppercase, letter spacing around 0.1em |
| Dense data tables | 12–13 px, with tabular numerals for numeric columns |

Keep heading hierarchy and line-height consistent across pages. Use monospace only where it serves a specific purpose, such as raw notes or code-like values. Spreadsheet-matched tables may use Calibri/Arial to preserve workbook parity.

## 4. Layout, spacing, and shape

Use a 4 px spacing base and prefer values from this scale: **4, 8, 12, 16, 20, 24, 32 px**.

- **Desktop shell:** retain the existing persistent left navigation and sticky tool menu. Keep the sidebar near its current 235 px width unless a responsive layout requires a change.
- **Page content:** 24 px outer padding on desktop and 14–16 px on narrow screens.
- **Page header:** optional eyebrow, H1, short explanatory sentence, and page actions aligned consistently. Stack the header and actions on mobile.
- **Sections:** use 16–24 px between major sections; avoid arbitrary one-off gaps.
- **Cards:** 12 px radius, 1 px border, 14–16 px internal padding, and the standard surface color.
- **Controls:** 8 px radius and a consistent 36–40 px minimum height; use larger touch targets on mobile.
- **Modals:** consistent dark surface, strong border, and approximately 16 px radius. Reuse the same close-button, tab, and panel patterns.
- **Pills / status badges:** fully rounded, with consistent padding and font weight.
- **Borders:** default to the shared border token. Reserve stronger borders for focus or meaningful hierarchy; avoid decorative borders on every nested element.

## 5. Component standards

### Navigation and page chrome
- Keep the sidebar, top tool menu, active navigation state, dropdowns, and page content aligned to the same token set.
- Active navigation should use the shared active surface and high-contrast text.
- Keep icon size and stroke treatment consistent. Use the existing Lucide icon family at roughly 16–18 px for standard controls.
- Do not introduce per-page navigation colors or button treatments.

### Buttons and controls
- **Primary:** blue action treatment for the main action on a page or dialog.
- **Secondary:** dark/ghost treatment with a visible border.
- **Success and destructive:** use only when the meaning is genuinely success or destructive action—not merely to indicate the selected tab.
- **Inputs:** dark field surface, strong border, shared radius, readable placeholder, and a visible cyan focus ring.
- **Tabs:** use one consistent selected-state treatment within each context. A segmented control is appropriate for switching table views; underline tabs are appropriate inside a player profile. Do not use green success styling as a generic selected state.

### Cards and metric panels
- Use the same surface, border, radius, and padding tokens.
- Labels should be secondary; values should carry the strongest typographic weight.
- Align metric values and use tabular numerals when comparing numbers.
- Keep empty, loading, error, and success states consistent across pages.

### Tables and data grids
There are two approved table treatments:

1. **Application data table:** dark surface, subtle row separators, restrained hover state, consistent sticky headers, numeric alignment, and tabular numerals.
2. **Workbook-parity grid:** white sheet background, dark cell text, Excel-like cell borders, and documented group/position colors. Use this only where preserving the source workbook layout is important.

Workbook styling must be scoped to its grid container. It must not leak into surrounding cards, page headers, inputs, or navigation. Do not redesign workbook colors independently on each workbook-like page; use the same group-color mapping throughout.

### Player cards
- Use the NCAA player profile as the baseline for both NCAA and NFL cards.
- Keep the player name, position/school/team metadata, portrait, tabs, panels, close control, and metric hierarchy consistent.
- The content can differ by player type: for example, NCAA scouting grades versus NFL overall rank, production, availability, fantasy results, and market history. That difference should not create a separate card design language.
- Use the same position colors and shared typography. Avoid adding unrelated badge shapes or a different modal shell for the NFL version.

## 6. CSS and implementation rules

1. **Centralize tokens.** Expand the shared root token set for palette, spacing, radii, typography, and focus treatment. Use the same token names and values wherever possible.
2. **Keep global CSS global.** The global stylesheet should own reset rules, tokens, application shell, and genuinely reusable primitives. Move page-specific styles into a CSS module or a dedicated component stylesheet.
3. **Avoid hardcoded general UI colors.** Hardcoded colors are acceptable for documented exceptions such as NFL team branding, school branding, position colors, and the workbook palette—not for generic cards, borders, buttons, tabs, or text.
4. **Avoid !important.** Prefer a clear component class and predictable cascade. Allow exceptions only for tightly scoped workbook compatibility rules that cannot reasonably be expressed otherwise.
5. **Avoid duplicate override layers.** When a rule needs to change, edit the canonical rule rather than appending another version later in the stylesheet.
6. **Avoid static inline styles.** Put fixed colors, spacing, borders, and typography in CSS. Inline styles are acceptable for genuinely dynamic values such as a calculated width or team-specific value.
7. **Mirror tokens in the standalone NFL page.** The NFL Draft War Room runs in its own HTML document, so it cannot automatically inherit the Next.js app's CSS. Its shared palette and component standards must be kept in sync explicitly; NFL team colors remain a documented exception.
8. **Keep the workbook variant explicit.** Name and scope workbook styling clearly so its white cells and position-colored headers do not become a second general-purpose UI palette.

## 7. Existing UI deviation audit

**How to read this audit:** priority reflects how strongly the implementation is isolated from the shared design system, not a claim that every listed screen looks bad. Color counts include semantic position, team, and workbook colors, so they are indicators of styling sprawl—not counts of unique brand colors.

| Page / area | Priority | Evidence in the current code | Recommended alignment |
|---|---|---|---|
| NFL Draft War Room — /nfl-draft-war-room and public/nfl-draft.html | **High** | The route wraps a standalone HTML app in an iframe; the wrapper has its own background and negative page margins. The HTML document defines a separate token block and contains 237 distinct hex literals, including NFL team branding. | Bring shared surfaces, typography, controls, tabs, and player-profile patterns into parity with the main app. Keep NFL team colors, but document them as semantic exceptions and mirror the base tokens. |
| Draft Day — /draft-day | **High** | Page-local style block in the React file; 97 distinct hex literals and 26 uses of !important. | Move page styles into a module; use shared tokens for generic UI. Preserve workbook/data-specific colors only where they encode meaning. |
| Historical Rankings — /historical | **High** | Three embedded style blocks, 92 distinct hex literals, and 17 uses of !important. | Consolidate the style blocks, replace general-purpose colors with tokens, and standardize cards, filters, tabs, and tables. |
| Dynasty Rosters — /dynasty-rosters | **High** | Page-local style block with 80 distinct hex literals, plus a separate trade-calculator stylesheet with 76 distinct hex literals. | Normalize the page and trade calculator to shared surfaces, controls, and status colors. Keep any specialized trade visualization as a documented component variant. |
| Colleges + Stats — /colleges | **High** | Dedicated CSS module with 108 distinct hex literals and 24 uses of !important. Some workbook/table colors are legitimate, but the page has a large isolated palette. | Separate workbook-grid colors from page-shell colors. Use shared tokens for headers, controls, cards, and surrounding content. |
| College All-Star Games — /all-star-games | **Medium–High** | Dedicated CSS module with 54 distinct hex literals and 40 uses of !important; it defines its own accent variables. | Map its generic accent and action colors to the shared accent/action tokens; retain only domain-specific colors that communicate real meaning. |
| Final Draft Board — /final-draft-board | **Medium–High** | Embedded style block, 55 distinct hex literals, and 12 uses of !important. | Standardize page chrome, controls, badges, and panel styling. Scope any workbook-compatible table treatment explicitly. |
| Player Data — /player-data | **Medium–High** | Embedded style block, 64 distinct hex literals, and a local accent variable set that changes by position. | Reuse the global position tokens for QB/RB/WR/TE and standardize tabs, table headers, controls, and cards. Position-specific accents can remain semantic. |
| League Intelligence — /league-intelligence | **Medium** | Page-local style block and its own hardcoded color values. | Move generic styles to shared tokens and align loading, notice, tab, and card states with the rest of the app. |
| Integrations — /integrations | **Medium** | Page-local style block, 18 distinct hex literals, and 3 uses of !important. | Use shared tokens for status cards, connection states, buttons, and notices. |
| Data Center — /data-center | **Medium** | 31 inline style attributes and several hardcoded colors in the page component. | Move fixed styling into CSS classes; keep inline styles only for dynamic visual values and use semantic status tokens. |
| Data Health — /data-health | **Medium** | 31 inline style attributes and several hardcoded status colors in the page component. | Use shared status tokens and reusable health/status components; keep dynamic values separate from static styling. |
| Home and Watch List — / and /watch-list | **Low–Medium** | They share home.module.css, which is good, but the module includes hardcoded colors and multiple later overrides for the same layout selectors. | Keep the shared module, replace generic literals with tokens, and consolidate duplicate filter-bar, dropdown, and schedule layout rules. |
| Shared top tool menu | **Cross-site** | app/tool-menus.tsx includes 22 inline style attributes and 12 hardcoded color literals. This shared chrome affects many pages. | Tokenize the menu and dropdown styling first, because one correction will improve the whole application. |
| Global styling layer | **Cross-site** | app/globals.css is approximately 107 KB, has 366 distinct hex literals and 202 !important uses, while the root defines only 10 base variables. The file also contains many page-specific styles. | Treat this as the main structural cleanup: preserve shared primitives, move page styles to modules, consolidate overrides, and create a documented token set. |
| Scouting — /scouting and Draft Day Board — /draft-day-board | **Intentional exception** | These use workbook-style tables with white cells, spreadsheet-like borders, and position/group colors. | Keep this treatment where workbook parity is required. Scope it to the table and apply the shared dark application shell around it. |
| Admin, Game Notes, Players to Scout, Scouting Glossary | **Lower apparent risk** | The route components show less independent page-level styling than the pages above; most styling appears to come from the shared global layer. | Use these as early regression checks during the token cleanup, while remembering that global CSS changes can still affect them. |

## 8. Recommended implementation order

1. **Tokenize the shared chrome:** root variables, sidebar, top tool menu, buttons, fields, cards, badges, and tabs.
2. **Create the explicit workbook variant:** standardize workbook headers, position colors, cell borders, and white sheet surfaces without changing the spreadsheet's information architecture.
3. **Normalize the highest-isolation pages:** NFL Draft War Room, Draft Day, Historical Rankings, Dynasty Rosters, and Colleges + Stats.
4. **Normalize remaining custom pages:** All-Star Games, Final Draft Board, Player Data, League Intelligence, Integrations, Data Center, and Data Health.
5. **Consolidate duplicate CSS and remove avoidable !important rules.**
6. **Run a route-by-route visual regression check** at desktop and mobile widths, including hover, active, loading, empty, error, modal, and table-scroll states.

### Definition of done

- All pages use the same base shell, typography, surface colors, border treatment, and control styles.
- Generic UI colors come from shared tokens; position, team, and workbook colors are documented exceptions.
- NCAA and NFL player cards share the same visual language.
- Workbook-like grids remain faithful to their source layout but do not alter the surrounding application styling.
- Page-specific CSS is scoped, duplicate overrides are removed, and the major routes have been checked at desktop and mobile widths.

**Scope note:** This document establishes the standard and records code-level deviations. It does not itself change page styling or deploy a visual refactor.
