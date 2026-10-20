# Phase 1: First working prototype

Draft text and figures for the process book. Screenshots are in `docs/screenshots/`.

## Checklist

| Requirement | Where |
|---|---|
| Data scraping and cleaning complete, on the real data | `collect_data.py` → `build_clean_data.py`; all validation checks pass (below) |
| Link to the clean data | **[TODO: GitHub link to `data/clean/`]**, which includes a data dictionary, cleaning rules and check results |
| ≥ 1 visualization partly implemented | Q1 annotated timeline, Q3 team scatter + correlation history + quadrants (interactive, on real data) |
| Drafts of two more | Q2 shot particles on the court, Q4 player radar duel |
| Rough layout implemented, placeholders allowed | Whole page built: loader, HUD, tip-off, Q1–Q4, halftime, final; placeholders for era fingerprints (KN1) and MVP hall (KN4) |
| Screenshots | Below, and `docs/screenshots/00–22` |

## Data

**Source.** NBA.com stats through `nba_api`, regular seasons only.

| Raw dataset | Endpoint | Coverage |
|---|---|---|
| Team game logs | LeagueGameLog | 1973-74 to 2025-26 |
| Shot charts (every attempt with x/y) | ShotChartDetail | 1996-97 to 2025-26: 900 team-season files, 5.9 million attempts |
| Player totals + bio | LeagueDashPlayerStats, LeagueDashPlayerBioStats | 1996-97 to 2025-26 |

**Clean tables** (`data/clean/`): `league_seasons`, `team_seasons`, `win_correlations`, `quadrants`, `zone_seasons`, `shot_grid`, `player_seasons`, `events`. Each one is documented column by column in `data/clean/README.md`.

**Cleaning decisions** (full list in `data/clean/README.md`):

- **Incomplete early seasons.** NBA.com leaves FGA blank before 1981-82, and 3PA, turnovers and rebounds blank for most games before 1985-86. Summing the few games that have them gave impossible values in our exploration figures (3P% of 359%, a pace of 1.0). A season-level stat is now kept only when at least 99% of games report every input it needs, so 3PA-based stats start in 1985-86.
- **Cancelled game.** Indiana at Boston on 2013-04-16 (cancelled after the Boston Marathon bombing) is listed as two 0-point rows with no result. We removed it.
- **Franchises.** Teams are keyed on franchise ID, so relocations and renames stay one team.
- **Comparing eras.** Shooting stats are also stored as z-scores within their season, so a 2000 team and a 2025 team are each compared with their own league.
- **Shot charts.** Eight team files are empty because the franchise did not exist that season (New Orleans before 2002-03, Charlotte in 2002-04), so they are skipped. Every attempt is binned into 1 ft × 1 ft cells by shot zone. The page samples its shot particles from these cells, so the raw 545 MB of shot charts never has to be shipped.
- **Mislabeled zones in 1996-97.** NBA.com assigns shot zones using today's 23.75 ft arc. In 1996-97 the line was 22 ft all the way around, so 19,165 three-pointers (a tenth of all shots that season) are labeled Mid-Range. That made the season look like it had 40.0% mid-range shots and only 10.7% threes; the real figures are 29.8% and 21.1%. We now trust the shot type (what the referees called): a three outside a 3-point zone is moved to the corner or above-the-break zone by location, and a two inside one to Mid-Range. Our earlier draft used the 40% figure, and the story now starts from 1997-98, the first season with today's line (36.8% mid-range).

**Validation** (re-run on every build):

| Check | Result |
|---|---|
| Every game has exactly two team rows | PASS: 57,727 games |
| League wins = losses, every season | PASS: 53 seasons |
| Win % and shooting rates within [0, 1] | PASS: 1,177 team-seasons, no missing values |
| Incomplete early seasons are blanked | PASS: 3PA stats start 1985-86 |
| Shot-chart attempts = game-log FGA (±1%) | PASS: all 30 seasons match exactly, so no partial downloads |
| Shot zones agree with shot type | 22,647 shots relabeled: 19,626 in 1996-97, at most 378 in any other season |
| Player points add up to team points (±0.5%) | PASS |

## Design

**Concept: the story is a game.** The page is one basketball game. The nav lists periods (Tip-off, Q1, Q2, Half, Q3, Q4, Final). A thin game clock across the top shows progress through the whole story. A 24-second shot clock in the corner counts down through each chapter. A night-arena look (dark court, glowing orange and blue shot particles, scoreboard digits) keeps the subject in view on every screen.

**Structure.**

| Period | What it does | Sketch |
|---|---|---|
| Loader | Counts the shots in the data, to set the scale | — |
| Tip-off (hook) | 6,000 real 2025-26 shots burst from the rim onto a 3D court; the fan quote; the 3.3 → 37.0 headline | Hook |
| Q1 · The long way out | Scroll-scrubbed timeline 1979-80 → 2025-26 with a live scoreboard and rule-change cards | QF1 |
| Q2 · Where the shots went | Shot particles move from 1997-98 to 2014-15 (when threes passed the mid-range) to 2025-26, then stack into points-per-shot columns; a slider covers all 30 seasons | ZD8 / QF7 |
| Halftime | Recap and handoff to the main question; era fingerprints (placeholder) | KN1 |
| Q3 · Does volume win? | Main message: one set of team "balls" moves from volume to accuracy to efficiency, then every season, then four groups | QF8 / KN7 / JB2 / JB4 / JB6 |
| Q4 · The players | Two flip-able player cards around a morphing radar; MVP hall (placeholder) | ZD2 / KN4 |
| Final buzzer | Scoreboard of the three correlations ("Making beats taking"), takeaways, limits, methods, team | — |

**Visual system.** Big Shoulders Display for headlines, Inter for text, JetBrains Mono for numbers. One color per idea across the whole page: orange = threes / volume, teal = accuracy, blue = twos / efficiency. All three were checked for color-vision deficiency against the dark background.

**Motion.** Smooth scrolling (Lenis) drives every scroll-linked animation (GSAP ScrollTrigger). Transitions are morphs: the same marks move between encodings, so readers can follow a team or a shot from one view to the next. "Reduce motion" turns off smooth scrolling and shows every final state at once.

## Implementation status

| Visualization | Status | Screenshots |
|---|---|---|
| Q1 annotated timeline | **Partly implemented**: scroll scrubbing, 4 metrics with line morphing, event cards, crosshair tooltip | 03, 04, 05 |
| Q3 team scatter, correlation history, quadrants | **Partly implemented**: 8 scroll steps, metric morphs, live r readout, play-through of all seasons, hover | 11–17 |
| Q2 shot particles | **Draft**: 5 scroll steps on all 30 seasons; the slider redraws the 22 ft arc for 1996-97; filter by shot type | 06–09c |
| Q4 player radar duel | **Draft**: season picker, search, random matchup, card flip; needs polish | 18, 19 |
| Halftime era fingerprints, MVP hall | **Placeholder** with the planned encoding written in | 10, 18 |
| Loader, tip-off, final scoreboard | Implemented | 00, 01, 20 |
| Mobile layout | Implemented (stacked stage and step cards) | 21, 22 |

## Changes from the storyboard, and why

1. **The main message now has a time dimension, and we tested it.** Following the TA's feedback ("check the claim with data, compare volume, efficiency and winning"), we computed the correlation with win % for every season since 1985-86. Volume (3PA rate) peaked at r = 0.47 in 2014-15 and has since faded to r = 0.04. Accuracy (3P%) rose from r ≈ 0.36 (1985–2000) to r ≈ 0.67 (2020–26). Efficiency (eFG%) holds near 0.7. So the story is "volume used to help a little; once every team shot threes, making them is what mattered", not a flat "threes don't matter".
2. **Era fairness.** Teams are placed by their z-score within the season, not by raw percentages, so a 1990 team and a 2025 team are each compared with their own league.
3. **No causal language.** Rule changes are labeled as things that happened at the same time as the trend, and every correlation is described as an association.
4. **The heatmap became particles.** Each dot is a sampled real shot. This lets the same marks move between seasons and then become a bar chart of points per shot, instead of showing separate static maps.
5. **JB6 quadrants are part of Q3.** Accurate low-volume teams won 54.2% of games, inaccurate high-volume teams 46.3% (1,177 team-seasons).
6. **KN4 (MVP positions) is reframed** as "MVPs by 3-point rate". MVP position alone does not connect to the threes story. Plotting MVPs by how often they shot threes does: Curry and Harden followed the shift, Jokić and Antetokounmpo won without it.
7. **Data fixes found while building.** The early-season blanking, the cancelled-game removal and the 1996-97 zone relabeling (above) corrected values that our exploration figures had shown wrongly. The biggest one: the mid-range baseline went from 40% to the real 36.8% (1997-98).

## Next steps

- Build the era fingerprints (halftime) and the MVP hall (needs a small hand-made MVP table).
- Q4: animate the radar between eras and add an "archetype" preset (stretch big, high-volume guard).
- Accessibility pass: a data-table view for each chart, and keyboard control of the scroll steps.
- Usability test with 3–5 people outside the team, then refine the narrative text.
- Host on GitHub Pages and add the link here.
