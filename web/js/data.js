// Data layer: load the clean CSVs (../data/clean), index them, and turn the 1 ft shot grid
// into shot particles. Label columns like "1985-86" are never read: d3.autoType parses them as dates.
import { logoLookup } from "./media.js";

const DATA = "../data/clean/";
const LOGOS = "assets/logos/logos.csv";
const CUTOUTS = "assets/players/cutouts.csv";
const TABLES = {
  league: "league_seasons", events: "events", teams: "team_seasons", corr: "win_correlations",
  quads: "quadrants", zones: "zone_seasons", grid: "shot_grid", players: "player_seasons",
};
const TEXT = { players: ["jersey"] };   // columns d3.autoType must not touch: jersey "00" would become 0

/** d3.autoType, except that the named columns stay text (blank → null). */
const typed = (text = []) => (row) => {
  const kept = text.map((k) => row[k]);
  d3.autoType(row);
  text.forEach((k, i) => { row[k] = kept[i] || null; });
  return row;
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
  const cutouts = d3.csv(CUTOUTS, d3.autoType).catch(() => []);  // optional, see make_cutouts.swift
  const loaded = await Promise.all(entries.map(([key, file]) =>
    d3.csv(`${DATA}${file}.csv`, typed(TEXT[key])).then((rows) => {
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
  data.cutouts = new Map((await cutouts).map((d) => [d.slug, d]));   // player photos for the hero and Q1
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

// Angle around the hoop: 0 straight behind it, then counterclockwise, so the seam is where nobody shoots
const angleOf = (x, y) => {
  const a = Math.atan2(y, x) + Math.PI / 2;
  return a < 0 ? a + 2 * Math.PI : a;
};

/**
 * n shot particles that can be drawn from any season's grid, weighted by attempts. Each particle keeps
 * its own random numbers across seasons: one picks a direction from the hoop (by that season's angle
 * mix), one a distance along it, the rest its spot inside the 1 ft cell and whether it went in (the
 * cell's FG%). When the shot mix changes, a particle slides out along its ray instead of jumping, so a
 * season-to-season morph shows only the real change. Coordinates are feet from the hoop. Shots at the
 * rim pile into a few cells, so they get an extra Gaussian spread (σ = 0.9 ft) to read as a cloud.
 */
export function shotSampler(n, seed = 7, sectors = 72) {
  const random = rng(seed);
  const u = Float64Array.from({ length: n * 7 }, random);
  return (cells) => {
    const groups = d3.range(sectors).map(() => []);
    for (const c of cells) {
      groups[Math.min(sectors - 1, Math.floor((angleOf(c.x + 0.5, c.y + 0.5) / (2 * Math.PI)) * sectors))].push(c);
    }
    groups.forEach((g) => g.sort((a, c) => Math.hypot(a.x + 0.5, a.y + 0.5) - Math.hypot(c.x + 0.5, c.y + 0.5)));
    const cum = groups.map((g) => d3.cumsum(g, (c) => c.fga));
    const sectorCum = d3.cumsum(cum, (c) => (c.length ? c[c.length - 1] : 0));
    const total = sectorCum[sectors - 1];
    const out = { n, x: new Float32Array(n), y: new Float32Array(n), zone: new Uint8Array(n), made: new Uint8Array(n) };
    for (let i = 0; i < n; i++) {
      const r = u.subarray(i * 7, i * 7 + 7);
      const s = d3.bisectRight(sectorCum, r[0] * total);   // empty sectors have zero width and are never hit
      const g = groups[s];
      const c = g[Math.min(d3.bisectRight(cum[s], r[1] * cum[s][g.length - 1]), g.length - 1)];
      let dx = 0;
      let dy = 0;
      if (c.zone === "RA") {   // Box-Muller
        const rad = 0.9 * Math.sqrt(-2 * Math.log(1 - r[4]));
        const a = 2 * Math.PI * r[5];
        dx = rad * Math.cos(a);
        dy = rad * Math.sin(a);
      }
      out.x[i] = c.x + r[2] + dx;
      out.y[i] = Math.max(-5.1, c.y + r[3] + dy);
      out.zone[i] = ZONE_INDEX[c.zone];
      out.made[i] = r[6] < c.fgm / c.fga ? 1 : 0;
    }
    return out;
  };
}
