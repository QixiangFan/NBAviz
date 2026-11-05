// Team logos, team colors and player headshots. Headshots and today's logos load at run time from NBA.com's image
// CDN, using the same NBA.com ids as the clean data (team_id, player_id); players without a photo come
// back as a grey silhouette. Older logos are local files from collect_logos.py (web/assets/logos/).
const CDN = "https://cdn.nba.com";
const canonical = (name) => name.replace("Los Angeles ", "LA ");   // "Los Angeles Clippers" became "LA Clippers"

/** size: "1040x760" for the cards, "260x190" for small medallions */
export const headshotUrl = (playerId, size = "1040x760") => `${CDN}/headshots/nba/latest/${size}/${playerId}.png`;

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

// Team colors mark identity only (jerseys, rings, stripes), never data: [jersey body, trim, lettering].
// Read from each team's current NBA.com logo and uniforms (October 2026). Seasons played under an older
// name use that era's colors (approximate); other past seasons use today's.
const TEAM_COLORS = {
  1610612737: ["#E03A3E", "#C1D32F", "#FFFFFF"],   // Hawks
  1610612738: ["#007A33", "#BA9653", "#FFFFFF"],   // Celtics
  1610612739: ["#860038", "#FDBB30", "#FDBB30"],   // Cavaliers
  1610612740: ["#0C2340", "#C8102E", "#FFFFFF"],   // Pelicans
  1610612741: ["#CE1141", "#FFFFFF", "#000000"],   // Bulls
  1610612742: ["#00538C", "#B8C4CA", "#FFFFFF"],   // Mavericks
  1610612743: ["#0E2240", "#FEC524", "#FEC524"],   // Nuggets
  1610612744: ["#1D428A", "#FFC72C", "#FFC72C"],   // Warriors
  1610612745: ["#CE1141", "#C4CED4", "#FFFFFF"],   // Rockets
  1610612746: ["#12173F", "#C8102E", "#FFFFFF"],   // Clippers
  1610612747: ["#552583", "#FDB927", "#FDB927"],   // Lakers
  1610612748: ["#98002E", "#F9A01B", "#FFFFFF"],   // Heat
  1610612749: ["#00471B", "#EEE1C6", "#EEE1C6"],   // Bucks
  1610612750: ["#0C2340", "#78BE20", "#FFFFFF"],   // Timberwolves
  1610612751: ["#000000", "#FFFFFF", "#FFFFFF"],   // Nets
  1610612752: ["#006BB6", "#F58426", "#FFFFFF"],   // Knicks
  1610612753: ["#0050B5", "#C4CED4", "#FFFFFF"],   // Magic
  1610612754: ["#0C2340", "#FFD520", "#FFD520"],   // Pacers
  1610612755: ["#006BB6", "#ED174C", "#FFFFFF"],   // 76ers
  1610612756: ["#1D1160", "#E56020", "#E56020"],   // Suns
  1610612757: ["#000000", "#E03A3E", "#FFFFFF"],   // Trail Blazers
  1610612758: ["#5A2D81", "#63727A", "#FFFFFF"],   // Kings
  1610612759: ["#000000", "#C4CED4", "#FFFFFF"],   // Spurs
  1610612760: ["#007AC1", "#EF3B24", "#FFFFFF"],   // Thunder
  1610612761: ["#CE1141", "#000000", "#FFFFFF"],   // Raptors
  1610612762: ["#4E008E", "#000000", "#FFFFFF"],   // Jazz (purple since 2025)
  1610612763: ["#12173F", "#5D76A9", "#FFFFFF"],   // Grizzlies
  1610612764: ["#002B5C", "#E31837", "#FFFFFF"],   // Wizards
  1610612765: ["#C8102E", "#1D42BA", "#FFFFFF"],   // Pistons
  1610612766: ["#1D1160", "#00788C", "#FFFFFF"],   // Hornets
};
const ERA_COLORS = {
  "Seattle SuperSonics": ["#00653A", "#FFC200", "#FFC200"],
  "New Jersey Nets": ["#002A60", "#CD1041", "#FFFFFF"],
  "Vancouver Grizzlies": ["#00B2A9", "#BC7844", "#000000"],
  "Charlotte Bobcats": ["#F26532", "#29588B", "#FFFFFF"],
  "New Orleans Hornets": ["#00788C", "#1D1160", "#FFFFFF"],
  "New Orleans/Oklahoma City Hornets": ["#00788C", "#1D1160", "#FFFFFF"],
};
const NEUTRAL = ["#2A2F3A", "#A9A59C", "#F2EEE6"];

/** Relative luminance (WCAG) of a #RRGGBB color. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * teamColors(teamSeasonRow): { primary, secondary, ink } of that season's jersey, plus two picks for the dark
 * arena, each the first of the three bright enough for its job: `accent` for thin rings and edges, `tint`
 * for washes over large areas (Warriors blue works as a wash, not as a ring; black and navy fall back to the trim).
 */
export function teamColors(d) {
  const [primary, secondary, ink] = (d && (ERA_COLORS[d.team_name] || TEAM_COLORS[d.team_id])) || NEUTRAL;
  const first = (min) => [primary, secondary, ink].find((c) => luminance(c) >= min) ?? ink;
  return { primary, secondary, ink, accent: first(0.07), tint: first(0.03) };
}
