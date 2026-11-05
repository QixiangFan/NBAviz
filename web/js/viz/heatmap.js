// 2nd quarter, second page: the same shots as a hex heat map (ported from TheVizGoat's "Where on the court"
// slide). Every attempt of a season is binned into 3 ft hexagons, and two seasons sit side by side on one
// color scale. Color is the share of attempts, or points per shot with the size showing how often teams
// shot from the spot. A dumbbell chart under the courts reads the same two seasons zone by zone. The last
// step hands the reader both seasons and the color switch. DRAFT.
import { ZONES, ZONE_NAMES, season as fmtSeason, STANDARD_LINE } from "../data.js";
import { fitCourt, drawCourt, COURT } from "./court.js";
import { setupSteps, h, b } from "./steps.js";
import { segmented } from "../ui/controls.js";
import { showTip, moveTip, hideTip } from "../ui/tooltip.js";
import { dur } from "../motion.js";

const R = 1.5;                            // hexagon radius in feet (2.6 ft across)
const SUB = 4;                            // each 1 ft grid cell is split SUB × SUB so the hexagons don't alias it
const MIN_ATTEMPTS = 40;                  // points per shot is noise below this
const PPS_DOMAIN = [0.6, 1.4];            // cold to hot, 1.0 point per shot in the middle
const HEAD = 54;                          // season title above each court
const GAP = 28;
const DUMB_ROW = 26;
const DUMB_H = 34 + ZONES.length * DUMB_ROW + 30;
const THREE_ZONES = new Set(["C3", "AB3"]);
const pct = d3.format(".1%");
const int = d3.format(",");

// Heat runs from the stage's dark to gold; points per shot diverges from indigo (cold) through dark to gold (hot).
// Gold, not the orange of threes: a hot spot is not necessarily a three.
const SEQ = d3.interpolateRgbBasis(["#171b24", "#5c3a12", "#c7821c", "#f5b83d", "#fff1c9"]);
const DIV = d3.interpolateRgbBasis(["#5d6bd8", "#2c3350", "#262a35", "#6b5326", "#f5b83d"]);

// --- Binning ---------------------------------------------------------------------------------------
const SQRT3 = Math.sqrt(3);
const hexCenter = (q, r) => [R * SQRT3 * (q + r / 2), R * 1.5 * r];

/** Axial (q, r) of the pointy-top hexagon that contains the point (feet). */
function hexOf(x, y) {
  const q = ((SQRT3 / 3) * x - y / 3) / R;
  const r = ((2 / 3) * y) / R;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(-q - r);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs + q + r);
  if (dq > dr && dq > ds) rq = -rs - rr;
  else if (dr >= ds) rr = -rq - rs;   // otherwise s is the largest error, and q and r are already right
  return [rq, rr];
}

/** One season's grid cells as hexagons: attempts, makes and points, plus the season's total attempts. */
function binSeason(cells) {
  const bins = new Map();
  let total = 0;
  const w = 1 / (SUB * SUB);
  for (const c of cells) {
    total += c.fga;
    const value = THREE_ZONES.has(c.zone) ? 3 : 2;
    for (let i = 0; i < SUB; i++) {
      for (let j = 0; j < SUB; j++) {
        const x = c.x + (i + 0.5) / SUB;
        const y = c.y + (j + 0.5) / SUB;
        if (x < COURT.left || x > COURT.right || y < COURT.baseline || y > COURT.halfcourt) continue;   // backcourt heaves
        const [q, r] = hexOf(x, y);
        const key = q * 1000 + r;
        let bin = bins.get(key);
        if (!bin) {
          const [cx, cy] = hexCenter(q, r);
          bins.set(key, bin = { key, cx, cy, fga: 0, fgm: 0, pts: 0 });
        }
        bin.fga += c.fga * w;
        bin.fgm += c.fgm * w;
        bin.pts += c.fgm * value * w;
      }
    }
  }
  const hexes = [...bins.values()];
  hexes.forEach((d) => { d.share = d.fga / total; d.pps = d.pts / d.fga; });
  return { total, hexes };
}

/** Pointy-top hexagon path of radius r pixels, centered on (0, 0). */
function hexPath(r) {
  const pts = d3.range(6).map((k) => {
    const a = (k * Math.PI) / 3;
    return [Math.sin(a) * r, -Math.cos(a) * r];
  });
  return `M${pts.map((p) => p.map((v) => v.toFixed(2)).join(",")).join("L")}Z`;
}

export function initHeatmap(data) {
  const seasons = data.gridSeasons;
  const first = seasons.find((s) => s >= STANDARD_LINE) ?? seasons[0];
  const last = seasons[seasons.length - 1];
  const area = document.getElementById("q2b-viz");
  const cache = new Map();
  const binned = (s) => {
    if (!cache.has(s)) cache.set(s, binSeason(data.gridBySeason.get(s)));
    return cache.get(s);
  };
  const zone = (s, z) => data.zoneShare(s, z);
  const threeShare = (s) => zone(s, "C3").share + zone(s, "AB3").share;

  const STORY = [
    { a: first, b: last, mode: "freq", showB: false },
    { a: first, b: last, mode: "freq", showB: true },
    { a: first, b: last, mode: "pps", showB: true },
  ];
  const explore = { a: first, b: last, mode: "pps" };
  const st = { ...STORY[0] };

  // --- DOM ------------------------------------------------------------------------------------------
  const root = d3.select(area);
  const courts = [0, 1].map((k) => {
    const el = root.append("div").attr("class", "hm-court");
    const head = el.append("div").attr("class", "hm-head");
    const title = head.append("span").attr("class", "hm-season");
    const sub = head.append("span").attr("class", "hm-sub");
    const hexSvg = el.append("svg").attr("class", "hm-hex");
    const clip = hexSvg.append("clipPath").attr("id", `q2b-clip-${k}`).append("rect");
    const hexG = hexSvg.append("g").attr("clip-path", `url(#q2b-clip-${k})`);
    const lines = el.append("svg").attr("class", "court-lines");
    return { el, head, title, sub, hexSvg, clip, hexG, lines, s: null, short: null };
  });
  const dumbSvg = root.append("svg").attr("class", "hm-dumb");
  const dumbTitle = dumbSvg.append("text").attr("class", "dumb-title");
  const dumbAxis = dumbSvg.append("g").attr("class", "axis");
  const dumbG = dumbSvg.append("g");
  const dumbKey = dumbSvg.append("g");
  const dumbX = d3.scaleLinear();
  let showDumb = true;

  const legend = d3.select("#q2b-legend");
  const legendBar = legend.append("div").attr("class", "hm-bar");
  const legendTicks = legend.append("div").attr("class", "hm-ticks");
  const legendNote = legend.append("div").attr("class", "hm-note");

  // --- Layout ---------------------------------------------------------------------------------------
  function fit() {
    const W = area.clientWidth;
    const H = area.clientHeight;
    if (!W || !H) return;
    showDumb = W >= 640 && H >= 600;
    const dumbH = showDumb ? DUMB_H : 0;
    const avail = H - dumbH - (showDumb ? 16 : 0);
    // Two courts side by side, or stacked on a narrow screen: whichever gives the bigger court
    const side = Math.min((W - GAP) / 2 / 50, (avail - HEAD) / 47);
    const stack = Math.min(W / 50, (avail - GAP - 2 * HEAD) / 2 / 47);
    const boxes = side >= stack
      ? [0, 1].map((k) => ({ x: k * ((W - GAP) / 2 + GAP), y: 0, w: (W - GAP) / 2, h: avail }))
      : [0, 1].map((k) => ({ x: 0, y: k * ((avail - GAP) / 2 + GAP), w: W, h: (avail - GAP) / 2 }));
    courts.forEach((c, k) => {
      const box = boxes[k];
      c.s = fitCourt(box.w, box.h - HEAD);
      c.el.style("left", `${box.x}px`).style("top", `${box.y}px`).style("width", `${box.w}px`).style("height", `${box.h}px`);
      c.head.style("left", `${c.s.ox}px`).style("width", `${c.s.width}px`).style("top", `${HEAD + c.s.oy}px`);
      c.hexSvg.attr("width", c.s.w).attr("height", c.s.h).style("top", `${HEAD}px`);
      c.clip.attr("x", c.s.ox).attr("y", c.s.oy).attr("width", c.s.width).attr("height", c.s.height);
      c.lines.style("top", `${HEAD}px`);
      c.short = null;   // redraw the lines
    });
    dumbSvg.style("display", showDumb ? null : "none").attr("width", W).attr("height", dumbH)
      .style("top", `${H - dumbH}px`);
    dumbX.range([170, W - 190]);
  }

  // --- Draw -----------------------------------------------------------------------------------------
  function render({ animate = true } = {}) {
    if (!courts[0].s) return;
    const time = animate ? dur(0.5) * 1000 : 0;
    const freq = st.mode === "freq";
    const pair = [st.a, st.b].map(binned);

    const shares = pair.flatMap((p) => p.hexes.map((d) => d.share)).sort(d3.ascending);
    const seq = d3.scaleSequentialSqrt(SEQ).domain([0, d3.quantile(shares, 0.985) || 1]).clamp(true);
    const div = d3.scaleSequential(DIV).domain(PPS_DOMAIN).clamp(true);
    // Size saturates at the 80th-percentile spot so the few very busy hexagons at the rim don't shrink the rest
    const sizeShares = pair.flatMap((p) => p.hexes.filter((d) => d.fga >= MIN_ATTEMPTS).map((d) => d.share)).sort(d3.ascending);
    const size = d3.scaleSqrt().domain([0, d3.quantile(sizeShares, 0.8) || 1]).range([0.3, 1]).clamp(true);

    courts.forEach((c, k) => {
      const s = k === 0 ? st.a : st.b;
      const visible = k === 0 || st.showB;
      const { total, hexes } = pair[k];
      const short = s < STANDARD_LINE;
      if (c.short !== short) {
        c.short = short;
        drawCourt(c.lines.node(), c.s, { shortLine: short });
      }
      c.el.transition().duration(time).style("opacity", visible ? 1 : 0.14);
      c.title.text(fmtSeason(s));
      c.sub.text(`${int(total)} shots`);
      const shown = hexes.filter((d) => (freq ? d.fga > 0 : d.fga >= MIN_ATTEMPTS));
      c.hexG.selectAll("path").data(shown, (d) => d.key).join(
        (enter) => enter.append("path").attr("fill-opacity", 0),
      )
        .attr("transform", (d) => `translate(${c.s.x(d.cx)},${c.s.y(d.cy)})`)
        .on("pointerenter", (event, d) => showTip(event, {
          title: `${fmtSeason(s)} · all teams`,
          rows: [
            { value: int(Math.round(d.fga)), label: "attempts" },
            { value: pct(d.share), label: "of all shots" },
            { value: pct(d.fgm / d.fga), label: "field-goal %" },
            { value: d.pps.toFixed(2), label: "points per shot" },
          ],
        }))
        .on("pointermove", moveTip)
        .on("pointerleave", hideTip)
        .transition().duration(time)
        .attr("fill-opacity", 1)
        .attr("d", (d) => hexPath(R * c.s.k * (freq ? 1.03 : size(d.share))))
        .attr("fill", (d) => (freq ? seq(d.share) : div(d.pps)));
    });

    renderLegend(freq, seq, div);
    renderDumbbell(freq, time);
  }

  function renderLegend(freq, seq, div) {
    const ramp = freq
      ? (t) => seq(seq.domain()[1] * t * t)               // the sqrt scale, so the bar matches the hexagons
      : (t) => div(PPS_DOMAIN[0] + t * (PPS_DOMAIN[1] - PPS_DOMAIN[0]));
    legendBar.style("background", `linear-gradient(90deg, ${d3.range(0, 1.01, 0.1).map(ramp).join(",")})`);
    const ticks = freq
      ? [["fewer attempts", "left"], ["more attempts", "right"]]
      : [[`${PPS_DOMAIN[0].toFixed(1)} pts`, "left"], ["1.0 point per shot", "center"], [`${PPS_DOMAIN[1].toFixed(1)}+ pts`, "right"]];
    legendTicks.selectAll("span").data(ticks).join("span").attr("class", (d) => d[1]).text((d) => d[0]);
    legendNote.text(freq
      ? "Each hexagon is 2.6 ft across."
      : `Size = how often teams shot from the spot. Hexagons under ${MIN_ATTEMPTS} attempts are hidden.`);
  }

  function renderDumbbell(freq, time) {
    if (!showDumb) return;
    const W = area.clientWidth;
    const top = 34;
    const val = (s, z) => (freq ? zone(s, z).share : zone(s, z).pps);
    const rows = ZONES.map((z, i) => ({ z, i, name: ZONE_NAMES[z], a: val(st.a, z), b: st.showB ? val(st.b, z) : null }));
    const f = freq ? pct : (v) => v.toFixed(2);
    dumbX.domain(freq ? [0, 0.45] : PPS_DOMAIN);
    dumbTitle.attr("x", 0).attr("y", 12).text(freq ? "Share of attempts by zone" : "Points per shot by zone");
    dumbAxis.attr("transform", `translate(0,${top + ZONES.length * DUMB_ROW + 2})`).transition().duration(time)
      .call(d3.axisBottom(dumbX).ticks(5).tickFormat(freq ? d3.format(".0%") : d3.format(".1f")).tickSizeOuter(0));

    const row = dumbG.selectAll("g.row").data(rows, (r) => r.z).join((enter) => {
      const g = enter.append("g").attr("class", "row");
      g.append("text").attr("class", "dumb-label");
      g.append("line").attr("class", "track");
      g.append("line").attr("class", "conn");
      g.append("circle").attr("class", "da").attr("r", 6);
      g.append("circle").attr("class", "db").attr("r", 6);
      g.append("text").attr("class", "dumb-value");
      return g;
    });
    row.attr("transform", (r) => `translate(0,${top + r.i * DUMB_ROW + DUMB_ROW / 2})`);
    row.select(".dumb-label").attr("x", 0).attr("dy", "0.32em").text((r) => r.name);
    row.select(".track").attr("x1", dumbX.range()[0]).attr("x2", dumbX.range()[1]);
    const t = row.transition().duration(time);
    t.select(".da").attr("cx", (r) => dumbX(r.a));
    t.select(".db").attr("cx", (r) => dumbX(r.b ?? r.a)).style("opacity", (r) => (r.b == null ? 0 : 1));
    t.select(".conn").attr("x1", (r) => dumbX(r.a)).attr("x2", (r) => dumbX(r.b ?? r.a)).style("opacity", (r) => (r.b == null ? 0 : 1));
    row.select(".dumb-value").attr("x", dumbX.range()[1] + 16).attr("dy", "0.32em")
      .text((r) => (r.b == null ? f(r.a) : `${f(r.a)} → ${f(r.b)}`));

    dumbKey.attr("transform", `translate(${W - 190 + 16},${12})`).selectAll("*").remove();
    [[st.a, "da"], ...(st.showB ? [[st.b, "db"]] : [])].forEach(([s, cls], k) => {
      dumbKey.append("circle").attr("class", cls).attr("cx", 6 + k * 92).attr("r", 6);
      dumbKey.append("text").attr("class", "dumb-label").attr("x", 16 + k * 92).attr("dy", "0.32em").text(fmtSeason(s));
    });
  }

  // --- Steps ----------------------------------------------------------------------------------------
  const seasonSelect = (label, which) => {
    const select = h("select", { "aria-label": label },
      ...seasons.map((s) => h("option", { value: s }, fmtSeason(s))));
    select.addEventListener("change", () => {
      explore[which] = Number(select.value);
      Object.assign(st, explore, { showB: true });
      render();
    });
    select.value = explore[which];
    return h("label", { class: "control" }, h("span", null, label), select);
  };
  const modeRow = h("div", { class: "row" });
  const mode = segmented(modeRow, [{ value: "freq", label: "Attempts" }, { value: "pps", label: "Points per shot" }],
    explore.mode, (v) => {
      explore.mode = v;
      Object.assign(st, explore, { showB: true });
      render();
    }, "Heat map color");
  const controls = h("div", { class: "controls" },
    h("div", { class: "row" }, seasonSelect("Season A", "a"), seasonSelect("Season B", "b")), modeRow);

  const lastZ = (z) => zone(last, z).pps.toFixed(2);
  const steps = [
    { num: "Same shots, new view", title: "The court as a heat map", body: [
      h("p", null, "The dots were a sample. Here are all ", b(int(binned(first).total)), " shots of ", b(fmtSeason(first)),
        ", binned into hexagons. The brighter the hexagon, the bigger its share of every attempt."),
      h("p", null, "Past the rim, a wide band of mid-range jumpers glows: ", b(pct(zone(first, "MID").share)),
        " of shots. Only ", b(pct(threeShare(first))), " were threes.")] },
    { num: "Step 2", title: "The band cools", body: [
      h("p", null, "Put ", b(fmtSeason(last)), " beside it, on the same color scale. The mid-range falls from ",
        b(pct(zone(first, "MID").share)), " to ", b(pct(zone(last, "MID").share)), " of shots, and the glow moves out along the arc, ",
        pct(threeShare(first)), " to ", pct(threeShare(last)), " of attempts."),
      h("p", null, "The rim stays hot. The middle distance is what the game gave up.")] },
    { num: "Step 3", title: "Why there?", body: [
      h("p", null, "Color now shows ", b("points per shot"), ": gold earns more, indigo earns less. Size shows how often teams shot from each spot."),
      h("p", null, "In ", fmtSeason(last), " a mid-range attempt returned ", b(lastZ("MID")), " points, a corner three ", b(lastZ("C3")),
        " and a shot at the rim ", b(lastZ("RA")), ". Teams moved attempts away from the least valuable spot."),
      h("p", null, "But a three is only worth more ", h("em", null, "if it goes in"), ".")] },
    { num: "Your turn", title: "Pick two seasons", body: [
      h("p", null, `Compare any two of the ${seasons.length} seasons from ${fmtSeason(seasons[0])} to ${fmtSeason(last)}, and switch what the color shows.`),
      seasons[0] < STANDARD_LINE && h("p", null, `Before ${fmtSeason(STANDARD_LINE)} the arc was 22 ft all the way around.`),
      controls] },
  ].filter(Boolean);
  const actions = [
    () => Object.assign(st, STORY[0]),
    () => Object.assign(st, STORY[1]),
    () => Object.assign(st, STORY[2]),
    () => Object.assign(st, explore, { showB: true }),
  ];

  fit();
  render({ animate: false });
  const story = setupSteps(document.getElementById("q2b-steps"), steps, (i) => {
    actions[i]();
    render();
  });
  new ResizeObserver(() => { fit(); render({ animate: false }); }).observe(area);

  return { stepEl: (i) => story.els[i] };
}
