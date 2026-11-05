"""Clean, analysis-ready tables for the website, and the checks that back them up.

Each table function returns one DataFrame that build_clean_data.py writes to data/clean/.
Everything is derived from the raw cache through load.py; nothing here touches the network.
"""
import numpy as np
import pandas as pd

from . import config as C
from . import load

ERAS = [(1985, 1999), (2000, 2011), (2012, 2019), (2020, C.LAST_SEASON)]
WIN_METRICS = {"fg3a_rate": "3PA rate (volume)", "fg3_pct": "3P% (accuracy)", "efg": "eFG% (overall efficiency)"}
RADAR = {  # player radar axis -> per-game (or rate) column it ranks
    "scoring": "pts_pg", "threes": "fg3m_pg", "playmaking": "ast_pg",
    "rebounding": "reb_pg", "defense": "stocks_pg", "efficiency": "ts_pct",
}
PLAYER_MIN_MINUTES, PLAYER_MIN_GAMES = 500, 20


def _period(first: int, last: int) -> str:
    return C.season_str(first) if first == last else f"{C.season_str(first)} to {C.season_str(last)}"


# --- Tables ----------------------------------------------------------------

def league_seasons() -> pd.DataFrame:
    s = load.league_seasons()
    s = s[s["season"] >= C.THREE_POINT_LINE_SEASON].copy()
    s["season_label"] = s["season"].map(C.season_str)
    s["shortened"] = s["season"].map(C.SHORTENED_SEASONS).fillna("")
    return s[["season", "season_label", "team_games", "ppg", "fg3m_pg", "fg3a_pg", "fg3a_rate",
              "fg3_pct", "efg", "pace", "ortg", "orb_pct", "tov_pct", "shortened"]]


def team_seasons() -> pd.DataFrame:
    t = load.team_seasons()
    t = t[t["season"] >= C.THREE_PA_FIRST_SEASON].copy()
    for col in WIN_METRICS:
        by = t.groupby("season")[col]
        t[f"{col}_z"] = (t[col] - by.transform("mean")) / by.transform("std")
    t = t.rename(columns={"win": "wins"})
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
    p = _with_rosters(p)
    p = p.round({**{c: 2 for c in RADAR.values()}, "ts_pct": 3, "fg3a_rate": 3, "min": 0})
    return p[["season", "player_id", "player_name", "team", "jersey", "position", "age", "height_in", "gp", "min",
              *RADAR.values(), "fg3a_rate", *(f"{a}_pctl" for a in RADAR)]]


def _with_rosters(p: pd.DataFrame) -> pd.DataFrame:
    """Jersey number and position from the season rosters: the roster of the player's last team first,
    then any roster that lists him that season (traded players), else blank."""
    try:
        r = load.player_rosters()
    except FileNotFoundError:  # rosters not downloaded yet (python collect_data.py rosters)
        return p.assign(jersey=np.nan, position=np.nan)
    keys = ["season", "player_id"]
    last_team = p[keys + ["team_id"]].merge(r, on=keys + ["team_id"], how="left")
    any_team = p[keys].merge(r.drop_duplicates(keys).drop(columns="team_id"), on=keys, how="left")
    for col in ("jersey", "position"):
        p[col] = last_team[col].fillna(any_team[col]).to_numpy()
    return p


def events() -> pd.DataFrame:
    """Rule changes and milestones for the timeline. Numbers come from our own tables.
    Worded as things that happened at the same time as the trend, not as its cause."""
    zones = load.shot_zones().pivot(index="season", columns="zone", values="share")
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


# Hand-entered from NBA.com's history pages. Names are spelled as in the player totals, abbreviations
# as the team used them that season; checks() fails if one does not match.
MVPS = [
    (1996, "Karl Malone"), (1997, "Michael Jordan"), (1998, "Karl Malone"), (1999, "Shaquille O'Neal"),
    (2000, "Allen Iverson"), (2001, "Tim Duncan"), (2002, "Tim Duncan"), (2003, "Kevin Garnett"),
    (2004, "Steve Nash"), (2005, "Steve Nash"), (2006, "Dirk Nowitzki"), (2007, "Kobe Bryant"),
    (2008, "LeBron James"), (2009, "LeBron James"), (2010, "Derrick Rose"), (2011, "LeBron James"),
    (2012, "LeBron James"), (2013, "Kevin Durant"), (2014, "Stephen Curry"), (2015, "Stephen Curry"),
    (2016, "Russell Westbrook"), (2017, "James Harden"), (2018, "Giannis Antetokounmpo"),
    (2019, "Giannis Antetokounmpo"), (2020, "Nikola Jokić"), (2021, "Nikola Jokić"), (2022, "Joel Embiid"),
    (2023, "Nikola Jokić"), (2024, "Shai Gilgeous-Alexander"), (2025, "Shai Gilgeous-Alexander"),
]
CHAMPIONS = [
    (1985, "BOS"), (1986, "LAL"), (1987, "LAL"), (1988, "DET"), (1989, "DET"), (1990, "CHI"), (1991, "CHI"),
    (1992, "CHI"), (1993, "HOU"), (1994, "HOU"), (1995, "CHI"), (1996, "CHI"), (1997, "CHI"), (1998, "SAS"),
    (1999, "LAL"), (2000, "LAL"), (2001, "LAL"), (2002, "SAS"), (2003, "DET"), (2004, "SAS"), (2005, "MIA"),
    (2006, "SAS"), (2007, "BOS"), (2008, "LAL"), (2009, "LAL"), (2010, "DAL"), (2011, "MIA"), (2012, "MIA"),
    (2013, "SAS"), (2014, "GSW"), (2015, "CLE"), (2016, "GSW"), (2017, "GSW"), (2018, "TOR"), (2019, "LAL"),
    (2020, "MIL"), (2021, "GSW"), (2022, "DEN"), (2023, "BOS"), (2024, "OKC"), (2025, "NYK"),
]


def mvps() -> pd.DataFrame:
    """Regular-season MVPs since 1996-97, the first season with player data, with their NBA.com ids."""
    m = pd.DataFrame(MVPS, columns=["season", "player_name"])
    p = load.player_seasons()[["season", "player_id", "player_name"]]
    m = m.merge(p, on=["season", "player_name"], how="left")
    m.insert(1, "season_label", m["season"].map(C.season_str))
    return m[["season", "season_label", "player_id", "player_name"]].astype({"player_id": "Int64"})


def champions() -> pd.DataFrame:
    """NBA champions since 1985-86, with the franchise id and the name the team used that season."""
    c = pd.DataFrame(CHAMPIONS, columns=["season", "team"])
    t = load.team_seasons()[["season", "team", "team_id", "team_name"]]
    c = c.merge(t, on=["season", "team"], how="left")
    c.insert(1, "season_label", c["season"].map(C.season_str))
    return c[["season", "season_label", "team_id", "team", "team_name"]].astype({"team_id": "Int64"})


# --- Data dictionary --------------------------------------------------------

TABLES = {
    "league_seasons": (league_seasons, "League averages per team-game, one row per season since 1979-80.", {
        "season": "Starting year (2025 = 2025-26)", "season_label": "e.g. 2025-26",
        "team_games": "Team-games played league-wide", "ppg": "Points per team-game",
        "fg3m_pg": "3-pointers made per team-game (from 1979-80)",
        "fg3a_pg": "3-point attempts per team-game (from 1985-86)",
        "fg3a_rate": "Share of field-goal attempts that were threes (from 1985-86)",
        "fg3_pct": "3-point percentage (from 1985-86)", "efg": "Effective FG%: (FGM + 0.5 × 3PM) / FGA",
        "pace": "Possessions per 48 min (from 1985-86)", "ortg": "Points per 100 possessions (from 1985-86)",
        "orb_pct": "Offensive rebound %: share of a team's own misses it rebounds (from 1985-86)",
        "tov_pct": "Turnover %: TOV / (FGA + 0.44 × FTA + TOV), turnovers per play (from 1985-86)",
        "shortened": "Why the season was short (lockout / COVID), else blank"}),
    "team_seasons": (team_seasons, "One row per team per season since 1985-86.", {
        "team_id": "NBA.com franchise id (stable across moves and renames)",
        "team": "Abbreviation used that season", "team_name": "Name used that season",
        "games / wins / win_pct": "Regular-season record",
        "fg3a_pg / fg3a_rate / fg3_pct / efg": "Shooting volume and accuracy (see league_seasons)",
        "ortg / drtg / net_rtg": "Points scored / allowed per 100 possessions, and the difference",
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
        "jersey": "Jersey number that season, as text (\"00\" is not \"0\"); blank if no roster lists him",
        "position": "Roster position: G, F, C or a combination such as G-F",
        "*_pg": "Per-game averages; stocks = steals + blocks", "ts_pct": "True shooting %",
        "*_pctl": "Percentile (0-100) within the season among qualified players, for the radar"}),
    "events": (events, "Hand-picked rule changes and milestones for the timeline.", {
        "kind": "rule or milestone", "label / detail": "Short label and one-sentence note"}),
    "mvps": (mvps, "Regular-season MVPs since 1996-97, hand-entered from NBA.com's award history.", {
        "player_id / player_name": "NBA.com player id and name, as in player_seasons"}),
    "champions": (champions, "NBA champions since 1985-86, hand-entered from NBA.com's history.", {
        "team_id / team / team_name": "Franchise id, and the abbreviation and name the team used that season"}),
}

CLEANING_RULES = [
    "A season-level stat is kept only when at least 99% of that season's games report every box-score "
    "column it needs. NBA.com leaves FGA blank before 1981-82 and 3PA, turnovers and rebounds blank for "
    "most games before 1985-86, so 3PA-based stats, pace and ratings start in 1985-86 and 3PM in 1979-80.",
    "Teams are joined on NBA.com's franchise id, so relocations and renames (Seattle → Oklahoma City, "
    "New Jersey → Brooklyn, Charlotte/New Orleans) stay one franchise; labels use that season's abbreviation.",
    "Games listed with no result are removed (one cancelled game: Indiana at Boston, 2013-04-16, "
    "stored as two 0-point rows), so Boston and Indiana have 81 games in 2012-13.",
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
    "Jersey numbers and positions come from each team's season roster. A player traded mid-season gets "
    "the number on his last team's roster, or on any roster that lists him that season. Numbers are kept "
    "as text so 00 and 0 stay different.",
]


# --- Validation -------------------------------------------------------------

def _check(name: str, ok, detail: str) -> dict:
    status = "INFO" if ok is None else ("PASS" if ok else "FAIL")
    return {"check": name, "status": status, "detail": detail}


def checks() -> list:
    out = []
    raw = load._read("team_game_logs", "gamelogs")
    cancelled = raw[raw["WL"].isna() & raw["MATCHUP"].str.contains("@")]  # one row per game: the away side
    out.append(_check("Games with no result removed", None, f"{len(cancelled)} cancelled: " +
                      ", ".join(cancelled["GAME_DATE"] + " " + cancelled["MATCHUP"])))
    raw = raw[raw["WL"].notna()]
    per_game = raw.groupby(["season", "GAME_ID"]).size()
    out.append(_check("Every game has exactly two team rows", bool((per_game == 2).all()),
                      f"{len(per_game):,} games, {int((per_game != 2).sum())} exceptions"))
    wl = raw.groupby("season")["WL"].value_counts().unstack()
    out.append(_check("League wins = losses in every season", bool((wl["W"] == wl["L"]).all()),
                      f"{len(wl)} seasons"))

    t = load.team_seasons()
    full = t[(t["season"] >= C.THREE_PA_FIRST_SEASON) & ~t["season"].isin(C.SHORTENED_SEASONS)]
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
    first_3pa = int(ls.loc[ls["fg3a_pg"].notna(), "season"].min())
    out.append(_check("Incomplete early seasons are blanked", bool(first_3pa == C.THREE_PA_FIRST_SEASON
                                                                   and ls["fg3_pct"].max() <= 1),
                      f"3PA stats start {C.season_str(first_3pa)}; max league 3P% {ls['fg3_pct'].max():.3f}"))

    logs_fga = load.team_games().groupby("season")["fga"].sum()
    grid = load.shot_grid().groupby("season")["fga"].sum()
    gap = (grid / logs_fga.reindex(grid.index) - 1).abs()
    out.append(_check("Shot-chart attempts match game-log FGA (within 1%)", bool((gap < 0.01).all()),
                      f"{len(grid)} seasons ({C.season_str(grid.index.min())} to {C.season_str(grid.index.max())}); "
                      f"largest gap {gap.max():.2%} in {C.season_str(gap.idxmax())}"))
    empty = [f.stem for f in load._files("shot_chart", "shots") if f.stat().st_size < 200]
    out.append(_check("Empty shot-chart files skipped", None, f"{len(empty)}: {', '.join(empty) or 'none'}"))

    relabeled = load.shot_grid().groupby("season")["relabeled"].sum()
    worst = relabeled.idxmax()
    out.append(_check("Shot zones relabeled to match the shot type", None,
                      f"{int(relabeled.sum()):,} shots in total; {int(relabeled[worst]):,} in {C.season_str(worst)} "
                      f"(22 ft line), at most {int(relabeled.drop(worst).max()):,} in any other season"))

    p = load.player_seasons()
    player_pts = p.groupby("season")["pts"].sum()
    team_pts = load.team_games().groupby("season")["pts"].sum().reindex(player_pts.index)
    gap = (player_pts / team_pts - 1).abs()
    out.append(_check("Player points add up to team points (within 0.5%)", bool((gap < 0.005).all()),
                      f"largest gap {gap.max():.2%} in {C.season_str(gap.idxmax())}"))

    known = player_seasons()["jersey"].notna()
    out.append(_check("Jersey numbers found on the season rosters", None,
                      f"{known.mean():.1%} of {len(known):,} player-seasons" if known.any()
                      else "no rosters yet: run python collect_data.py rosters"))

    # A name or abbreviation that matches nothing leaves a blank id; one that matches twice adds a row
    for name, table, hand, key, label in (
            ("Every MVP matches one player-season", mvps(), MVPS, "player_id", "player_name"),
            ("Every champion matches one team-season", champions(), CHAMPIONS, "team_id", "team")):
        missing = table[table[key].isna()]
        out.append(_check(name, bool(len(table) == len(hand) and missing.empty),
                          f"{int(table[key].notna().sum())} of {len(hand)} found" +
                          "".join(f"; missing {s} {who}" for s, who in zip(missing["season_label"], missing[label]))))
    return out
