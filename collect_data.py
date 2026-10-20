"""Step 1: download everything the project needs from stats.nba.com into data/raw/.

    python collect_data.py                 # all groups (~1,040 requests; 30-60 min the first time)
    python collect_data.py gamelogs shots  # only some groups

Shot charts are most of it: one request per team per season, 1996-97 to now.

Downloads are cached per request, so re-running skips anything already saved
and retries only what failed.
"""
import sys
import traceback

from nbaviz import config as C
from nbaviz import fetch

detail_seasons = range(C.DETAIL_FIRST_SEASON, C.LAST_SEASON + 1)

GROUPS = {
    "gamelogs": (fetch.team_game_logs, range(C.GAMELOG_FIRST_SEASON, C.LAST_SEASON + 1)),
    "players": (fetch.player_totals, detail_seasons),
    "bio": (fetch.player_bio, detail_seasons),
    "shots": (fetch.shot_chart, C.SHOT_CHART_SEASONS),
}


def main(selected):
    unknown = set(selected) - GROUPS.keys()
    if unknown:
        sys.exit(f"Unknown group(s): {', '.join(sorted(unknown))}. Choose from: {', '.join(GROUPS)}")

    failures = []
    for name in selected or GROUPS:
        func, seasons = GROUPS[name]
        print(f"[{name}]")
        for season in seasons:
            label = C.season_str(season)
            print(f"  {label}", flush=True)
            try:
                func(season)
            except Exception as exc:
                failures.append(f"{name} {label}: {exc!r}")
                traceback.print_exc(limit=1)

    if failures:
        print(f"\n{len(failures)} request(s) failed. Run the same command again to retry them:")
        print("\n".join(f"  - {f}" for f in failures))
        sys.exit(1)
    print(f"\nDone. Raw CSVs are in {C.RAW_DIR}")


if __name__ == "__main__":
    main(sys.argv[1:])
