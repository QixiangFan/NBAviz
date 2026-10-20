// Team logos and player headshots. Headshots and today's logos load at run time from NBA.com's image
// CDN, using the same NBA.com ids as the clean data (team_id, player_id); players without a photo come
// back as a grey silhouette. Older logos are local files from collect_logos.py (web/assets/logos/).
const CDN = "https://cdn.nba.com";
const canonical = (name) => name.replace("Los Angeles ", "LA ");   // "Los Angeles Clippers" became "LA Clippers"

export const headshotUrl = (playerId) => `${CDN}/headshots/nba/latest/1040x760/${playerId}.png`;

/**
 * logoOf(teamSeasonRow): the logo the team used that season. Past eras come from logos.csv (`eras`).
 * The current era, and every season when that file is missing, uses NBA.com's current logo, which
 * only fits seasons played under today's name; other seasons get null (the abbreviation is shown).
 */
export function logoLookup(teams, eras = []) {
  const last = d3.max(teams, (d) => d.season);
  const current = new Map(teams.filter((d) => d.season === last).map((d) => [d.team_id, canonical(d.team_name)]));
  // Latest-starting era first, so a later logo wins where two overlap (e.g. New Orleans/Oklahoma City)
  const byTeam = d3.group(eras.slice().sort((a, c) => c.first_season - a.first_season), (e) => e.team_id);
  return (d) => {
    if (!d) return null;
    const era = byTeam.get(d.team_id)?.find((e) => e.first_season <= d.season && d.season <= e.last_season);
    if (era && !era.current) return `assets/logos/${era.file}`;
    return current.get(d.team_id) === canonical(d.team_name) ? `${CDN}/logos/nba/${d.team_id}/global/L/logo.svg` : null;
  };
}
