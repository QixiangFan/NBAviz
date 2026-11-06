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

python collect_data.py        # 1. download raw data from stats.nba.com into data/raw/ (1-2 hours the first time; cached, re-run to retry failures)
python build_clean_data.py    # 2. build data/clean/*.csv and data/clean/README.md, and run validation checks
```

The MVP tables also use Sumitro Datta's [NBA Stats (1947-present)](https://www.kaggle.com/datasets/sumitrodatta/nba-aba-baa-stats) export of Basketball-Reference on Kaggle (CC0). Download it by hand and unzip it into `data/raw/bref/v56/` before running `build_clean_data.py`.

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
nbaviz/               Python package: fetching, loading and exporting data
collect_data.py       step 1: download raw data
build_clean_data.py   step 2: build clean tables
collect_logos.py      optional: team logos
docs/                 process book and screenshots
```

## Data

Regular seasons only:

- **Team and league stats, shot charts, player stats and bios**: NBA.com via [`nba_api`](https://github.com/swar/nba_api). Team and league stats start in 1979-80, when the 3-point line was introduced; 3-point attempts are only logged for every game from 1985-86, so those columns start then. Shot charts, player stats and bios cover 1996-97 to 2025-26.
- **MVPs and their positions, 1955-56 to 2025-26**: Basketball-Reference, from the Kaggle export above.

NBA logos and player photos are used for this course project only.
