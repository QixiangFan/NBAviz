"""Project-wide settings. Seasons are identified by their starting year (2025 -> "2025-26")."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
INTERIM_DIR = ROOT / "data" / "interim"   # processed and merged, not read by the website (git-ignored)
CLEAN_DIR = ROOT / "data" / "clean"

# --- Season coverage -------------------------------------------------------
LAST_SEASON = 2025              # most recent *completed* regular season (2025-26)
THREE_POINT_LINE_SEASON = 1979  # first season of the 3-point line; team and league tables start here
GAMELOG_FIRST_SEASON = THREE_POINT_LINE_SEASON  # NBA.com game logs: team ids and a cross-check of the records
DETAIL_FIRST_SEASON = 1996      # shot zones, player bio and shot charts exist from 1996-97 on
SHOT_CHART_SEASONS = list(range(DETAIL_FIRST_SEASON, LAST_SEASON + 1))  # 30 requests (one per team) each

# Seasons that did not have a normal 82-game schedule.
SHORTENED_SEASONS = {1998: "lockout", 2011: "lockout", 2019: "COVID", 2020: "COVID"}

# --- Basketball-Reference ---------------------------------------------------
# Sumitro Datta's "NBA Stats (1947-present)" on Kaggle, scraped from Basketball-Reference. Its seasons
# are named by the year they end in; load.bref() converts them to starting years. The version is
# pinned so a rebuild gets the same files; v56 (2026-04-13) is the end of the 2025-26 regular season.
BREF_DATASET = "sumitrodatta/nba-aba-baa-stats"
BREF_VERSION = 56

# --- Request behaviour -----------------------------------------------------
SEASON_TYPE = "Regular Season"
REQUEST_TIMEOUT = 60            # seconds; stats.nba.com is slow for big payloads
REQUEST_PAUSE = 2.5             # seconds between requests; at 0.8 s the site stopped answering after ~600
MAX_RETRIES = 4


def season_str(start_year: int) -> str:
    return f"{start_year}-{str(start_year + 1)[-2:]}"
