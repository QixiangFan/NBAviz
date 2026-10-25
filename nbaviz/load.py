"""Turn the raw CSV cache (NBA.com and Basketball-Reference) into tidy analysis tables. Never touches the network."""
from functools import lru_cache

import numpy as np
import pandas as pd

from . import config as C


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
    frames = []
    for f in _files(dataset, group, seasons):
        try:
            df = pd.read_csv(f, dtype={"GAME_ID": str}, **read_kw)
        except pd.errors.EmptyDataError:
            continue
        if f.stem[:4].isdigit():
            df["season"] = int(f.stem[:4])
        frames.append(df)
    return pd.concat([f for f in frames if not f.empty], ignore_index=True)


# --- Basketball-Reference ----------------------------------------------------

@lru_cache
def bref(table: str) -> pd.DataFrame:
    """One Basketball-Reference table (e.g. "Team Summaries"), NBA rows only (no ABA or BAA), with
    `season` turned into the starting year used everywhere else. "NA" cells become NaN."""
    path = C.RAW_DIR / "bref" / f"v{C.BREF_VERSION}" / f"{table}.csv"
    if not path.exists():
        raise FileNotFoundError(f"{path} is missing. Run: python collect_data.py bref")
    df = pd.read_csv(path)
    if "lg" in df:
        df = df[df["lg"] == "NBA"].drop(columns="lg")
    df["season"] = df["season"] - 1
    return df.reset_index(drop=True)


def bref_combined(table: str) -> pd.DataFrame:
    """A player table with one row per player-season. Basketball-Reference lists a traded player once
    per team plus a combined 2TM/3TM row (TOT before 2024-25); keep the combined row, and set `team` to
    the teams in the order played (e.g. "PHO/DAL") and `last_team` to the final one."""
    df = bref(table)
    combined = df["team"].str.fullmatch(r"\dTM|TOT")
    stints = df[~combined].groupby(["season", "player_id"], sort=False)["team"]
    df = df[combined | ~df.duplicated(["season", "player_id"], keep=False)].copy()
    keys = pd.MultiIndex.from_frame(df[["season", "player_id"]])
    df["team"] = stints.agg("/".join).reindex(keys).to_numpy()
    df["last_team"] = stints.last().reindex(keys).to_numpy()
    return df.reset_index(drop=True)


# --- Teams -----------------------------------------------------------------
# Team and league season stats come from Basketball-Reference, whose totals are complete from 1979-80
# (NBA.com's game logs leave 3PA blank for most games before 1985-86). The NBA.com game logs give each
# team-season its franchise id and abbreviation, which the logos and the player tables use.

TEAM_ALIASES = {"LA Clippers": "Los Angeles Clippers"}  # NBA.com's name from 2015-16 -> Basketball-Reference's
RATINGS = {"o_rtg": "ortg", "d_rtg": "drtg", "n_rtg": "net_rtg", "pace": "pace", "srs": "srs", "mov": "mov",
           "ts_percent": "ts_pct", "age": "age"}


def _shooting(d: pd.DataFrame, games: str) -> pd.DataFrame:
    """Per-game and rate stats from Basketball-Reference season totals."""
    d["ppg"] = d["pts"] / d[games]
    d["fg3m_pg"] = d["x3p"] / d[games]
    d["fg3a_pg"] = d["x3pa"] / d[games]
    d["fg3a_rate"] = d["x3pa"] / d["fga"]
    d["fg3_pct"] = d["x3p"] / d["x3pa"]
    d["efg"] = (d["fg"] + 0.5 * d["x3p"]) / d["fga"]
    return d


@lru_cache
def team_records() -> pd.DataFrame:
    """NBA.com franchise id, abbreviation, name, games and wins per team-season, from the game logs.
    Games listed with no result are left out (one cancelled game: BOS-IND, 2013-04-16)."""
    g = _read("team_game_logs", "gamelogs", seasons=range(C.GAMELOG_FIRST_SEASON, C.LAST_SEASON + 1),
              usecols=["GAME_ID", "TEAM_ID", "TEAM_ABBREVIATION", "TEAM_NAME", "WL"])
    g = g[g["WL"].notna()]
    r = g.groupby(["season", "TEAM_ID"]).agg(
        team=("TEAM_ABBREVIATION", "last"), team_name=("TEAM_NAME", "last"),
        games=("WL", "size"), wins=("WL", lambda wl: int((wl == "W").sum())))
    return r.reset_index().rename(columns={"TEAM_ID": "team_id"})


@lru_cache
def team_join() -> pd.DataFrame:
    """Basketball-Reference team-seasons since 1979-80, outer-joined with team_records on season and team
    name. `_merge` is "both" for every row when the join is complete."""
    b = bref("Team Totals")
    b = b[(b["season"] >= C.THREE_POINT_LINE_SEASON) & (b["team"] != "League Average")]
    b = b.merge(bref("Team Summaries")[["season", "team", "w", "l", *RATINGS]], on=["season", "team"])
    b = _shooting(b, "g").rename(columns={"team": "bref_team", "abbreviation": "bref_abbr", "g": "games",
                                          "w": "wins", "l": "losses", **RATINGS})
    n = team_records().rename(columns={"games": "nba_games", "wins": "nba_wins"})
    n["bref_team"] = n["team_name"].replace(TEAM_ALIASES)
    return b.merge(n, on=["season", "bref_team"], how="outer", indicator=True)


@lru_cache
def team_seasons() -> pd.DataFrame:
    """Basketball-Reference season totals, rates and ratings per team, with NBA.com's id and abbreviation."""
    t = team_join()
    t = t[t["_merge"] == "both"].drop(columns="_merge")
    t = t.astype({c: int for c in ["team_id", "games", "wins", "losses", "nba_games", "nba_wins"]})
    t["win_pct"] = t["wins"] / t["games"]
    return t.reset_index(drop=True)


@lru_cache
def league_seasons() -> pd.DataFrame:
    """Every team's totals summed per season, as per-team-game rates, with pace, offensive rating and
    true shooting % from Basketball-Reference's League Average row."""
    s = team_seasons().groupby("season")[["games", "pts", "fg", "fga", "x3p", "x3pa"]].sum()
    s = _shooting(s, "games").rename(columns={"games": "team_games"})
    avg = bref("Team Summaries")
    avg = avg[avg["team"] == "League Average"].set_index("season")[["pace", "o_rtg", "ts_percent"]]
    return s.join(avg.rename(columns=RATINGS)).reset_index()


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
