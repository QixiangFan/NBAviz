"""Turn the raw CSV cache into tidy analysis tables. Never touches the network."""
from functools import lru_cache

import numpy as np
import pandas as pd

from . import config as C

BOX_STATS = ["pts", "fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "oreb", "dreb", "tov", "min"]


def _files(dataset: str, group: str, seasons=None) -> list:
    """Raw CSVs of one dataset, optionally only those whose file name starts with one of the seasons."""
    files = sorted((C.RAW_DIR / dataset).glob("*.csv"))
    if seasons is not None:
        files = [f for f in files if f.stem[:4].isdigit() and int(f.stem[:4]) in seasons]
    if not files:
        raise FileNotFoundError(f"No data in {C.RAW_DIR / dataset}. Run: python collect_data.py {group}")
    return files


def _read(dataset: str, group: str, seasons=None, **read_kw) -> pd.DataFrame:
    """Concatenate data/raw/<dataset>/*.csv, tagging each row with the season in its file name."""
    dtype = {"GAME_ID": str, **read_kw.pop("dtype", {})}
    frames = []
    for f in _files(dataset, group, seasons):
        try:
            df = pd.read_csv(f, dtype=dtype, **read_kw)
        except pd.errors.EmptyDataError:
            continue
        if f.stem[:4].isdigit():
            df["season"] = int(f.stem[:4])
        frames.append(df)
    return pd.concat([f for f in frames if not f.empty], ignore_index=True)


# Season-level stats, and the box-score columns every game must report for the stat to be trusted.
# NBA.com's logs leave FGA blank before 1981-82 and 3PA, turnovers and rebounds blank for most games
# before 1985-86; summing the few games that have them gives 3P% above 100% and a pace of 1.
STAT_INPUTS = {
    "fg3m_pg": ["fg3m"], "fg3a_pg": ["fg3a"], "fg3_pct": ["fg3m", "fg3a"],
    "fg3a_rate": ["fga", "fg3a"], "efg": ["fgm", "fga", "fg3m"], "opp_efg": ["fgm", "fga", "fg3m"],
    "pace": ["fga", "fta", "oreb", "tov"], "ortg": ["fga", "fta", "oreb", "tov"],
    "drtg": ["fga", "fta", "oreb", "tov"], "net_rtg": ["fga", "fta", "oreb", "tov"],
    "tov_pct": ["fga", "fta", "tov"], "opp_tov_pct": ["fga", "fta", "tov"],
    "orb_pct": ["oreb", "dreb"], "opp_orb_pct": ["oreb", "dreb"],
    "ft_rate": ["ftm", "fga"], "opp_ft_rate": ["ftm", "fga"],
}


def _blank_incomplete(table: pd.DataFrame, games: pd.DataFrame) -> pd.DataFrame:
    """Set each stat in STAT_INPUTS to NaN in seasons where too few games report its inputs."""
    for stat, inputs in STAT_INPUTS.items():
        if stat in table:
            share = games[inputs].notna().all(axis=1).groupby(games["season"]).mean()
            complete = table["season"].map(share >= C.COMPLETE_SHARE).fillna(False).astype(bool)
            table.loc[~complete, stat] = np.nan
    return table


# --- Team games ------------------------------------------------------------

@lru_cache
def team_games() -> pd.DataFrame:
    """One row per team per game, with the opponent's box score alongside."""
    df = _read("team_game_logs", "gamelogs").rename(columns=str.lower)
    df = df[df["wl"].notna()]  # cancelled games are listed with no result and 0 points (BOS-IND, 2013-04-16)
    df = df.rename(columns={"team_abbreviation": "team"})
    df["win"] = (df["wl"] == "W").astype(int)

    opp = df[["season", "game_id", "team_id", "team"] + BOX_STATS]
    opp = opp.rename(columns={c: f"opp_{c}" for c in ["team_id", "team"] + BOX_STATS})
    g = df.merge(opp, on=["season", "game_id"])
    g = g[g["team_id"] != g["opp_team_id"]].copy()

    # Team logs report minutes as the sum over five players (240 per regulation game).
    g["game_min"] = np.where(g["min"] > 150, g["min"] / 5, g["min"])
    g["game_min"] = g["game_min"].fillna(48.0)
    for side in ("", "opp_"):
        g[f"{side}poss"] = (g[f"{side}fga"] - g[f"{side}oreb"] + g[f"{side}tov"]
                            + 0.44 * g[f"{side}fta"])
    return g.reset_index(drop=True)


@lru_cache
def team_seasons() -> pd.DataFrame:
    """Season totals and rate stats per team, including Dean Oliver's four factors for both sides."""
    g = team_games()
    cols = BOX_STATS + [f"opp_{c}" for c in BOX_STATS] + ["poss", "opp_poss", "game_min", "win"]
    t = g.groupby(["season", "team_id"])[cols].sum(min_count=1)
    t["games"] = g.groupby(["season", "team_id"]).size()
    t["team"] = g.groupby(["season", "team_id"])["team"].last()
    t["team_name"] = g.groupby(["season", "team_id"])["team_name"].last()
    t = t.reset_index()

    t["win_pct"] = t["win"] / t["games"]
    t["fg3a_rate"] = t["fg3a"] / t["fga"]
    t["fg3_pct"] = t["fg3m"] / t["fg3a"]
    t["ortg"] = 100 * t["pts"] / t["poss"]
    t["drtg"] = 100 * t["opp_pts"] / t["opp_poss"]
    t["net_rtg"] = t["ortg"] - t["drtg"]
    t["pace"] = 48 * (t["poss"] + t["opp_poss"]) / 2 / t["game_min"]
    for side, other in (("", "opp_"), ("opp_", "")):
        t[f"{side}efg"] = (t[f"{side}fgm"] + 0.5 * t[f"{side}fg3m"]) / t[f"{side}fga"]
        t[f"{side}tov_pct"] = t[f"{side}tov"] / (t[f"{side}fga"] + 0.44 * t[f"{side}fta"] + t[f"{side}tov"])
        t[f"{side}orb_pct"] = t[f"{side}oreb"] / (t[f"{side}oreb"] + t[f"{other}dreb"])
        t[f"{side}ft_rate"] = t[f"{side}ftm"] / t[f"{side}fga"]
    t["fg3a_pg"] = t["fg3a"] / t["games"]
    return _blank_incomplete(t, g)


@lru_cache
def league_seasons() -> pd.DataFrame:
    """League-wide per-team-game averages and rates by season."""
    g = team_games()
    s = g.groupby("season")[BOX_STATS + ["opp_dreb", "poss", "game_min"]].sum(min_count=1)
    s["team_games"] = g.groupby("season").size()
    s["ppg"] = s["pts"] / s["team_games"]
    s["fg3m_pg"] = s["fg3m"] / s["team_games"]
    s["fg3a_pg"] = s["fg3a"] / s["team_games"]
    s["fg3_pct"] = s["fg3m"] / s["fg3a"]
    s["fg3a_rate"] = s["fg3a"] / s["fga"]
    s["efg"] = (s["fgm"] + 0.5 * s["fg3m"]) / s["fga"]
    s["pace"] = 48 * s["poss"] / s["game_min"]
    s["ortg"] = 100 * s["pts"] / s["poss"]
    s["orb_pct"] = s["oreb"] / (s["oreb"] + s["opp_dreb"])
    s["tov_pct"] = s["tov"] / (s["fga"] + 0.44 * s["fta"] + s["tov"])
    return _blank_incomplete(s.reset_index(), g)


# --- Shots -----------------------------------------------------------------

SHOT_CELL = 10          # shot-chart units are tenths of a foot: 1 ft x 1 ft cells
HALF_COURT_Y = 422.5    # loc_y of the half-court line (hoop at the origin)
ZONE_CODES = {"Restricted Area": "RA", "In The Paint (Non-RA)": "PAINT", "Mid-Range": "MID",
              "Left Corner 3": "C3", "Right Corner 3": "C3", "Above the Break 3": "AB3", "Backcourt": "BACK"}
ZONE_NAMES = {"RA": "Restricted Area", "PAINT": "In The Paint (Non-RA)", "MID": "Mid-Range",
              "C3": "Corner 3", "AB3": "Above the Break 3"}
THREE_ZONES = ["C3", "AB3"]


def _cell(v: pd.Series, lo: int, n: int) -> pd.Series:
    """Lower edge, in feet, of the SHOT_CELL-wide cell holding each coordinate (n cells from lo)."""
    return ((v - lo) // SHOT_CELL).clip(0, n - 1) * SHOT_CELL / 10 + lo / 10


def _zone(d: pd.DataFrame) -> tuple:
    """Shot zone code per attempt, made to agree with the shot type, and which attempts were relabeled.

    NBA.com draws its zones with today's arc, so in 1996-97 (when the line was 22 ft all around)
    every three from 22 to 23.75 ft is labeled Mid-Range: 19,165 shots, a tenth of the season.
    The shot type (2PT/3PT) is what the referees called, so it wins: a three outside a 3-point zone
    becomes a corner or above-the-break three by location, and a two inside one becomes Mid-Range."""
    zone = d["SHOT_ZONE_BASIC"].map(ZONE_CODES).fillna("OTHER")
    three = d["SHOT_TYPE"].astype(str).str.startswith("3")
    wrong_three = three & ~zone.isin(THREE_ZONES + ["BACK"])
    wrong_two = ~three & zone.isin(THREE_ZONES)
    corner = (d["LOC_X"].abs() >= 220) & (d["LOC_Y"] <= 92.5)
    zone = zone.mask(wrong_three, np.where(corner, "C3", "AB3")).mask(wrong_two, "MID")
    return zone, wrong_three | wrong_two


@lru_cache
def shot_grid() -> pd.DataFrame:
    """League attempts and makes per season, 1 ft x 1 ft half-court cell and shot zone (see _zone).

    x, y are the cell's lower-left corner in feet from the hoop (x -25..24, y -5..42). A cell on
    a zone boundary (e.g. the 3-point line) gets one row per zone. `relabeled` counts attempts whose
    NBA.com zone disagreed with their shot type. Files are binned one at a time so all seasons never
    sit in memory together. Heaves from beyond half court are kept as rows with x = y = NaN, so
    season totals still match the game logs."""
    parts = []
    for f in _files("shot_chart", "shots"):
        d = pd.read_csv(f, usecols=["LOC_X", "LOC_Y", "SHOT_TYPE", "SHOT_ZONE_BASIC", "SHOT_MADE_FLAG"])
        if d.empty:  # franchise did not exist that season (e.g. NOP in 2000-01)
            continue
        inside = d["LOC_Y"] <= HALF_COURT_Y
        d["x"] = np.where(inside, _cell(d["LOC_X"], -250, 50), np.nan)
        d["y"] = np.where(inside, _cell(d["LOC_Y"], -50, 48), np.nan)
        d["zone"], d["relabeled"] = _zone(d)
        g = d.groupby(["x", "y", "zone"], dropna=False).agg(
            fga=("SHOT_MADE_FLAG", "size"), fgm=("SHOT_MADE_FLAG", "sum"), relabeled=("relabeled", "sum")).reset_index()
        g["season"] = int(f.stem[:4])
        parts.append(g)
    grid = pd.concat(parts, ignore_index=True)
    return grid.groupby(["season", "x", "y", "zone"], dropna=False, as_index=False)[["fga", "fgm", "relabeled"]].sum()


@lru_cache
def shot_zones() -> pd.DataFrame:
    """League totals per season and court zone (NBA.com zone names): fga, fgm, points per shot,
    share of attempts. Built from the shot charts so it matches the shot grid; backcourt heaves excluded."""
    g = shot_grid()
    z = g[g["zone"].isin(ZONE_NAMES)].groupby(["season", "zone"], as_index=False)[["fga", "fgm"]].sum()
    z["pps"] = np.where(z["zone"].isin(THREE_ZONES), 3, 2) * z["fgm"] / z["fga"]
    z["share"] = z["fga"] / z.groupby("season")["fga"].transform("sum")
    z["order"] = z["zone"].map({k: i for i, k in enumerate(ZONE_NAMES)})
    z["zone"] = z["zone"].map(ZONE_NAMES)
    return z.sort_values(["season", "order"]).drop(columns="order").reset_index(drop=True)


# --- Players ---------------------------------------------------------------

@lru_cache
def player_seasons() -> pd.DataFrame:
    """Season totals per player joined with height and usage from the bio table."""
    base = _read("player_totals", "players").rename(columns=str.lower)
    bio = _read("player_bio", "bio").rename(columns=str.lower)
    p = base.merge(bio[["season", "player_id", "player_height_inches", "usg_pct"]],
                   on=["season", "player_id"], how="left")
    if p["usg_pct"].median() > 1:  # some API versions return 25.3 instead of 0.253
        p["usg_pct"] = p["usg_pct"] / 100
    return p


@lru_cache
def player_rosters() -> pd.DataFrame:
    """Jersey number and position per season, team and player, from the season rosters. A player
    traded mid-season can be on more than one roster. Numbers stay text, so "00" is not "0"."""
    r = _read("team_rosters", "rosters", dtype={"NUM": str})
    r = r.drop(columns="SEASON", errors="ignore")  # the file name already gives the season
    r = r.rename(columns=str.lower).rename(columns={"teamid": "team_id", "num": "jersey"})
    r["jersey"] = r["jersey"].str.strip().replace("", np.nan)
    return r[["season", "team_id", "player_id", "jersey", "position"]].drop_duplicates(["season", "team_id", "player_id"])
