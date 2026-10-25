"""Processed tables between the raw cache and data/clean/, with every column the sources offer.

build_interim_data.py writes each table to data/interim/ (git-ignored); the website reads data/clean/.
Teams: Basketball-Reference's full team table with NBA.com ids. Players: Basketball-Reference's totals,
advanced stats and awards, linked to NBA.com's player ids so they join with data/clean/player_seasons.csv.
"""
import re
import unicodedata
from functools import lru_cache

import pandas as pd

from . import config as C
from . import load

PLAYER_STATS = {  # Basketball-Reference column -> name used in this project
    "g": "gp", "gs": "gs", "mp": "min", "pts": "pts", "trb": "reb", "orb": "oreb", "drb": "dreb",
    "ast": "ast", "stl": "stl", "blk": "blk", "tov": "tov", "pf": "pf", "fg": "fgm", "fga": "fga",
    "x3p": "fg3m", "x3pa": "fg3a", "ft": "ftm", "fta": "fta",
}
PLAYER_ADVANCED = {
    "per": "per", "ts_percent": "ts_pct", "usg_percent": "usg_pct", "ows": "ows", "dws": "dws", "ws": "ws",
    "ws_48": "ws_48", "obpm": "obpm", "dbpm": "dbpm", "bpm": "bpm", "vorp": "vorp",
}
POINTS_SLACK = 5  # season points two box scores may differ by and still be the same player


# --- Teams -----------------------------------------------------------------

TEAM_TOTALS = {"mp": "min", "fg": "fgm", "fga": "fga", "x3p": "fg3m", "x3pa": "fg3a", "ft": "ftm", "fta": "fta",
               "orb": "oreb", "drb": "dreb", "trb": "reb", "ast": "ast", "stl": "stl", "blk": "blk", "tov": "tov",
               "pf": "pf", "pts": "pts"}


def teams() -> pd.DataFrame:
    """Every team-season since 1979-80 as in data/clean/team_seasons.csv, plus season totals, playoffs and
    the rest of Basketball-Reference's ratings."""
    t = load.team_seasons().rename(columns=TEAM_TOTALS)
    t.insert(1, "season_label", t["season"].map(C.season_str))
    return t[["season", "season_label", "team_id", "team", "team_name", "bref_team", "bref_abbr", "playoffs",
              "games", "wins", "losses", "win_pct", "ppg", "fg3m_pg", "fg3a_pg", "fg3a_rate", "fg3_pct", "efg",
              *load.RATINGS.values(), *TEAM_TOTALS.values()]].sort_values(["season", "team"])


# --- Players ---------------------------------------------------------------

def _name_key(names: pd.Series) -> pd.Series:
    """Lowercase ASCII without punctuation or suffixes: "Luka Dončić" = "Luka Doncic",
    "Gary Trent Jr." = "Gary Trent", "Karl-Anthony Towns" = "Karl Anthony Towns"."""
    def key(name: str) -> str:
        name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
        name = re.sub(r"[^a-z ]", "", name.replace("-", " "))
        return " ".join(re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", "", name).split())
    return names.map(key)


def _unmatched(d: pd.DataFrame, matched: pd.DataFrame, keys: list) -> pd.DataFrame:
    m = d.merge(matched[keys].drop_duplicates(), on=keys, how="left", indicator=True)
    return m[m["_merge"] == "left_only"].drop(columns="_merge")


def _one_to_one(d: pd.DataFrame) -> pd.DataFrame:
    """Drop candidate pairs where either player has more than one candidate that season."""
    shared = (d.duplicated(["season", "nba_player_id"], keep=False)
              | d.duplicated(["season", "bref_id"], keep=False))
    return d[~shared]


@lru_cache
def player_season_links() -> pd.DataFrame:
    """Each NBA.com player-season (1996-97 on) paired with its Basketball-Reference player-season.

    1. Same season and name (after _name_key). When two players share a name that season (two Marcus
       Williams in 2007-08), the pair must also have the same games played.
    2. The rest: same season and games played, points within POINTS_SLACK, and no other candidate on
       either side. This links nicknames and spellings ("Ike Austin" = Isaac Austin,
       "Flip Murray" = Ronald Murray, "Sun Sun" = Sun Yue)."""
    n = load.player_seasons()[["season", "player_id", "player_name", "gp", "pts"]]
    n = n.rename(columns={"player_id": "nba_player_id"})
    b = load.bref_combined("Player Totals")
    b = b[b["season"] >= C.DETAIL_FIRST_SEASON][["season", "player_id", "player", "g", "pts"]]
    b = b.rename(columns={"player_id": "bref_id", "g": "gp"})
    n["key"], b["key"] = _name_key(n["player_name"]), _name_key(b["player"])

    by_name = n.merge(b, on=["season", "key"], suffixes=("", "_bref"))
    same_games = by_name[by_name["gp"] == by_name["gp_bref"]]
    by_name = pd.concat([_one_to_one(by_name), _one_to_one(same_games)]).drop_duplicates(["season", "nba_player_id"])

    rest = _unmatched(n, by_name, ["season", "nba_player_id"]).merge(
        _unmatched(b, by_name, ["season", "bref_id"]), on=["season", "gp"], suffixes=("", "_bref"))
    rest = _one_to_one(rest[(rest["pts"] - rest["pts_bref"]).abs() <= POINTS_SLACK])

    links = pd.concat([by_name.assign(match="name"), rest.assign(match="games+points")], ignore_index=True)
    return links[["season", "nba_player_id", "player_name", "bref_id", "player", "match"]]


@lru_cache
def player_ids() -> pd.DataFrame:
    """One row per player linked in any season (see player_season_links); the link holds for his whole
    career, so Basketball-Reference rows from before 1996-97 get the NBA.com id too."""
    links = player_season_links()
    g = links.groupby(["bref_id", "nba_player_id"])
    ids = g.agg(player=("player", "last"), nba_name=("player_name", "last"),
                first_season=("season", "min"), last_season=("season", "max"), seasons=("season", "size"))
    ids["match"] = g["match"].agg(lambda m: "name" if (m == "name").any() else "games+points")
    return ids.reset_index().sort_values("bref_id")


def _with_nba_ids(d: pd.DataFrame) -> pd.DataFrame:
    """Rename Basketball-Reference's player_id to bref_id and add the NBA.com id where linked."""
    d = d.rename(columns={"player_id": "bref_id"})
    d = d.merge(player_ids()[["bref_id", "nba_player_id"]], on="bref_id", how="left")
    d["nba_player_id"] = d["nba_player_id"].astype("Int64")
    d.insert(1, "season_label", d["season"].map(C.season_str))
    return d


@lru_cache
def players() -> pd.DataFrame:
    """Basketball-Reference season totals and advanced stats, one row per player-season since 1979-80."""
    p = load.bref_combined("Player Totals")
    p = p[p["season"] >= C.THREE_POINT_LINE_SEASON]
    adv = load.bref_combined("Advanced")[["season", "player_id", *PLAYER_ADVANCED]]
    p = p.merge(adv, on=["season", "player_id"], how="left").rename(columns={**PLAYER_STATS, **PLAYER_ADVANCED})
    p["usg_pct"] = p["usg_pct"] / 100  # Basketball-Reference gives 25.3, NBA.com 0.253
    p = _with_nba_ids(p)
    return p[["season", "season_label", "bref_id", "nba_player_id", "player", "pos", "age", "team", "last_team",
              *PLAYER_STATS.values(), *PLAYER_ADVANCED.values()]].sort_values(["season", "player"])


def awards() -> pd.DataFrame:
    """Voting for every NBA award Basketball-Reference tracks (MVP since 1955-56, ROY, DPOY, SMOY, MIP,
    Clutch POY), one row per player who received votes."""
    a = load.bref("Player Award Shares")
    a = a[a["award"].str.startswith("nba ")].assign(award=lambda d: d["award"].str[4:])
    a = _with_nba_ids(a).rename(columns={"first": "first_place_votes"})
    return a[["season", "season_label", "award", "player", "bref_id", "nba_player_id", "age",
              "first_place_votes", "pts_won", "pts_max", "share", "winner"]].sort_values(
        ["season", "award", "share"], ascending=[True, True, False])


def all_league_teams() -> pd.DataFrame:
    t = load.bref("End of Season Teams")
    t = _with_nba_ids(t).rename(columns={"type": "selection", "number_tm": "team_rank"})
    return t[["season", "season_label", "selection", "team_rank", "player", "bref_id", "nba_player_id",
              "position"]].sort_values(["season", "selection", "team_rank"])


def all_stars() -> pd.DataFrame:
    s = _with_nba_ids(load.bref("All-Star Selections")).rename(columns={"team": "all_star_team"})
    return s[["season", "season_label", "player", "bref_id", "nba_player_id", "all_star_team",
              "replaced"]].sort_values(["season", "player"])


# --- Data dictionary --------------------------------------------------------

TABLES = {
    "teams": (teams, "One row per team per season since 1979-80: data/clean/team_seasons.csv with every "
                     "Basketball-Reference column.", {
        "team_id / team / team_name": "NBA.com franchise id, abbreviation and name that season",
        "bref_team / bref_abbr": "Basketball-Reference name and abbreviation (the join key with season)",
        "playoffs": "Made the playoffs",
        "ppg ... efg": "As in data/clean/team_seasons.csv",
        "ortg / drtg / net_rtg / pace": "Basketball-Reference's ratings and pace (its possession estimate)",
        "srs / mov / ts_pct / age": "Simple rating system, margin of victory, true shooting %, average player age",
        "min ... pts": "Season totals"}),
    "players": (players, "Basketball-Reference season totals and advanced stats, one row per player-season "
                         "since 1979-80 (no minimum minutes).", {
        "bref_id": "Basketball-Reference player id (the slug in the player's page URL)",
        "nba_player_id": "NBA.com player id, blank if the player never played in 1996-97 or later",
        "team / last_team": "Teams in the order played (e.g. DAL/LAL) and the final one",
        "gp ... fta": "Season totals",
        "per / ts_pct / usg_pct": "Player efficiency rating, true shooting %, usage rate (0-1)",
        "ows / dws / ws / ws_48": "Win shares (offensive, defensive, total, per 48 minutes)",
        "obpm / dbpm / bpm / vorp": "Box plus/minus and value over replacement player"}),
    "player_ids": (player_ids, "Basketball-Reference id ↔ NBA.com id, one row per player who played in "
                               "1996-97 or later.", {
        "player / nba_name": "Name as Basketball-Reference and NBA.com spell it",
        "first_season / last_season / seasons": "Seasons linked (1996-97 on)",
        "match": "name, or games+points when the names differ (see the cleaning rules)"}),
    "awards": (awards, "Award voting since 1955-56, one row per player with votes.", {
        "award": "mvp, roy, dpoy, smoy, mip or clutch_poy",
        "first_place_votes / pts_won / pts_max": "Voting points", "share": "pts_won / pts_max",
        "winner": "Won the award (co-winners possible)"}),
    "all_league_teams": (all_league_teams, "All-NBA, All-Defensive and All-Rookie selections.", {
        "selection": "All-NBA, All-Defense or All-Rookie", "team_rank": "1st, 2nd or 3rd team",
        "position": "Position slot, where the team had one"}),
    "all_stars": (all_stars, "All-Star selections, one row per player per season.", {
        "all_star_team": "The side he was picked for that year (e.g. East, Team LeBron)",
        "replaced": "Named but replaced (injury)"}),
}

CLEANING_RULES = [
    "Basketball-Reference tables come from a pinned Kaggle version (config.BREF_VERSION). ABA and BAA rows "
    "are dropped, and seasons are renamed to their starting year (Basketball-Reference's 2026 = 2025-26).",
    "Players: a traded player keeps Basketball-Reference's combined row (2TM/3TM, or TOT before 2024-25), "
    "with every team he played for listed in order.",
    "Player ids are linked season by season from 1996-97, when NBA.com's player tables start: first by name "
    "(accents, punctuation and Jr./III suffixes ignored; same games played when two players share a name), "
    f"then by the same games played and points within {POINTS_SLACK} for nicknames and spellings. A link "
    "applies to the player's whole career.",
]


# --- Validation -------------------------------------------------------------

def _check(name: str, ok, detail: str) -> dict:
    status = "INFO" if ok is None else ("PASS" if ok else "FAIL")
    return {"check": name, "status": status, "detail": detail}


def checks() -> list:
    out = []
    ids = player_ids()
    dup = ids["bref_id"].duplicated().sum() + ids["nba_player_id"].duplicated().sum()
    out.append(_check("Player ids link one to one", bool(dup == 0), f"{len(ids):,} players, {int(dup)} conflicts"))
    links = player_season_links()
    n = load.player_seasons()
    by = links["match"].value_counts()
    out.append(_check("NBA.com player-seasons linked to Basketball-Reference", bool(len(links) == len(n)),
                      f"{len(links):,} of {len(n):,}: " + ", ".join(f"{k} {v:,}" for k, v in by.items())))
    p = players()
    recent = p[p["season"] >= C.DETAIL_FIRST_SEASON]
    out.append(_check("Basketball-Reference player-seasons with an NBA.com id", None,
                      f"{recent['nba_player_id'].notna().mean():.1%} of {len(recent):,} since "
                      f"{C.season_str(C.DETAIL_FIRST_SEASON)}; {p['nba_player_id'].notna().mean():.1%} since "
                      f"{C.season_str(C.THREE_POINT_LINE_SEASON)}"))

    a = awards()
    winners = a[a["winner"]].groupby(["season", "award"]).size()
    co = winners[winners > 1]
    out.append(_check("One winner per award and season", None,
                      f"{len(winners):,} awards; co-winners: " + (", ".join(
                          f"{award} {C.season_str(season)}" for season, award in co.index) or "none")))
    return out
