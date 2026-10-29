// HALFTIME (sketch KN1): era fingerprints. The league's average team in each of four eras as a small radar
// (radar.js) on six stats. Each spoke runs from the lowest season since 1985-86 (center) to the highest
// (rim), and the era before is drawn as a dashed outline, so each glyph shows what changed. The glyphs
// sweep in one after another when they scroll into view.
import { season as fmtSeason } from "../data.js";
import { instant } from "../motion.js";
import { radarDuel } from "./radar.js";
import { h, b } from "./steps.js";

const pct = d3.format(".1%");
const num = d3.format(".1f");
// Shooting first, then what a team does with its possessions, then how many it has
const AXES = [
  { key: "fg3a_rate", label: "Threes", long: "Share of shots that were threes", fmt: pct },
  { key: "fg3_pct", label: "3P%", long: "3-point percentage", fmt: pct },
  { key: "ortg", label: "Offense", long: "Points per 100 possessions", fmt: num },
  { key: "orb_pct", label: "Off. boards", long: "Share of its own misses a team rebounds", fmt: pct },
  { key: "tov_pct", label: "Turnovers", long: "Turnovers per play", fmt: pct },
  { key: "pace", label: "Pace", long: "Possessions per 48 minutes", fmt: num },
];
// One hue, the three-point orange, getting brighter era by era (validated as an ordinal ramp on the dark surface)
const RAMP = ["#872f06", "#a83d0e", "#c1552b", "#ec5e22"];

export function initEras(data) {
  const rows = data.league.filter((d) => d.fg3a_rate != null);   // 3PA-based stats start in 1985-86
  const first = rows[0].season;
  const last = rows[rows.length - 1].season;
  // The 3rd quarter's eras (nbaviz/export.py, ERAS); each stat is the mean of the era's seasons
  const eras = [[first, 1999], [2000, 2011], [2012, 2019], [2020, last]].map(([a, z], i) => {
    const seasons = rows.filter((d) => d.season >= a && d.season <= z);
    return { label: `${a}–${z + 1}`, color: RAMP[i], mean: Object.fromEntries(AXES.map((x) => [x.key, d3.mean(seasons, (d) => d[x.key])])) };
  });
  const range = AXES.map((x) => [d3.least(rows, (d) => d[x.key]), d3.greatest(rows, (d) => d[x.key])]);
  const spokes = (era) => AXES.map((x, j) => {
    const [lo, hi] = range[j];
    return (era.mean[x.key] - lo[x.key]) / (hi[x.key] - lo[x.key]);
  });

  const box = document.getElementById("half-glyphs");
  const glyphs = eras.map((era, i) => {
    const prev = eras[i - 1];
    const fig = h("figure", { class: "duel era-glyph", role: "img",
      "aria-label": `League average, ${era.label}: ${AXES.map((x) => `${x.label} ${x.fmt(era.mean[x.key])}`).join(", ")}` });
    // One line over the glyph: the era and its share of threes. Digits stay in ink; the era's color marks
    // its name and its shape.
    const card = h("div", { class: "era" },
      h("div", { class: "era-head" }, h("h4", null, era.label),
        h("p", null, h("span", { class: "led" }, pct(era.mean.fg3a_rate)), h("small", null, "3PT share"))),
      fig);
    card.style.setProperty("--era", era.color);
    box.append(card);
    const radar = radarDuel(fig, {
      axes: AXES,
      colors: prev ? [prev.color, era.color] : [era.color],
      ghost: prev ? [0] : [],
      max: 300, median: null, rim: null, labelGap: 14,
      // Room for the axis names (--radar-pad, set with their size in chapters.css). On a short screen the glyph is
      // narrower than its column, and the names can use the space beside it.
      pad: (size) => Math.max(34, (parseFloat(getComputedStyle(fig).getPropertyValue("--radar-pad")) || 52) - (card.clientWidth - size) / 2),
      describe: (j) => {
        const x = AXES[j];
        const [lo, hi] = range[j];
        return {
          title: `${x.long} · ${era.label}`,
          rows: [era, prev].filter(Boolean).map((e) => ({ value: x.fmt(e.mean[x.key]), label: e === era ? "this era" : `${e.label} (dashed)`, color: e.color })),
          note: `Center: ${x.fmt(lo[x.key])} in ${fmtSeason(lo.season)}. Rim: ${x.fmt(hi[x.key])} in ${fmtSeason(hi.season)}.`,
        };
      },
    });
    radar.set(prev ? [spokes(prev), spokes(era)] : [spokes(era)]);
    return radar;
  });

  // The first half in three numbers, and the question it leaves for the second
  const [a, z] = [eras[0], eras[eras.length - 1]];
  document.getElementById("half-note").append(
    "From ", a.label, " to ", z.label, ", threes went from ", b(pct(a.mean.fg3a_rate)), " of shots to ", b(pct(z.mean.fg3a_rate)),
    " and offensive rebounds from ", b(pct(a.mean.orb_pct)), " of misses to ", b(pct(z.mean.orb_pct)), ". League 3P% only moved from ",
    b(pct(a.mean.fg3_pct)), " to ", b(pct(z.mean.fg3_pct)), ": everyone takes more threes, and they barely go in more often.");

  if (!instant) ScrollTrigger.create({ trigger: box, start: "top 78%", once: true, onEnter: () => glyphs.forEach((g, i) => gsap.delayedCall(i * 0.3, g.intro)) });
}
