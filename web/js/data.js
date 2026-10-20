// Data layer: load the clean CSVs (../data/clean), index them, and turn the 1 ft shot grid
// into shot particles. Label columns like "1985-86" are never read: d3.autoType parses them as dates.
import { logoLookup } from "./media.js";

const DATA = "../data/clean/";
const LOGOS = "assets/logos/logos.csv";
const TABLES = {
  league: "league_seasons", events: "events", teams: "team_seasons", corr: "win_correlations",
  quads: "quadrants", zones: "zone_seasons", grid: "shot_grid", players: "player_seasons",
};

export const ZONES = ["RA", "PAINT", "MID", "C3", "AB3"];   // rim outwards; index >= 3 is a three
export const ZONE_NAMES = { RA: "At the rim", PAINT: "Paint", MID: "Mid-range", C3: "Corner 3", AB3: "Above-the-break 3" };
export const ZONE_SOURCE = {   // zone_seasons.csv uses NBA.com names
  RA: "Restricted Area", PAINT: "In The Paint (Non-RA)", MID: "Mid-Range", C3: "Corner 3", AB3: "Above the Break 3",
};
const ZONE_INDEX = Object.fromEntries(ZONES.map((z, i) => [z, i]));

export const season = (y) => `${y}-${String(y + 1).slice(-2)}`;
export const STANDARD_LINE = 1997;   // first season after the 22 ft arc of 1994-95 to 1996-97

export async function loadAll(onProgress = () => {}) {
  const entries = Object.entries(TABLES);
  let done = 0;
  const logoEras = d3.csv(LOGOS, d3.autoType).catch(() => []);   // optional, see collect_logos.py
  const loaded = await Promise.all(entries.map(([key, file]) =>
    d3.csv(`${DATA}${file}.csv`, d3.autoType).then((rows) => {
      onProgress(++done / entries.length);
      return [key, rows];
    })));
  const data = Object.fromEntries(loaded);
  data.grid = data.grid.filter((c) => c.zone in ZONE_INDEX);
  data.gridBySeason = d3.group(data.grid, (c) => c.season);
  data.gridSeasons = [...data.gridBySeason.keys()].sort(d3.ascending);
  data.totalShots = d3.sum(data.grid, (c) => c.fga);
  data.zoneShare = (s, zone) => data.zones.find((d) => d.season === s && d.zone === ZONE_SOURCE[zone]);
  data.lastSeason = d3.max(data.league, (d) => d.season);
  data.teamBySeason = d3.index(data.teams, (d) => d.season, (d) => d.team);   // players only carry the abbreviation
  data.logo = logoLookup(data.teams, await logoEras);
  return data;
}

/** Seeded random numbers (mulberry32) so every visit draws the same particles. */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Draw n shots from one season's grid, weighted by attempts. Each shot gets a random spot inside
 * its 1 ft cell and goes in with that cell's FG%. Coordinates are feet from the hoop. Shots at the
 * rim pile into a few cells, so they get an extra Gaussian spread (σ = 0.9 ft) to read as a cloud.
 */
export function sampleShots(cells, n, seed = 7) {
  const random = rng(seed);
  const cum = new Float64Array(cells.length);
  let total = 0;
  cells.forEach((c, i) => { total += c.fga; cum[i] = total; });
  const out = { n, x: new Float32Array(n), y: new Float32Array(n), zone: new Uint8Array(n), made: new Uint8Array(n) };
  for (let i = 0; i < n; i++) {
    const c = cells[Math.min(d3.bisectRight(cum, random() * total), cells.length - 1)];
    let dx = 0;
    let dy = 0;
    if (c.zone === "RA") {   // Box-Muller
      const r = 0.9 * Math.sqrt(-2 * Math.log(1 - random()));
      const a = 2 * Math.PI * random();
      dx = r * Math.cos(a);
      dy = r * Math.sin(a);
    }
    out.x[i] = c.x + random() + dx;
    out.y[i] = Math.max(-5.1, c.y + random() + dy);
    out.zone[i] = ZONE_INDEX[c.zone];
    out.made[i] = random() < c.fgm / c.fga ? 1 : 0;
  }
  return out;
}

/**
 * Order points so a morph moves each dot outward along the floor instead of across it:
 * equal-count distance bands from the hoop, then by angle inside each band.
 * Returns ranks: order[k] is the index of the point with rank k.
 */
export function migrationOrder(xs, ys, n, bands = 28) {
  const dist = Float32Array.from({ length: n }, (_, i) => Math.hypot(xs[i], ys[i]));
  const angle = Float32Array.from({ length: n }, (_, i) => Math.atan2(ys[i], xs[i]));
  const idx = d3.range(n).sort((a, b) => dist[a] - dist[b]);
  const per = Math.ceil(n / bands);
  const order = [];
  for (let b = 0; b < n; b += per) {
    order.push(...idx.slice(b, b + per).sort((a, c) => angle[a] - angle[c]));
  }
  return order;
}
