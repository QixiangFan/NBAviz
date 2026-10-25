"""Clean, analysis-ready tables for the website, and the checks that back them up.

Each table function returns one DataFrame that build_clean_data.py writes to data/clean/.
Everything is derived from the raw cache through load.py; nothing here touches the network.
Team and league tables come from Basketball-Reference; shots and players from NBA.com.
"""
import numpy as np
import pandas as pd

from . import config as C
from . import load

ERAS = [(C.THREE_POINT_LINE_SEASON, 1999), (2000, 2011), (2012, 2019), (2020, C.LAST_SEASON)]
WIN_METRICS = {"fg3a_rate": "3PA rate (volume)", "fg3_pct": "3P% (accuracy)", "efg": "eFG% (overall efficiency)"}
RADAR = {  # player radar axis -> per-game (or rate) column it ranks
    "scoring": "pts_pg", "threes": "fg3m_pg", "playmaking": "ast_pg",
    "rebounding": "reb_pg", "defense": "stocks_pg", "efficiency": "ts_pct",
}
PLAYER_MIN_MINUTES, PLAYER_MIN_GAMES = 500, 20
SHOT_TABLES = ["zone_seasons", "shot_grid"]  # need every shot chart; build_clean_data.py --partial keeps them


def _period(first: int, last: int) -> str:
    return C.season_str(first) if first == last else f"{C.season_str(first)} to {C.season_str(last)}"


# --- Tables ----------------------------------------------------------------

def league_seasons() -> pd.DataFrame:
    s = load.league_seasons().copy()
    s["season_label"] = s["season"].map(C.season_str)
    s["shortened"] = s["season"].map(C.SHORTENED_SEASONS).fillna("")
    return s[["season", "season_label", "team_games", "ppg", "fg3m_pg", "fg3a_pg", "fg3a_rate",
              "fg3_pct", "efg", "pace", "ortg", "shortened"]]


def team_seasons() -> pd.DataFrame:
    t = load.team_seasons().copy()
    for col in WIN_METRICS:
        by = t.groupby("season")[col]
        t[f"{col}_z"] = (t[col] - by.transform("mean")) / by.transform("std")
    return t[["season", "team_id", "team", "team_name", "games", "wins", "win_pct", "fg3a_pg",
              *WIN_METRICS, "ortg", "drtg", "net_rtg", *(f"{c}_z" for c in WIN_METRICS)]]


def _periods(t: pd.DataFrame) -> list:
    """Every single season, then each era, then everything pooled."""
    seasons = sorted(t["season"].unique())
    return [(s, s) for s in seasons] + ERAS + [(seasons[0], seasons[-1])]


def win_correlations() -> pd.DataFrame:
    """Pearson r between each metric and win %. Multi-season periods pool the within-season
    z-scores, so a team is only compared with the league it actually played in."""
    t = team_seasons()
    rows = []
    for first, last in _periods(t):
        d = t[t["season"].between(first, last)]
        for col in WIN_METRICS:
            rows.append({"period": _period(first, last), "first_season": first, "last_season": last,
                         "metric": col, "r": d[f"{col}_z"].corr(d["win_pct"]), "n": len(d)})
    return pd.DataFrame(rows)


def quadrants() -> pd.DataFrame:
    """Average win % of teams above/below the league average in 3PA rate and in 3P%."""
    t = team_seasons()
    t["volume"] = np.where(t["fg3a_rate_z"] > 0, "high", "low")
    t["accuracy"] = np.where(t["fg3_pct_z"] > 0, "high", "low")
    rows = []
    for first, last in ERAS + [(t["season"].min(), t["season"].max())]:
        d = t[t["season"].between(first, last)]
        g = d.groupby(["volume", "accuracy"])["win_pct"].agg(win_pct="mean", n="size").reset_index()
        g.insert(0, "period", _period(first, last))
        rows.append(g)
    return pd.concat(rows, ignore_index=True)


def zone_seasons() -> pd.DataFrame:
    z = load.shot_zones()
    z["season_label"] = z["season"].map(C.season_str)
    return z[["season", "season_label", "zone", "fga", "fgm", "share", "pps"]]


def shot_grid() -> pd.DataFrame:
    g = load.shot_grid()
    return g[g["x"].notna()].drop(columns="relabeled").astype({"fga": int, "fgm": int})


def player_seasons() -> pd.DataFrame:
    p = load.player_seasons()
    p = p[(p["min"] >= PLAYER_MIN_MINUTES) & (p["gp"] >= PLAYER_MIN_GAMES)].copy()
    for col in ("pts", "fg3m", "ast", "reb"):
        p[f"{col}_pg"] = p[col] / p["gp"]
    p["stocks_pg"] = (p["stl"] + p["blk"]) / p["gp"]
    p["ts_pct"] = p["pts"] / (2 * (p["fga"] + 0.44 * p["fta"]))
    p["fg3a_rate"] = p["fg3a"] / p["fga"]
    for axis, col in RADAR.items():
        p[f"{axis}_pctl"] = (100 * p.groupby("season")[col].rank(pct=True)).round().astype(int)
    p = p.rename(columns={"team_abbreviation": "team", "player_height_inches": "height_in"})
    p = p.round({**{c: 2 for c in RADAR.values()}, "ts_pct": 3, "fg3a_rate": 3, "min": 0})
    return p[["season", "player_id", "player_name", "team", "age", "height_in", "gp", "min",
              *RADAR.values(), "fg3a_rate", *(f"{a}_pctl" for a in RADAR)]]


def events(zones=None) -> pd.DataFrame:
    """Rule changes and milestones for the timeline. Numbers come from our own tables.
    Worded as things that happened at the same time as the trend, not as its cause.
    `zones` is a zone_seasons table to use instead of rebuilding it from the shot charts."""
    zones = (load.shot_zones() if zones is None else zones).pivot(index="season", columns="zone", values="share")
    threes = zones["Corner 3"] + zones["Above the Break 3"]
    crossover = int(threes[threes > zones["Mid-Range"]].index[0])
    teams = load.team_seasons().set_index(["season", "team"])
    hou = teams.loc[(2018, "HOU"), "fg3a_pg"]
    p = load.player_seasons()
    curry = int(p.loc[(p["season"] == 2015) & (p["player_name"] == "Stephen Curry"), "fg3m"].iloc[0])
    rows = [
        (1979, "rule", "3-point line arrives", "The NBA adopts a 23 ft 9 in arc (22 ft in the corners)."),
        (1994, "rule", "Line moved in to 22 ft", "From 1994-95 to 1996-97 the arc is a uniform 22 ft."),
        (1997, "rule", "Line moved back", "The arc returns to 23 ft 9 in."),
        (2001, "rule", "Zone defense allowed", "Illegal-defense rules are dropped and a defensive "
                                               "3-second rule is added."),
        (2004, "rule", "Hand-checking banned", "Defenders may no longer hand-check ball handlers on the perimeter."),
        (crossover, "milestone", "Threes pass the mid-range",
         f"{C.season_str(crossover)} is the first season with more 3-point than mid-range attempts."),
        (2015, "milestone", f"Curry makes {curry} threes",
         "Stephen Curry sets the single-season record and is the first unanimous MVP."),
        (2018, "rule", "14-second reset", f"The shot clock resets to 14 s after an offensive rebound; "
                                          f"Houston attempts a record {hou:.1f} threes per game."),
    ]
    e = pd.DataFrame(rows, columns=["season", "kind", "label", "detail"])
    e.insert(1, "season_label", e["season"].map(C.season_str))
    return e.sort_values("season", kind="stable")


# --- Data dictionary --------------------------------------------------------

TABLES = {
    "league_seasons": (league_seasons, "League averages per team-game, one row per season since 1979-80.", {
        "season": "Starting year (2025 = 2025-26)", "season_label": "e.g. 2025-26",
        "team_games": "Team-games played league-wide", "ppg": "Points per team-game",
        "fg3m_pg": "3-pointers made per team-game", "fg3a_pg": "3-point attempts per team-game",
        "fg3a_rate": "Share of field-goal attempts that were threes",
        "fg3_pct": "3-point percentage", "efg": "Effective FG%: (FGM + 0.5 × 3PM) / FGA",
        "pace": "Possessions per 48 min (Basketball-Reference's estimate)",
        "ortg": "Points per 100 possessions (Basketball-Reference's estimate)",
        "shortened": "Why the season was short (lockout / COVID), else blank"}),
    "team_seasons": (team_seasons, "One row per team per season since 1979-80.", {
        "team_id": "NBA.com franchise id (stable across moves and renames)",
        "team": "NBA.com abbreviation used that season", "team_name": "NBA.com name used that season",
        "games / wins / win_pct": "Regular-season record",
        "fg3a_pg / fg3a_rate / fg3_pct / efg": "Shooting volume and accuracy (see league_seasons)",
        "ortg / drtg / net_rtg": "Points scored / allowed per 100 possessions, and the difference "
                                 "(Basketball-Reference's estimates)",
        "*_z": "Same stat as a z-score within its season (0 = that season's league average)"}),
    "win_correlations": (win_correlations, "Pearson r between win % and each shooting metric, "
                                           "per season, per era, and pooled.", {
        "period / first_season / last_season": "Season range the row covers",
        "metric": "fg3a_rate (volume), fg3_pct (accuracy) or efg (overall efficiency)",
        "r": "Correlation with win % (multi-season periods use within-season z-scores)",
        "n": "Team-seasons in the period"}),
    "quadrants": (quadrants, "Average win % by above/below-average 3PA rate × 3P%, per era.", {
        "volume / accuracy": "high = above that season's league average",
        "win_pct": "Mean win %", "n": "Team-seasons in the group"}),
    "zone_seasons": (zone_seasons, "League shot mix by court zone, one row per season × zone since 1996-97, "
                                   "computed from the shot charts.", {
        "zone": "NBA.com zone name (Corner 3 = left + right corner)", "fga / fgm": "Attempts / makes",
        "share": "Share of the season's attempts", "pps": "Points per attempt"}),
    "shot_grid": (shot_grid, "Every field-goal attempt binned into 1 ft × 1 ft half-court cells by "
                             "shot zone, per season (the website samples shot particles from it).", {
        "x / y": "Lower-left corner of the cell in feet from the hoop (x: left/right, y: towards half court)",
        "zone": "RA = restricted area, PAINT = paint outside it, MID = mid-range, C3 = corner three, "
                "AB3 = above-the-break three",
        "fga / fgm": "Attempts and makes from the cell in that zone"}),
    "player_seasons": (player_seasons, f"Players with {PLAYER_MIN_MINUTES}+ minutes and {PLAYER_MIN_GAMES}+ "
                                       "games, one row per player-season since 1996-97.", {
        "team": "Last team that season (traded players appear once)",
        "*_pg": "Per-game averages; stocks = steals + blocks", "ts_pct": "True shooting %",
        "*_pctl": "Percentile (0-100) within the season among qualified players, for the radar"}),
    "events": (events, "Hand-picked rule changes and milestones for the timeline.", {
        "kind": "rule or milestone", "label / detail": "Short label and one-sentence note"}),
}

CLEANING_RULES = [
    "Team and league stats come from Basketball-Reference's season totals (Kaggle, pinned version), which "
    "are complete from 1979-80, the first season with a 3-point line. NBA.com's game logs leave 3PA blank "
    "for most games before 1985-86, so they are only used for team ids and to cross-check games and wins. "
    "League rows sum every team's totals; pace and offensive rating are Basketball-Reference's estimates.",
    "Each Basketball-Reference team-season gets NBA.com's franchise id by season and team name (NBA.com's "
    "\"LA Clippers\", from 2015-16, is Basketball-Reference's \"Los Angeles Clippers\"). Relocations and renames "
    "(Seattle → Oklahoma City, New Jersey → Brooklyn, Charlotte/New Orleans) stay one franchise; labels use "
    "NBA.com's abbreviation for that season, as in the player tables.",
    "One game was cancelled (Indiana at Boston, 2013-04-16), so Boston and Indiana have 81 games in 2012-13; "
    "NBA.com lists it with no result and it is left out of the cross-check.",
    "Lockout and COVID seasons (1998-99, 2011-12, 2019-20, 2020-21) are kept but flagged; every comparison "
    "uses per-game rates or win %, never season totals.",
    "To compare teams across eras, shooting stats are also given as z-scores within their own season.",
    "Shot charts: team files for franchises that did not exist that season are empty and skipped; heaves "
    "from beyond half court are dropped from the grid but counted when checking totals.",
    "Shot zones are rebuilt from the shot charts and must agree with the shot type. NBA.com draws its "
    "zones with today's 23.75 ft arc, so in 1996-97, when the line was 22 ft all around, 19,165 threes "
    "(a tenth of all shots) are labeled Mid-Range. That inflated the season's mid-range share from 29.8% "
    "to 40.0%. Threes outside a 3-point zone are moved to the corner or above-the-break zone by location, "
    "and twos inside one to Mid-Range. Left and right corners are combined; backcourt heaves are excluded.",
    "Players: traded players have one combined row under their last team. The radar only ranks players "
    f"with {PLAYER_MIN_MINUTES}+ minutes and {PLAYER_MIN_GAMES}+ games, against the same season's players.",
]


# --- Validation -------------------------------------------------------------

def _check(name: str, ok, detail: str) -> dict:
    status = "INFO" if ok is None else ("PASS" if ok else "FAIL")
    return {"check": name, "status": status, "detail": detail}


def checks(shot_grid=None) -> list:
    """Validation results. `shot_grid` is a shot_grid table kept from an earlier full build (partial
    build): attempts are then checked against it, and the checks that need the raw shot charts are skipped."""
    out = []
    j = load.team_join()
    alone = j[j["_merge"] != "both"]
    side = {"left_only": "Basketball-Reference only", "right_only": "NBA.com only"}
    out.append(_check("Every Basketball-Reference team-season has an NBA.com id", alone.empty,
                      f"{int((j['_merge'] == 'both').sum()):,} matched; unmatched: " + (", ".join(
                          f"{name} {C.season_str(season)} ({side[m]})"
                          for name, season, m in zip(alone["bref_team"], alone["season"], alone["_merge"])) or "none")))
    t = load.team_seasons()
    diff = t[(t["games"] != t["nba_games"]) | (t["wins"] != t["nba_wins"])]
    out.append(_check("Games and wins match NBA.com's game logs", diff.empty,
                      f"{len(t):,} team-seasons, {len(diff)} differences" + "".join(
                          f"; {r.team} {C.season_str(r.season)}: {r.wins}-{r.games} vs {r.nba_wins}-{r.nba_games}"
                          for r in diff.itertuples())))
    wl = t.groupby("season")[["wins", "losses"]].sum()
    out.append(_check("League wins = losses in every season", bool((wl["wins"] == wl["losses"]).all()),
                      f"{len(wl)} seasons"))
    full = t[~t["season"].isin(C.SHORTENED_SEASONS)]
    short = full[full["games"] != 82]
    out.append(_check("Every team plays 82 games in full seasons", None,
                      "exceptions: " + (", ".join(f"{r.team} {C.season_str(r.season)} ({r.games})"
                                                  for r in short.itertuples()) or "none")))

    ts = team_seasons()
    rates = ["win_pct", "fg3a_rate", "fg3_pct", "efg"]
    out.append(_check("Win % and shooting rates lie in [0, 1]",
                      bool(ts[rates].apply(lambda c: c.between(0, 1)).all().all()),
                      f"{len(ts):,} team-seasons, no missing values: {not ts[rates].isna().any().any()}"))
    ls = league_seasons()
    out.append(_check("League 3-point stats cover every season",
                      bool(ls[["fg3m_pg", "fg3a_pg", "fg3a_rate", "fg3_pct"]].notna().all().all()),
                      f"{len(ls)} seasons, {C.season_str(ls['season'].min())} to {C.season_str(ls['season'].max())}"))

    team_fga = t.groupby("season")["fga"].sum()
    kept = shot_grid is not None
    grid = (shot_grid if kept else load.shot_grid()).groupby("season")["fga"].sum()
    gap = (grid / team_fga.reindex(grid.index) - 1).abs()
    out.append(_check("Shot-chart attempts match team FGA (within 1%)", bool((gap < 0.01).all()),
                      f"{len(grid)} seasons ({C.season_str(grid.index.min())} to {C.season_str(grid.index.max())}); "
                      f"largest gap {gap.max():.2%} in {C.season_str(gap.idxmax())}"
                      + ("; kept shot_grid, so heaves from beyond half court are not counted" if kept else "")))
    if kept:
        out.append(_check("Shot charts rebuilt", None, "skipped (partial build): shot_grid and zone_seasons "
                                                       "are kept from the last full build"))
    else:
        empty = [f.stem for f in load._files("shot_chart", "shots") if f.stat().st_size < 200]
        out.append(_check("Empty shot-chart files skipped", None, f"{len(empty)}: {', '.join(empty) or 'none'}"))

        relabeled = load.shot_grid().groupby("season")["relabeled"].sum()
        worst = relabeled.idxmax()
        out.append(_check("Shot zones relabeled to match the shot type", None,
                          f"{int(relabeled.sum()):,} shots in total; {int(relabeled[worst]):,} in "
                          f"{C.season_str(worst)} (22 ft line), at most {int(relabeled.drop(worst).max()):,} "
                          "in any other season"))

    p = load.player_seasons()
    player_pts = p.groupby("season")["pts"].sum()
    team_pts = t.groupby("season")["pts"].sum().reindex(player_pts.index)
    gap = (player_pts / team_pts - 1).abs()
    out.append(_check("Player points add up to team points (within 0.5%)", bool((gap < 0.005).all()),
                      f"largest gap {gap.max():.2%} in {C.season_str(gap.idxmax())}"))
    return out
