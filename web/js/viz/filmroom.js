// 3rd-quarter timeout, the film room: brushing and linking. Three views of the same team-seasons (1985-86
// on) share one selection, so the reader can test the main message on their own:
//   A. the cloud (volume × accuracy, each against its own season's league, as in Q3): drag a box, or
//      pick a corner;
//   B. the seasons strip (each season's r with win %): drag a range of seasons;
//   C. the win % histogram: drag a range of records.
// B decides which seasons are in play. A's box and C's range pick the selection among them. On every
// brush move each view redraws from the others' filters: A lights the selection, B counts it season by
// season, C fills in the records inside A's box, and the panel reads out the range's correlations
// (pooled within-season z-scores, as in win_correlations) and the selection's record. The chips set the
// same brushes with one click, and from the keyboard.
import { season as fmtSeason } from "../data.js";
import { countTo, dur, instant } from "../motion.js";
import { teamColors } from "../media.js";
import { METRICS } from "./teams.js";
import { h } from "./steps.js";
import { showTip, hideTip } from "../ui/tooltip.js";
import { getTeam, onTeam } from "../ui/team.js";

const [VOL, ACC] = METRICS;
const Z = 3.6;          // the cloud's half-width in SD, as in Q3 (the most extreme team-season is about 3.5)
const BIN = 0.05;       // histogram bins: 5 points of win %
const clampZ = (v) => Math.max(-Z, Math.min(Z, v));
const pct = d3.format(".1%");
const pct0 = d3.format(".0%");
const int = d3.format(",");
const r2 = (v) => (v == null || !Number.isFinite(v) ? "–" : (v < 0 ? "−" : "") + Math.abs(v).toFixed(2));
const zText = (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;
// The cloud's four corners. Each range is (lo, hi], so "more" means above the league average and "fewer"
// means at or below it, exactly as the Q3 groups (quadrants.csv) split them.
const CORNERS = [
  { label: "Fewer 3s · more accurate", x: [-Infinity, 0], y: [0, Infinity], h: "left", v: "top" },
  { label: "More 3s · more accurate", x: [0, Infinity], y: [0, Infinity], h: "right", v: "top" },
  { label: "Fewer 3s · less accurate", x: [-Infinity, 0], y: [-Infinity, 0], h: "left", v: "bottom" },
  { label: "More 3s · less accurate", x: [0, Infinity], y: [-Infinity, 0], h: "right", v: "bottom" },
];
const WINS = [
  { label: "Under 50%", range: [0, 0.5] },
  { label: "60%+", range: [0.6, 1] },
];

/** Pearson r between a column and win % over rows (rows missing the column are skipped). */
function pearson(rows, key) {
  const pts = rows.filter((d) => d[key] != null);
  if (pts.length < 3) return null;
  const mx = d3.mean(pts, (d) => d[key]);
  const my = d3.mean(pts, (d) => d.win_pct);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const d of pts) {
    const a = d[key] - mx;
    const b = d.win_pct - my;
    sxy += a * b;
    sxx += a * a;
    syy += b * b;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

export function initFilmRoom(data) {
  const rows = data.teams.filter((d) => d.fg3a_rate_z != null && d.fg3_pct_z != null);
  const idx = new Map(rows.map((d, i) => [d, i]));
  const seasons = [...new Set(rows.map((d) => d.season))].sort(d3.ascending);
  const first = seasons[0];
  const last = seasons[seasons.length - 1];
  const teamsIn = d3.rollup(rows, (v) => v.length, (d) => d.season);
  const maxTeams = d3.max(teamsIn.values());
  const champOf = new Map(data.champs.map((c) => [c.season, c.team_id]));
  const isChamp = (d) => champOf.get(d.season) === d.team_id;
  let fan = getTeam();
  const isFan = (d) => d.team_id === fan;
  const rOf = (s, key) => data.corr.find((c) => c.first_season === s && c.last_season === s && c.metric === key)?.r;
  // The eras of Q3 and the halftime report (nbaviz/export.py, ERAS)
  const ERAS = [[first, 1999], [2000, 2011], [2012, 2019], [2020, last]];
  const span = ([a, z]) => (a === z ? fmtSeason(a) : `${fmtSeason(a)} to ${fmtSeason(z)}`);

  // --- The selection ---------------------------------------------------------------------------------
  // seasons: [a, z], inclusive (B). box: volume and accuracy z ranges, each (lo, hi] (A), or null.
  // win: [lo, hi) of win % (C; a range that reaches 100% includes it), or null.
  const state = { seasons: [first, last], box: null, win: null };
  const inScope = (d) => d.season >= state.seasons[0] && d.season <= state.seasons[1];
  const inBox = (d) => !state.box || (d.fg3a_rate_z > state.box.x[0] && d.fg3a_rate_z <= state.box.x[1]
    && d.fg3_pct_z > state.box.y[0] && d.fg3_pct_z <= state.box.y[1]);
  const inWin = (d) => !state.win || (d.win_pct >= state.win[0] && (d.win_pct < state.win[1] || state.win[1] >= 1));
  const scoped = new Uint8Array(rows.length);
  const lit = new Uint8Array(rows.length);   // in the selection: in scope, in the box and in the win range
  const isLit = (d) => lit[idx.get(d)] === 1;

  const cloudEl = document.getElementById("film-cloud");
  const stripEl = document.getElementById("film-strip");
  const histEl = document.getElementById("film-hist");
  let L = null;            // layout: sizes and scales, set by size()
  let brushing = false;    // a brush is being dragged: no tooltips
  let spotted = null;      // the team-season picked out from the best list
  let frame = 0;

  // --- A. The cloud ------------------------------------------------------------------------------------
  const cSvg = d3.select(cloudEl).append("svg");
  const cRoot = cSvg.append("g");
  const cGrid = cRoot.append("g").attr("class", "grid");
  const cX = cRoot.append("g").attr("class", "axis");
  const cY = cRoot.append("g").attr("class", "axis");
  const cRef = cRoot.append("g");
  const cXT = cRoot.append("text").attr("class", "film-axis-title").attr("text-anchor", "middle");
  const cYT = cRoot.append("text").attr("class", "film-axis-title").attr("text-anchor", "middle");
  const dots = cRoot.append("g").selectAll("circle").data(rows).join("circle").attr("class", "film-dot")
    .classed("champ", isChamp);
  dots.filter(isChamp).raise();
  const cSpot = cRoot.append("g").attr("class", "film-spot");
  const cBrushG = cRoot.append("g").attr("class", "film-brush");
  const cBrush = d3.brush()
    .on("start", () => { brushing = true; hideTip(); })
    .on("brush end", (event) => {
      if (event.type === "end") brushing = false;
      if (!event.sourceEvent) return;   // moved by a chip or a resize: the state is already set
      state.box = event.selection ? boxFrom(event.selection) : null;
      schedule();
    });
  const corners = CORNERS.map((c) => {
    const btn = h("button", { class: "chip film-corner", type: "button", "aria-pressed": "false" }, c.label);
    btn.addEventListener("click", () => apply({ box: isBox(c) ? null : { x: c.x, y: c.y } }));
    cloudEl.append(btn);
    return { c, btn };
  });
  const isBox = (c) => !!state.box && state.box.x[0] === c.x[0] && state.box.x[1] === c.x[1]
    && state.box.y[0] === c.y[0] && state.box.y[1] === c.y[1];

  // Brush pixels ↔ z ranges. A box that reaches an edge of the chart is open on that side, so it also
  // takes the few team-seasons drawn clamped at the edge.
  function boxFrom([[x0, y0], [x1, y1]]) {
    return {
      x: [x0 <= 1 ? -Infinity : L.cx.invert(x0), x1 >= L.ciw - 1 ? Infinity : L.cx.invert(x1)],
      y: [y1 >= L.cih - 1 ? -Infinity : L.cy.invert(y1), y0 <= 1 ? Infinity : L.cy.invert(y0)],
    };
  }
  const boxPixels = (box) => [[L.cx(clampZ(box.x[0])), L.cy(clampZ(box.y[1]))], [L.cx(clampZ(box.x[1])), L.cy(clampZ(box.y[0]))]];

  // Every dot answers to the pointer (the brush's overlay sits on top, so it listens there)
  let delaunay = null;
  let pool = [];
  cBrushG.on("pointermove.tip", (event) => {
    if (brushing || !delaunay) return;
    const [px, py] = d3.pointer(event);
    const d = pool[delaunay.find(px, py)];
    if (!d || Math.hypot(L.cx(clampZ(d.fg3a_rate_z)) - px, L.cy(clampZ(d.fg3_pct_z)) - py) > 16) { hideTip(); return; }
    showTip(event, teamTip(d));
  }).on("pointerleave.tip", hideTip);

  const teamTip = (d) => ({
    title: `${d.team_name} · ${fmtSeason(d.season)}`,
    logo: data.logo(d),
    accent: teamColors(d).accent,
    rows: [
      { value: pct(d.win_pct), label: `win % (${d.wins}-${d.games - d.wins})` },
      ...METRICS.map((m) => ({ value: pct(d[m.key]), label: `${m.name} (${zText(d[`${m.key}_z`])} SD)`, color: m === VOL || m === ACC ? m.color : null })),
    ],
    note: [isChamp(d) && `${fmtSeason(d.season)} NBA champion`, isFan(d) && "Your team", !isLit(d) && "Outside your selection"]
      .filter(Boolean).join(" · ") || null,
  });

  // --- B. The seasons strip ------------------------------------------------------------------------------
  const sSvg = d3.select(stripEl).append("svg");
  const sRoot = sSvg.append("g");
  const sGrid = sRoot.append("g").attr("class", "grid");
  const sY = sRoot.append("g").attr("class", "axis");
  const sX = sRoot.append("g").attr("class", "axis");
  const sClip = sSvg.append("clipPath").attr("id", "film-strip-range").append("rect");
  const series = METRICS.map((m) => ({ ...m, pts: seasons.map((s) => [s, rOf(s, m.key)]).filter((p) => p[1] != null) }));
  const lineG = sRoot.selectAll("g.film-series").data(series).join("g").attr("class", "film-series").style("stroke", (m) => m.color);
  const faint = lineG.append("path").attr("class", "film-line faint");
  const bright = lineG.append("path").attr("class", "film-line").attr("clip-path", "url(#film-strip-range)");
  const tracks = sRoot.append("g").selectAll("rect").data(seasons).join("rect").attr("class", "film-track");
  const counts = sRoot.append("g").selectAll("rect").data(seasons).join("rect").attr("class", "film-count");
  const sBandLabel = sRoot.append("text").attr("class", "film-band-label").attr("text-anchor", "end").text("box");
  const sMark = sRoot.append("line").attr("class", "film-mark").style("display", "none");
  const sBrushG = sRoot.append("g").attr("class", "film-brush film-brush-x");
  const sBrush = d3.brushX()
    .on("start", () => { brushing = true; hideTip(); })
    .on("brush end", (event) => {
      if (event.type === "end") brushing = false;
      if (!event.sourceEvent) return;
      if (!event.selection) { state.seasons = [first, last]; schedule(); return; }
      state.seasons = seasonsFrom(event.selection);
      if (event.type === "end") moveSeasons(true);   // snap to whole seasons
      schedule();
    });
  sBrushG.on("pointermove.tip", (event) => {
    if (brushing) return;
    const s = Math.max(first, Math.min(last, Math.round(L.sx.invert(d3.pointer(event)[0]))));
    const inSeason = rows.filter((d) => d.season === s);
    showTip(event, {
      title: `${fmtSeason(s)} · how each stat tracked winning`,
      rows: [
        ...METRICS.map((m) => ({ value: `r = ${r2(rOf(s, m.key))}`, label: m.label, color: m.color })),
        { value: `${inSeason.filter((d) => inBox(d) && inWin(d)).length} of ${inSeason.length}`, label: "teams in your box and win range" },
      ],
    });
  }).on("pointerleave.tip", hideTip);

  // A season is in the range when its middle is inside the brush
  function seasonsFrom([p0, p1]) {
    let a = Math.max(first, Math.ceil(L.sx.invert(p0)));
    let z = Math.min(last, Math.floor(L.sx.invert(p1)));
    if (a > z) a = z = Math.max(first, Math.min(last, Math.round(L.sx.invert((p0 + p1) / 2))));
    return [a, z];
  }
  function moveSeasons(animate) {
    const [a, z] = state.seasons;
    const sel = a === first && z === last ? null : [L.sx(a - 0.5), L.sx(z + 0.5)];
    (animate && !instant ? sBrushG.transition().duration(dur(0.3) * 1000) : sBrushG).call(sBrush.move, sel);
  }

  // --- C. The win % histogram -----------------------------------------------------------------------------
  const nBins = Math.round(1 / BIN);
  const binOf = (w) => Math.min(nBins - 1, Math.floor(w / BIN + 1e-9));
  const hSvg = d3.select(histEl).append("svg");
  const hRoot = hSvg.append("g");
  const hX = hRoot.append("g").attr("class", "axis");
  const ghosts = hRoot.append("g").selectAll("rect").data(d3.range(nBins)).join("rect").attr("class", "film-ghost");
  const bars = hRoot.append("g").selectAll("rect").data(d3.range(nBins)).join("rect").attr("class", "film-bar");
  const hHalf = hRoot.append("line").attr("class", "film-half");
  const hMean = hRoot.append("g").attr("class", "film-mean");
  hMean.append("line");
  hMean.append("text").attr("text-anchor", "middle");
  const hBrushG = hRoot.append("g").attr("class", "film-brush film-brush-x");
  const hBrush = d3.brushX()
    .on("start", () => { brushing = true; hideTip(); })
    .on("brush end", (event) => {
      if (event.type === "end") brushing = false;
      if (!event.sourceEvent) return;
      if (!event.selection) { state.win = null; schedule(); return; }
      let [lo, hi] = event.selection.map(L.hx.invert);
      if (event.type === "end") {   // snap to the bins
        lo = Math.max(0, Math.round(lo / BIN) * BIN);
        hi = Math.min(1, Math.round(hi / BIN) * BIN);
        if (hi <= lo) { hi = Math.min(1, lo + BIN); lo = hi - BIN; }
        lo = +lo.toFixed(2);
        hi = +hi.toFixed(2);
      }
      state.win = [lo, hi];
      if (event.type === "end") moveWin(true);
      schedule();
    });
  let binCounts = { all: [], box: [] };
  hBrushG.on("pointermove.tip", (event) => {
    if (brushing) return;
    const k = binOf(Math.max(0, Math.min(1, L.hx.invert(d3.pointer(event)[0]))));
    showTip(event, {
      title: `${pct0(k * BIN)}–${pct0((k + 1) * BIN)} of games won`,
      rows: [
        { value: int(binCounts.all[k]), label: `team-seasons, ${span(state.seasons)}` },
        { value: int(binCounts.box[k]), label: state.box ? "of them inside your box" : "of them (no box drawn)" },
      ],
    });
  }).on("pointerleave.tip", hideTip);
  function moveWin(animate) {
    const sel = state.win ? state.win.map(L.hx) : null;
    (animate && !instant ? hBrushG.transition().duration(dur(0.3) * 1000) : hBrushG).call(hBrush.move, sel);
  }

  // --- Chips, readouts, best records ----------------------------------------------------------------------
  const yy = (y) => String(y).slice(-2);
  const eraChips = [{ label: "All", range: [first, last] }, ...ERAS.map(([a, z]) => ({ label: `${yy(a)}–${yy(z + 1)}`, range: [a, z] }))]
    .map((e) => {
      const btn = h("button", { class: "chip", type: "button", "aria-pressed": "false", title: span(e.range) }, e.label);
      btn.addEventListener("click", () => apply({ seasons: e.range }));
      document.getElementById("film-eras").append(btn);
      return { e, btn };
    });
  const winChips = WINS.map((w) => {
    const btn = h("button", { class: "chip", type: "button", "aria-pressed": "false" }, w.label);
    btn.addEventListener("click", () => apply({ win: sameWin(w.range) ? null : w.range }));
    document.getElementById("film-win").append(btn);
    return { w, btn };
  });
  const sameWin = (range) => !!state.win && state.win[0] === range[0] && state.win[1] === range[1];
  document.getElementById("film-reset").addEventListener("click", () => apply({ seasons: [first, last], box: null, win: null }));

  const cell = (label, color = null) => {
    const led = h("span", { class: "led dots" }, "–");
    if (color) {
      led.style.color = color;
      led.style.textShadow = `0 0 16px ${color}`;
    }
    const sub = h("small");
    return { el: h("div", { class: "film-cell" }, h("span", { class: "lbl" }, label), h("p", null, led, sub)), led, sub };
  };
  const rTitle = h("p", { class: "film-sub" });
  const rCells = METRICS.map((m) => ({ m, ...cell(`${m.label} r`, m.color) }));
  rCells.forEach((c) => { c.sub.textContent = c.m.name; });
  document.getElementById("film-r").append(rTitle, h("div", { class: "film-cells" }, rCells.map((c) => c.el)));

  const boardTitle = h("p", { class: "film-sub" });
  const nCell = cell("Team-seasons");
  const winCell = cell("Avg win %");
  const champCell = cell("Champions");
  champCell.el.classList.add("gold");
  const best = h("div", { class: "film-best", "aria-label": "Best records in your selection" });
  document.getElementById("film-board").append(boardTitle, h("div", { class: "film-cells" }, nCell.el, winCell.el, champCell.el), best);

  const shown = new WeakMap();   // LED → the value on it, so a chip's change counts from there
  function led(el, v, fmt, animate) {
    const from = shown.get(el);
    shown.set(el, v);
    if (v == null || !Number.isFinite(v)) { el.textContent = "–"; return; }
    if (animate && from != null && Number.isFinite(from) && from !== v) countTo(el, from, v, { duration: 0.7, format: fmt });
    else el.textContent = fmt(v);
  }

  const legend = document.getElementById("film-legend");
  function paintLegend() {
    const fanRow = rows.filter(isFan).at(-1);
    legend.replaceChildren(...[
      h("span", null, h("i", { class: "film-key on" }), "selected"),
      h("span", null, h("i", { class: "film-key" }), "not"),
      h("span", null, h("i", { class: "film-key champ" }), "champion"),
      fanRow && h("span", { style: `--team:${teamColors(fanRow).accent}` }, h("i", { class: "film-key fan" }), `your team (${fanRow.team})`),
    ].filter(Boolean));
  }

  // The selection's best records, each one a handle on its dot in A and its season in B. Rebuilt only
  // when the five change, so dragging a brush doesn't reload the logos every frame.
  let bestKey = null;
  function paintBest(sel) {
    const top = [...sel].sort((a, c) => c.win_pct - a.win_pct || c.season - a.season).slice(0, 5);
    const key = top.map((d) => idx.get(d)).join();
    if (key === bestKey) return;
    bestKey = key;
    best.replaceChildren(...top.map((d) => {
      const logo = data.logo(d);
      const btn = h("button", { type: "button", title: `${d.team_name} · ${fmtSeason(d.season)}` },
        logo ? h("img", { class: "logo-chip", src: logo, alt: "" }) : h("span", { class: "film-abbr" }, d.team),
        h("span", null, `${d.team} ${fmtSeason(d.season)}`), h("b", null, pct(d.win_pct)));
      btn.style.setProperty("--team", teamColors(d).accent);
      btn.addEventListener("pointerenter", () => spot(d));
      btn.addEventListener("pointerleave", () => spot(null));
      btn.addEventListener("focus", () => spot(d));
      btn.addEventListener("blur", () => spot(null));
      return btn;
    }));
    if (spotted && !top.includes(spotted)) spot(null);
  }
  function spot(d) {
    spotted = d;
    if (!L) return;
    const g = cSpot.selectAll("g").data(d ? [d] : []).join((enter) => {
      const e = enter.append("g");
      e.append("circle");
      e.append("text").attr("dy", "-1.1em").attr("text-anchor", "middle");
      return e;
    });
    g.attr("transform", (x) => `translate(${L.cx(clampZ(x.fg3a_rate_z))},${L.cy(clampZ(x.fg3_pct_z))})`)
      .style("--team", (x) => teamColors(x).accent);
    g.select("circle").attr("r", L.dot * 3.2);
    g.select("text").text((x) => `${x.team} ${fmtSeason(x.season)}`);
    sMark.style("display", d ? null : "none");
    if (d) sMark.attr("x1", L.sx(d.season)).attr("x2", L.sx(d.season));
  }

  // --- Layout ---------------------------------------------------------------------------------------------
  function size() {
    // A
    const cw = cloudEl.clientWidth;
    const ch = cloudEl.clientHeight;
    if (!cw || !ch) return false;
    const narrow = cw < 520;
    const cm = { t: 6, r: 8, b: 42, l: 46 };
    const ciw = cw - cm.l - cm.r;
    const cih = ch - cm.t - cm.b;
    const cx = d3.scaleLinear([-Z, Z], [0, ciw]);
    const cy = d3.scaleLinear([-Z, Z], [cih, 0]);
    const dot = Math.max(1.8, Math.min(3.4, ciw / 240));
    cSvg.attr("viewBox", `0 0 ${cw} ${ch}`);
    cRoot.attr("transform", `translate(${cm.l},${cm.t})`);
    const ticks = narrow ? [-2, 0, 2] : [-3, -2, -1, 0, 1, 2, 3];
    cGrid.call(d3.axisLeft(cy).tickValues(ticks).tickSize(-ciw).tickFormat(""));
    cY.call(d3.axisLeft(cy).tickValues(ticks).tickSize(0).tickPadding(8).tickFormat((v) => (v === 0 ? "avg" : `${v > 0 ? "+" : "−"}${Math.abs(v)}`)));
    cY.select(".domain").remove();
    cX.attr("transform", `translate(0,${cih})`)
      .call(d3.axisBottom(cx).tickValues(ticks).tickSizeOuter(0).tickFormat((v) => (v === 0 ? "league avg" : `${v > 0 ? "+" : "−"}${Math.abs(v)} SD`)));
    cX.select(".domain").style("stroke", "var(--court)");
    cXT.attr("x", ciw / 2).attr("y", cih + 36).text(narrow ? `${VOL.label} (${VOL.name}) →` : `${VOL.label}: ${VOL.long}, vs. that season’s league →`);
    cYT.attr("transform", `translate(-34,${cih / 2}) rotate(-90)`).text(`${ACC.label}: ${ACC.name} vs. league (SD) →`);
    cRef.selectAll("line").data([[cx(0), cx(0), 0, cih], [0, ciw, cy(0), cy(0)]]).join("line").attr("class", "film-zero")
      .attr("x1", (d) => d[0]).attr("x2", (d) => d[1]).attr("y1", (d) => d[2]).attr("y2", (d) => d[3]);
    dots.attr("cx", (d) => cx(clampZ(d.fg3a_rate_z))).attr("cy", (d) => cy(clampZ(d.fg3_pct_z)))
      .attr("r", (d) => (isFan(d) ? dot * 1.5 : isChamp(d) ? dot * 1.25 : dot));
    cBrush.extent([[0, 0], [ciw, cih]]);
    cBrushG.call(cBrush);
    for (const { c, btn } of corners) {
      btn.style.left = c.h === "left" ? `${cm.l + 6}px` : "auto";
      btn.style.right = c.h === "right" ? `${cw - cm.l - ciw + 6}px` : "auto";
      btn.style.top = c.v === "top" ? `${cm.t + 6}px` : "auto";
      btn.style.bottom = c.v === "bottom" ? `${ch - cm.t - cih + 6}px` : "auto";
    }

    // B
    const sw = stripEl.clientWidth;
    const sh = stripEl.clientHeight;
    const sm = { t: 6, r: 8, b: 18, l: 30 };
    const siw = sw - sm.l - sm.r;
    const sih = sh - sm.t - sm.b;
    const band = Math.max(14, Math.min(26, sih * 0.24));   // the count bars under the lines
    const lineH = sih - band - 6;
    const sx = d3.scaleLinear([first - 0.5, last + 0.5], [0, siw]);
    const sy = d3.scaleLinear([-0.2, 1], [lineH, 0]);
    sSvg.attr("viewBox", `0 0 ${sw} ${sh}`);
    sRoot.attr("transform", `translate(${sm.l},${sm.t})`);
    sGrid.call(d3.axisLeft(sy).tickValues([0, 0.5, 1]).tickSize(-siw).tickFormat(""));
    sY.call(d3.axisLeft(sy).tickValues([0, 0.5, 1]).tickSize(0).tickPadding(6).tickFormat(d3.format(".1f")));
    sY.select(".domain").remove();
    const years = d3.range(1990, last + 1, siw < 420 ? 10 : 5);
    sX.attr("transform", `translate(0,${sih})`).call(d3.axisBottom(sx).tickValues(years).tickSize(0).tickPadding(5).tickFormat(fmtSeason));
    sX.select(".domain").remove();
    const line = d3.line().x((p) => sx(p[0])).y((p) => sy(p[1]));
    faint.attr("d", (m) => line(m.pts));
    bright.attr("d", (m) => line(m.pts));
    const bw = Math.max(1, sx(1) - sx(0) - 2);
    tracks.attr("x", (s) => sx(s) - bw / 2).attr("width", bw).attr("y", sih - band).attr("height", band);
    counts.attr("x", (s) => sx(s) - bw / 2).attr("width", bw);
    sBandLabel.attr("x", -6).attr("y", sih - band / 2).attr("dy", "0.35em");
    sMark.attr("y1", 0).attr("y2", sih);
    sBrush.extent([[0, 0], [siw, sih]]);
    sBrushG.call(sBrush);

    // C
    const hw = histEl.clientWidth;
    const hh = histEl.clientHeight;
    const hm = { t: 16, r: 8, b: 18, l: 30 };
    const hiw = hw - hm.l - hm.r;
    const hih = hh - hm.t - hm.b;
    const hx = d3.scaleLinear([0, 1], [0, hiw]);
    hSvg.attr("viewBox", `0 0 ${hw} ${hh}`);
    hRoot.attr("transform", `translate(${hm.l},${hm.t})`);
    hX.attr("transform", `translate(0,${hih})`).call(d3.axisBottom(hx).tickValues([0, 0.25, 0.5, 0.75, 1]).tickSizeOuter(0).tickFormat(pct0));
    hX.select(".domain").style("stroke", "var(--court)");
    const binW = hx(BIN) - hx(0);
    ghosts.attr("x", (k) => hx(k * BIN) + 1).attr("width", Math.max(1, binW - 2));
    bars.attr("x", (k) => hx(k * BIN) + 1).attr("width", Math.max(1, binW - 2));
    hHalf.attr("x1", hx(0.5)).attr("x2", hx(0.5)).attr("y1", -6).attr("y2", hih);
    hBrush.extent([[0, 0], [hiw, hih]]);
    hBrushG.call(hBrush);

    L = { cx, cy, ciw, cih, dot, sx, sy, siw, sih, band, hx, hiw, hih };
    delaunay = null;
    return true;
  }

  // --- Redraw from the state -------------------------------------------------------------------------------
  function schedule() {
    if (!frame) frame = requestAnimationFrame(() => update(false));
  }

  function apply(next, animate = true) {
    Object.assign(state, next);
    if (!L) return;
    const go = (sel) => (animate && !instant ? sel.transition().duration(dur(0.6) * 1000).ease(d3.easeCubicInOut) : sel);
    go(cBrushG).call(cBrush.move, state.box ? boxPixels(state.box) : null);
    moveSeasons(animate);
    moveWin(animate);
    update(animate);
  }

  let scopeKey = "";
  function update(animate = false) {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!L) return;
    const scope = [];
    const sel = [];
    const perSeason = new Map(seasons.map((s) => [s, 0]));   // box and win range, every season
    rows.forEach((d, i) => {
      const s = inScope(d);
      const picked = inBox(d) && inWin(d);
      scoped[i] = s ? 1 : 0;
      lit[i] = s && picked ? 1 : 0;
      if (picked) perSeason.set(d.season, perSeason.get(d.season) + 1);
      if (s) scope.push(d);
      if (s && picked) sel.push(d);
    });
    const [a, z] = state.seasons;

    // A
    dots.classed("out", (d) => !scoped[idx.get(d)]).classed("on", (d) => lit[idx.get(d)] === 1);
    const key = `${a}-${z}`;
    if (!delaunay || key !== scopeKey) {
      scopeKey = key;
      pool = scope;
      delaunay = d3.Delaunay.from(pool, (d) => L.cx(clampZ(d.fg3a_rate_z)), (d) => L.cy(clampZ(d.fg3_pct_z)));
    }
    corners.forEach(({ c, btn }) => btn.setAttribute("aria-pressed", String(isBox(c))));

    // B
    sClip.attr("x", L.sx(a - 0.5)).attr("width", L.sx(z + 0.5) - L.sx(a - 0.5)).attr("y", -8).attr("height", L.sih + 16);
    const unit = L.band / maxTeams;
    counts.attr("y", (s) => L.sih - perSeason.get(s) * unit).attr("height", (s) => perSeason.get(s) * unit)
      .classed("in", (s) => s >= a && s <= z);
    eraChips.forEach(({ e, btn }) => btn.setAttribute("aria-pressed", String(e.range[0] === a && e.range[1] === z)));

    // C
    const all = new Array(nBins).fill(0);
    const box = new Array(nBins).fill(0);
    for (const d of scope) {
      const k = binOf(d.win_pct);
      all[k] += 1;
      if (inBox(d)) box[k] += 1;
    }
    binCounts = { all, box };
    const hy = d3.scaleLinear([0, Math.max(1, d3.max(all))], [L.hih, 0]);
    const t = animate && !instant ? d3.transition().duration(dur(0.6) * 1000).ease(d3.easeCubicInOut) : null;
    const go = (s) => (t ? s.transition(t) : s);
    go(ghosts).attr("y", (k) => hy(all[k])).attr("height", (k) => L.hih - hy(all[k]));
    go(bars).attr("y", (k) => hy(box[k])).attr("height", (k) => L.hih - hy(box[k]));
    bars.classed("off", (k) => !!state.win && ((k + 0.5) * BIN < state.win[0] || (k + 0.5) * BIN > state.win[1]));
    const mean = d3.mean(sel, (d) => d.win_pct);
    hMean.style("display", mean == null ? "none" : null);
    if (mean != null) {
      go(hMean).attr("transform", `translate(${L.hx(mean)},0)`);
      hMean.select("line").attr("y1", -4).attr("y2", L.hih);
      hMean.select("text").attr("y", -6).text(`avg ${pct0(mean)}`);
    }
    winChips.forEach(({ w, btn }) => btn.setAttribute("aria-pressed", String(sameWin(w.range))));

    // Readouts
    rTitle.textContent = `How each stat tracks winning · ${span(state.seasons)} · ${int(scope.length)} team-seasons`;
    rCells.forEach((c) => led(c.led, pearson(scope, `${c.m.key}_z`), r2, animate));
    const filtered = state.box || state.win;
    boardTitle.textContent = filtered ? `Your selection · ${int(sel.length)} of ${int(scope.length)} team-seasons` : "Your selection · every team-season in range";
    led(nCell.led, sel.length, (v) => int(Math.round(v)), animate);
    nCell.sub.textContent = `of ${int(scope.length)}`;
    led(winCell.led, mean ?? null, pct, animate);
    winCell.sub.textContent = sel.length ? `${pct0(d3.mean(sel, (d) => (d.win_pct >= 0.5 ? 1 : 0)))} at .500+` : "none";
    const champsIn = scope.filter(isChamp).length;
    led(champCell.led, sel.filter(isChamp).length, (v) => String(Math.round(v)), animate);
    champCell.sub.textContent = `of ${champsIn}`;
    paintBest(sel);
    spot(spotted);
  }

  function paintFan() {
    dots.classed("fan", isFan).style("--team", (d) => (isFan(d) ? teamColors(d).accent : null));
    dots.filter(isFan).raise();
    paintLegend();
  }

  paintFan();
  if (size()) apply({}, false);
  let resizing = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(resizing);
    resizing = requestAnimationFrame(() => { if (size()) apply({}, false); });
  }).observe(document.getElementById("film-grid"));
  onTeam((id) => {
    fan = id;
    paintFan();
    if (size()) apply({}, false);
  });

  /** For checks and deep links: set the brushes from data values (seasons, box, win), as a chip would. */
  return { set: (next) => apply(next, false), state };
}
