"""Project-wide settings. Seasons are identified by their starting year (2025 -> "2025-26")."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw"
CLEAN_DIR = ROOT / "data" / "clean"

# --- Season coverage -------------------------------------------------------
LAST_SEASON = 2025              # most recent *completed* regular season (2025-26)
GAMELOG_FIRST_SEASON = 1973     # team game logs (which stats are complete when: see below)
DETAIL_FIRST_SEASON = 1996      # shot zones, player bio and shot charts exist from 1996-97 on
SHOT_CHART_SEASONS = list(range(DETAIL_FIRST_SEASON, LAST_SEASON + 1))  # 30 requests (one per team) each

# Data completeness in the team game logs.
THREE_POINT_LINE_SEASON = 1979  # 3-pointers made are logged from the line's first season
THREE_PA_FIRST_SEASON = 1985    # first season with 3PA, FGA, turnovers and rebounds logged for every game
COMPLETE_SHARE = 0.99           # a season-level stat is kept only if this share of games report its inputs

# Seasons that did not have a normal 82-game schedule.
SHORTENED_SEASONS = {1998: "lockout", 2011: "lockout", 2019: "COVID", 2020: "COVID"}

# --- Request behaviour -----------------------------------------------------
SEASON_TYPE = "Regular Season"
REQUEST_TIMEOUT = 60            # seconds; stats.nba.com is slow for big payloads
REQUEST_PAUSE = 0.8             # seconds between requests; the site throttles bursts
MAX_RETRIES = 4


def season_str(start_year: int) -> str:
    return f"{start_year}-{str(start_year + 1)[-2:]}"
