# Is It All About Threes?

A scrollytelling data story in four quarters: how the NBA moved out to the three-point line, and why taking more threes no longer separates winners. CS6730 course project, team TheVizG.O.A.T.

Website: <https://qixiangfan.github.io/NBAviz/>

## Run the site locally

The clean data is already in `data/clean/`, so you only need a static file server. From the repo root:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000/> (it redirects to `web/`). Opening `web/index.html` directly from disk won't work, because the browser blocks loading the CSVs over `file://`.

The libraries (D3, GSAP, Lenis) and fonts load from CDNs, so you need an internet connection.

## Rebuild the data (optional)

Only needed if you want to refresh or change the data. Requires Python 3.9+.

```bash
pip install -r requirements.txt

python collect_data.py        # 1. download raw data from stats.nba.com into data/raw/ (1–2 hours the first time; cached, re-run to retry failures)
python build_clean_data.py    # 2. build data/clean/*.csv and data/clean/README.md, and run validation checks
```

Optional extras for the site's visuals:

```bash
python collect_logos.py       # historical team logos into web/assets/logos/ (otherwise falls back to current NBA.com logos)
swift make_cutouts.swift      # player photo cutouts into web/assets/players/ (macOS 14+ only; otherwise figures are left out)
```

Season coverage and request settings are in `nbaviz/config.py`.

## Project layout

```
index.html            redirect from the repo root to web/
web/                  the website (HTML, CSS, JS modules in js/viz and js/ui, assets)
data/clean/           clean CSVs the site reads; see data/clean/README.md for the data dictionary
nbaviz/               Python package: fetching, loading and exporting data
collect_data.py       step 1: download raw data
build_clean_data.py   step 2: build clean tables
collect_logos.py      optional: team logos
make_cutouts.swift    optional: player cutouts
docs/                 process book and screenshots
```

## Data

NBA.com stats via [`nba_api`](https://github.com/swar/nba_api), regular seasons only: team game logs from 1973-74, and shot charts, player stats and bios from 1996-97 through 2025-26. NBA logos and player photos are used for this course project only.
