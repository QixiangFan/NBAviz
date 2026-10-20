"""Cached wrappers around the nba_api endpoints this project uses.

Each successful request is saved to data/raw/<dataset>/<key>.csv, so an
interrupted download resumes where it stopped and later runs never re-hit
stats.nba.com.
"""
import time

import pandas as pd
from nba_api.stats.endpoints import (
    leaguedashplayerbiostats,
    leaguedashplayerstats,
    leaguegamelog,
    shotchartdetail,
)
from nba_api.stats.static import teams as static_teams

from . import config as C

SHOT_COLUMNS = [
    "GAME_ID", "GAME_DATE", "PLAYER_ID", "PLAYER_NAME", "TEAM_ID", "PERIOD",
    "SHOT_TYPE", "SHOT_ZONE_BASIC", "SHOT_DISTANCE", "LOC_X", "LOC_Y", "SHOT_MADE_FLAG",
]


def _cached(dataset: str, key: str, request) -> None:
    path = C.RAW_DIR / dataset / f"{key}.csv"
    if path.exists():
        return
    for attempt in range(1, C.MAX_RETRIES + 1):
        try:
            df = request()
            break
        except Exception as exc:  # timeouts, throttling, truncated JSON
            if attempt == C.MAX_RETRIES:
                raise
            wait = 10 * 2 ** (attempt - 1)
            print(f"    {dataset}/{key}: {type(exc).__name__}; retry {attempt} in {wait}s")
            time.sleep(wait)
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False)
    time.sleep(C.REQUEST_PAUSE)


def team_game_logs(season: int) -> None:
    """One row per team per game: box-score totals, W/L, home/away via MATCHUP."""
    _cached("team_game_logs", C.season_str(season), lambda: leaguegamelog.LeagueGameLog(
        season=C.season_str(season),
        season_type_all_star=C.SEASON_TYPE,
        player_or_team_abbreviation="T",
        timeout=C.REQUEST_TIMEOUT,
    ).get_data_frames()[0])


def shot_chart(season: int) -> None:
    """Every field-goal attempt of the season with court coordinates, pulled team by team."""
    for team in sorted(static_teams.get_teams(), key=lambda t: t["abbreviation"]):
        _cached("shot_chart", f"{C.season_str(season)}_{team['abbreviation']}",
                lambda team_id=team["id"]: shotchartdetail.ShotChartDetail(
                    team_id=team_id,
                    player_id=0,
                    season_nullable=C.season_str(season),
                    season_type_all_star=C.SEASON_TYPE,
                    context_measure_simple="FGA",  # default "PTS" returns made shots only
                    timeout=C.REQUEST_TIMEOUT,
                ).get_data_frames()[0].reindex(columns=SHOT_COLUMNS))


def player_totals(season: int) -> None:
    """Season box-score totals per player (traded players appear once, under their last team)."""
    _cached("player_totals", C.season_str(season), lambda: leaguedashplayerstats.LeagueDashPlayerStats(
        season=C.season_str(season),
        season_type_all_star=C.SEASON_TYPE,
        per_mode_detailed="Totals",
        measure_type_detailed_defense="Base",
        timeout=C.REQUEST_TIMEOUT,
    ).get_data_frames()[0])


def player_bio(season: int) -> None:
    """Height, weight, country, draft slot, usage % and true shooting % per player-season."""
    _cached("player_bio", C.season_str(season), lambda: leaguedashplayerbiostats.LeagueDashPlayerBioStats(
        season=C.season_str(season),
        season_type_all_star=C.SEASON_TYPE,
        per_mode_simple="PerGame",
        timeout=C.REQUEST_TIMEOUT,
    ).get_data_frames()[0])

