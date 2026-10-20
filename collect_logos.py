"""Step 1b (optional): download each franchise's primary logo, era by era, from SportsLogos.net.

    python collect_logos.py

Needs data/clean/team_seasons.csv (run build_clean_data.py first) to know which teams and seasons
the site shows. Saves only the logos in use from 1985-86 on into web/assets/logos/, plus
web/assets/logos/logos.csv saying which logo covers which seasons. That is about 40 pages and
100 small images, fetched 1.5 s apart. Pages and images already saved are skipped, so a failed
run can simply be repeated.

Without this step the site falls back to today's logos from NBA.com (and abbreviations for teams
that have since moved or been renamed). Logos are trademarks of the NBA and its teams; they are
used here for a course project only.
"""
import csv
import html
import re
import sys
import time
import urllib.error
import urllib.request

from nbaviz import config as C

SITE = "https://www.sportslogos.net"
LEAGUE_PAGE = f"{SITE}/teams/list_by_league/6/National-Basketball-Association-Logos/NBA-Logos/"
PAGE_DIR = C.RAW_DIR / "logos"                  # cached HTML pages
OUT_DIR = C.ROOT / "web" / "assets" / "logos"   # images + logos.csv, served with the site
USER_AGENT = "CS6730-nba-story-logos/1.0 (Georgia Tech course project; one-off download)"
PAUSE = 1.5                                     # seconds between requests

# SportsLogos name -> NBA.com name, where they differ by more than case or "Los Angeles"/"LA"
ALIASES = {"no/oklahoma city hornets": "new orleans/oklahoma city hornets"}

# League page: <a href="/logos/list_by_team/241/Seattle-Supersonics-Logos/">Seattle Supersonics 1967/68 - 2007/08</a>
TEAM_LINK = re.compile(r'<a href="(/logos/list_by_team/\d+/[^"]+)"[^>]*>(.*?)</a>', re.S)
TEAM_TEXT = re.compile(r"^(.*?)\s+(\d{4})/\d{2}(?:\s*[-–]\s*(?:(\d{4})/\d{2}|Pres\w*))?$")
# Team page: one card per primary logo; the title gives the seasons by their *ending* year,
# e.g. "(1996 - 2001)" = 1995-96 to 2000-01, "(2015 - Pres)" = 2014-15 to today
PRIMARY = re.compile(r'<a href="/logos/view/[^"]+/Primary-Logo"\s+title="[^"]*\((\d{4})\s*[-–]\s*(\d{4}|[A-Za-z]+)\)"'
                     r'.*?<img src="([^"]+)"', re.S)


def norm(name: str) -> str:
    name = html.unescape(name).strip().lower().replace("los angeles ", "la ")
    return ALIASES.get(name, name)


def get(url: str, path=None) -> bytes:
    """GET with a few retries. With a path, the response is cached there and reused next time."""
    if path is not None and path.exists():
        return path.read_bytes()
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                body = response.read()
            break
        except urllib.error.HTTPError as exc:
            if exc.code in (403, 404) or attempt == 3:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == 3:
                raise
        print(f"    retry {attempt}: {url}")
        time.sleep(5 * attempt)
    time.sleep(PAUSE)
    if path is not None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body)
    return body


def franchises() -> tuple[dict, dict, dict]:
    """From the clean data: NBA name -> franchise id, franchise id -> seasons played, and
    (franchise id, season) -> that season's abbreviation."""
    ids, seasons, abbr = {}, {}, {}
    with open(C.CLEAN_DIR / "team_seasons.csv", newline="") as f:
        for row in csv.DictReader(f):
            team_id, season = int(row["team_id"]), int(row["season"])
            ids[norm(row["team_name"])] = team_id
            seasons.setdefault(team_id, set()).add(season)
            abbr[team_id, season] = row["team"]
    return ids, seasons, abbr


def team_pages(first: int) -> list[dict]:
    """Every team on the NBA list whose years reach the data's first season."""
    page = get(LEAGUE_PAGE, PAGE_DIR / "league.html").decode("utf-8", "replace")
    teams = {}
    for href, inner in TEAM_LINK.findall(page):
        text = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", inner)).strip()
        m = TEAM_TEXT.match(text)
        if not m:
            continue   # duplicate links without years, league/event logos
        last = int(m.group(3)) if m.group(3) else (C.LAST_SEASON if "Pres" in text else int(m.group(2)))
        if last >= first:
            teams[href] = {"href": href, "name": html.unescape(m.group(1)), "first": int(m.group(2)), "last": last}
    if not teams:
        sys.exit(f"Found no teams on {LEAGUE_PAGE}. The page layout may have changed, or the request was blocked:\n"
                 f"open {PAGE_DIR / 'league.html'} to check, delete it, and run again.")
    return list(teams.values())


def primary_logos(team: dict) -> list[dict]:
    slug = team["href"].rstrip("/").split("/")[-1]
    page = get(SITE + team["href"], PAGE_DIR / f"{slug}.html").decode("utf-8", "replace")
    logos = {}
    for start, end, src in PRIMARY.findall(page):
        first = int(start) - 1
        last = int(end) - 1 if end.isdigit() else C.LAST_SEASON
        logos.setdefault(src, {"first": first, "last": last, "src": src})
    if not logos:
        print(f"    no primary logos found in {PAGE_DIR / slug}.html (layout changed or request blocked?);"
              " delete that file and run again")
    return list(logos.values())


def main():
    ids, played, abbr = franchises()
    first_season = min(min(s) for s in played.values())
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    rows = []
    for team in team_pages(first_season):
        team_id = ids.get(norm(team["name"]))
        if team_id is None:
            continue   # a franchise that left the league before the data starts
        print(f"{team['name']} ({team['first']}-{team['last']})", flush=True)
        for logo in primary_logos(team):
            # Keep the part of each logo's run that this team name actually played in the data
            first = max(logo["first"], team["first"], first_season)
            last = min(logo["last"], team["last"], C.LAST_SEASON)
            if not any(first <= s <= last for s in played[team_id]):
                continue
            ext = logo["src"].rsplit(".", 1)[-1].lower()
            twins = sum(r["team_id"] == team_id and r["first_season"] == first for r in rows)
            file = f"{team_id}_{first}-{last}{'abcdefgh'[twins - 1] if twins else ''}.{ext}"
            body = get(logo["src"], OUT_DIR / file)
            if not body.startswith((b"GIF8", b"\x89PNG", b"\xff\xd8", b"<svg", b"<?xml")):
                (OUT_DIR / file).unlink()
                sys.exit(f"{logo['src']} did not return an image (blocked?). Nothing else was changed.")
            rows.append({"team_id": team_id, "team_name": team["name"], "first_season": first, "last_season": last,
                         "current": int(last == C.LAST_SEASON and logo["last"] == C.LAST_SEASON),
                         "file": file, "source": logo["src"]})
            print(f"  {C.season_str(first)} to {C.season_str(last)}  {file}")

    rows.sort(key=lambda r: (r["team_id"], r["first_season"]))
    with open(OUT_DIR / "logos.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    # Coverage: every team-season in the data should have a logo
    missing = [(tid, s) for tid, seasons in played.items() for s in sorted(seasons)
               if not any(r["team_id"] == tid and r["first_season"] <= s <= r["last_season"] for r in rows)]
    total = sum(len(s) for s in played.values())
    print(f"\n{len(rows)} logos for {total - len(missing):,} of {total:,} team-seasons -> {OUT_DIR}")
    if missing:
        print("No logo for: " + ", ".join(f"{abbr[tid, s]} {C.season_str(s)}" for tid, s in missing))


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as exc:
        sys.exit(f"\nHTTP {exc.code} for {exc.url}. Files saved so far are kept; run again later to continue.")
