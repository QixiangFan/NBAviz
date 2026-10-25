# Is It All About Threes?

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

python collect_data.py        # 1. download raw data into data/raw/: Basketball-Reference tables from Kaggle, and stats.nba.com (30-60 min the first time; cached, re-run to retry failures)
python build_clean_data.py    # 2. build data/clean/*.csv and data/clean/README.md, and run validation checks
```

If the shot charts are not all downloaded yet, `python build_clean_data.py --partial` rebuilds every other table and keeps `shot_grid.csv` and `zone_seasons.csv` from the last full build.

Optionally, `python build_interim_data.py` writes the rest of the Basketball-Reference data to `data/interim/`, with its own README and checks: every team column, player totals and advanced stats since 1979-80, awards, All-NBA and All-Star selections, and a Basketball-Reference ↔ NBA.com player id map, so all of it joins with the clean tables. It needs only `python collect_data.py gamelogs players bref`. The website does not read these tables yet, and `data/interim/` is git-ignored.

Optional extras for the site's visuals:

```bash
python collect_logos.py       # historical team logos into web/assets/logos/ (otherwise falls back to current NBA.com logos)
```

Season coverage and request settings are in `nbaviz/config.py`.

## Project layout

```
index.html            redirect from the repo root to web/
web/                  the website (HTML, CSS, JS modules in js/viz and js/ui, assets)
data/clean/           clean CSVs the site reads; see data/clean/README.md for the data dictionary
data/interim/         all Basketball-Reference columns with NBA.com ids, not read by the site (generated, git-ignored)
nbaviz/               Python package: fetching, loading and exporting data
collect_data.py       step 1: download raw data
build_clean_data.py   step 2: build clean tables
build_interim_data.py optional: build the interim tables
collect_logos.py      optional: team logos
docs/                 process book and screenshots
```

## Data

Regular seasons only, each kind of data from the source that has it complete:

- **Team and league season stats, 1979-80 to 2025-26**: Basketball-Reference, from Sumitro Datta's [NBA Stats (1947-present)](https://www.kaggle.com/datasets/sumitrodatta/nba-aba-baa-stats) on Kaggle (CC0), pinned to version 56 in `nbaviz/config.py`. NBA.com's game logs leave 3-point attempts blank for most games before 1985-86, so they are only used for team ids and to cross-check games and wins.
- **Shot charts, player stats and bios, 1996-97 to 2025-26**: NBA.com via [`nba_api`](https://github.com/swar/nba_api).
- Awards and advanced player stats (Basketball-Reference) are linked to NBA.com player ids in `data/interim/`.

NBA logos and player photos are used for this course project only.
