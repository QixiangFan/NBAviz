# Is It All About Threes?

CS6730 Data Visualization final project, team TheVizG.O.A.T. A scrolling data story told as one basketball game (tip-off, four quarters, final buzzer). It shows how the NBA moved out to the three-point line, and that *taking* more threes no longer separates winning teams but *making* them does.

## Run it

```bash
pip install -r requirements.txt     # nba_api, pandas, numpy

python collect_data.py              # 1. download from stats.nba.com into data/raw/ (cached, resumable)
python build_clean_data.py          # 2. clean + validate -> data/clean/*.csv and data/clean/README.md
python collect_logos.py             #    optional: each team's logo era by era -> web/assets/logos/
python -m http.server 8000          # 3. serve the project folder, then open http://localhost:8000/web/
```

- The website reads `data/clean/` only. Opening `web/index.html` straight from disk won't work, because browsers block loading data from `file://`.
- Shot charts take one request per team per season: 900 requests (about 545 MB) for 1996-97 to 2025-26. `python collect_data.py shots` downloads them; already-saved files are skipped, so an interrupted run resumes. The build check compares shot-chart attempts with the game logs, which catches any incomplete file.
- stats.nba.com often blocks cloud servers and VPNs, so download from a home or campus network.
- Player headshots and today's team logos load at run time from NBA.com's image CDN (`cdn.nba.com`), keyed by the `team_id` / `player_id` in the clean data, so the page needs internet (as it already does for D3 and the fonts). Players without an NBA.com photo show NBA.com's grey silhouette. The CDN refuses headless Chrome's default user agent, so pass a normal `--user-agent` when testing headless.
- Older logos come from SportsLogos.net through `collect_logos.py` (about 40 pages plus the images, 1.5 s apart, cached and resumable). It saves only the logos used since 1985-86 and writes `web/assets/logos/logos.csv`, which says which seasons each logo covers, then prints how many team-seasons have a logo. Without it, every season uses today's logo, and teams that have since moved or been renamed (Seattle SuperSonics, New Jersey Nets, Charlotte Bobcats, …) show their abbreviation.

## Folder layout

```
collect_data.py          step 1: download (nba_api) -> data/raw/
build_clean_data.py      step 2: clean tables + validation report -> data/clean/
collect_logos.py         optional: logo history from SportsLogos.net -> web/assets/logos/
nbaviz/
  config.py              seasons, completeness rules, request settings
  fetch.py               nba_api endpoint wrappers (the only network code)
  load.py                raw CSV -> tidy tables (team games, team/league seasons, shot grid, players)
  export.py              the clean tables, data dictionary, cleaning rules and checks
data/raw/                downloaded cache (not committed)
data/clean/              clean CSVs + README.md (data dictionary, cleaning rules, check results)
web/
  index.html             page structure: loader, HUD, tip-off, Q1-Q4, halftime, final
  css/base.css           tokens (colors, type), HUD, controls, tooltip
  css/chapters.css       chapter layouts + mobile
  js/main.js             boot, loader, HUD (game clock, shot clock), ?shot= deep links
  js/data.js             CSV loading, seeded RNG, shot sampling for particles
  js/motion.js           Lenis + GSAP ScrollTrigger, text reveals, counters, reduced motion
  js/media.js            which logo a team used each season; headshot URLs (cdn.nba.com)
  assets/logos/          logos by era + logos.csv (from collect_logos.py)
  js/ui/                 tooltip, buttons/sliders
  js/viz/                one module per chapter: hero, timeline (Q1), shotmap (Q2), teams (Q3),
                         players (Q4 + halftime), scoreboard (final); court + particles are shared
docs/                    process book PDF, Phase 1 draft, screenshots
```

## Working on the site

- Each chapter is one module in `web/js/viz/` with an `init*(data)` function called from `main.js`.
- Libraries are loaded from jsdelivr at pinned versions: D3 7.9.0, GSAP 3.13.0 (ScrollTrigger, SplitText), Lenis 1.3.4. There is no build step.
- `?shot=<chapter>[:<step>]` jumps straight to a state with animations off, e.g. `/web/?shot=q3:5` or `/web/?shot=q1:0.5` (Q1 takes a 0–1 scroll fraction). Use it for screenshots.
- `?static` (or the OS "reduce motion" setting) turns off smooth scrolling and animation.
- Series colors: orange `#ec5e22` = threes / volume, teal `#16ab85` = accuracy, blue `#3d8ff0` = twos / efficiency. They were checked for color-vision deficiency against the page background.
