// 2nd quarter (sketches ZD8 / QF7): real shots as glowing dots on a flat court. Scroll steps carry the
// dots from one season's spots to another's (each dot moves outward along the floor, not across it),
// then stack them into one column per zone to show what each zone returns. The last step hands the
// reader a trend strip that scrubs the seasons, with each zone's share written on the floor, and a
// switch for a heat map of every attempt under the dots (heat.js, off by default). DRAFT.
import { shotSampler, ZONES, ZONE_NAMES, season as fmtSeason, STANDARD_LINE } from "../data.js";
import { ParticleField } from "./particles.js";
import { HeatField, shotDensity, densityQuantile } from "./heat.js";
import { fitCourt, drawCourt } from "./court.js";
import { SHOT_STYLES, shotStyle } from "./hero.js";
import { dur } from "../motion.js";
import { setupSteps, h, b, key } from "./steps.js";

const STYLES = [...SHOT_STYLES, { color: "#a9a59c", alpha: 0.12, size: 1.6 }];
const DIM = STYLES.length - 1;
const HIGHLIGHT = { all: () => true, two: (z) => z < 3, three: (z) => z >= 3, mid: (z) => z === 2 };
const pct = d3.format(".1%");

export function initShotMap(data) {
  const seasons = data.gridSeasons;
  const first = seasons.find((s) => s >= STANDARD_LINE) ?? seasons[0];   // the story starts with today's arc
  const last = seasons[seasons.length - 1];
  const n = window.innerWidth < 900 ? 2200 : 4200;
  const area = document.getElementById("q2-viz");
  const linesEl = document.getElementById("q2-lines");
  const heatEl = document.getElementById("q2-heat");
  const overlay = d3.select("#q2-overlay");
  const field = new ParticleField(document.getElementById("q2-canvas"), n);
  field.setStyles(STYLES);

  // One set of particles for every season, so particle i in one season becomes particle i in the next
  const draw = shotSampler(n, 1000);
  const cache = new Map();
  const sample = (s) => {
    if (!cache.has(s)) cache.set(s, draw(data.gridBySeason.get(s)));
    return cache.get(s);
  };
  // Heat map: every attempt of every season, on one scale (2% of cells glow fully: the rim, the corners)
  const density = new Map(seasons.map((s) => [s, shotDensity(data.gridBySeason.get(s))]));
  const heat = new HeatField(heatEl, densityQuantile(density.values(), 0.98));
  let heatOn = false;
  const zoneStat = (s, z) => data.zoneShare(s, z);
  const threeShare = (s) => zoneStat(s, "C3").share + zoneStat(s, "AB3").share;
  // Middle step: the first season with more threes than mid-range jumpers
  const crossover = seasons.find((s) => s > first && threeShare(s) > zoneStat(s, "MID").share);
  const mid = crossover && crossover < last ? crossover : null;

  let court = null;
  let state = { season: null, highlight: "all", view: "court", readout: false };

  function fit() {
    court = fitCourt(area.clientWidth, area.clientHeight);
    drawCourt(linesEl, court, { shortLine: (state.season ?? last) < STANDARD_LINE });
    overlay.attr("width", court.w).attr("height", court.h);
    field.resize(court.w, court.h);
    heat.resize(court);
  }

  function showCourt(season, highlight, { animate = true, duration = null, readout = false } = {}) {
    const sm = sample(season);
    const moved = season !== state.season;
    const lineStyle = (season < STANDARD_LINE) !== ((state.season ?? last) < STANDARD_LINE);
    state = { season, highlight, view: "court", readout };
    if (lineStyle) drawCourt(linesEl, court, { shortLine: season < STANDARD_LINE });
    const test = HIGHLIGHT[highlight];
    const tx = Float32Array.from(sm.x, (v) => court.x(v));
    const ty = Float32Array.from(sm.y, (v) => court.y(v));
    const st = Uint8Array.from(sm.zone, (z, i) => (test(z) ? shotStyle(z, sm.made[i]) : DIM));
    const time = animate ? dur(duration ?? (moved ? 2.2 : 0.7)) : 0;
    gsap.to(linesEl, { opacity: 1, duration: dur(0.6) });
    gsap.to(heatEl, { opacity: heatOn ? 1 : 0, duration: dur(0.6) });
    heat.show(density.get(season), { keep: test, duration: time });
    labels(null);
    stamp(season, highlight);
    readouts(readout ? season : null, time);
    return field.morph(tx, ty, st, { duration: time, spread: moved ? 0.55 : 0.25, ease: "power3.inOut" });
  }

  function showColumns(season) {
    const sm = sample(season);
    state = { season, highlight: "all", view: "columns", readout: false };
    const groups = ZONES.map(() => []);
    for (let i = 0; i < n; i++) groups[sm.zone[i]].push(i);
    groups.forEach((g) => g.sort((a, c) => sm.made[c] - sm.made[a]));  // makes at the bottom
    const colW = court.width / ZONES.length;
    const perRow = 12;
    const rows = Math.ceil(d3.max(groups, (g) => g.length) / perRow);
    const d = Math.min((colW * 0.7) / perRow, (court.height * 0.62) / rows);
    const base = court.oy + court.height * 0.96;
    const tx = new Float32Array(n);
    const ty = new Float32Array(n);
    const st = new Uint8Array(n);
    const tops = [];
    groups.forEach((g, z) => {
      const cx = court.ox + colW * (z + 0.5);
      g.forEach((i, j) => {
        tx[i] = cx - (perRow * d) / 2 + (j % perRow) * d + d / 2;
        ty[i] = base - Math.floor(j / perRow) * d;
        st[i] = shotStyle(z, sm.made[i]);
      });
      tops.push({ z, cx, top: base - Math.ceil(g.length / perRow) * d });
    });
    gsap.to(linesEl, { opacity: 0.12, duration: dur(0.6) });
    gsap.to(heatEl, { opacity: 0, duration: dur(0.6) });
    stamp(season, "columns");
    readouts(null);
    labels(tops, season);
    return field.morph(tx, ty, st, { duration: dur(2), spread: 0.5, ease: "power3.inOut" });
  }

  // Season stamp in the corner of the court
  function stamp(season, mode) {
    const g = overlay.selectAll("g.stamp").data([0]).join((enter) => {
      const e = enter.append("g").attr("class", "stamp");
      e.append("text").attr("class", "season-stamp");
      e.append("text").attr("class", "season-sub").attr("y", 22);
      return e;
    }).attr("transform", `translate(${court.ox + 12},${court.oy + court.height - 34})`);
    g.select(".season-stamp").text(fmtSeason(season));
    g.select(".season-sub").text(mode === "columns"
      ? "points per shot, by zone"
      : `${d3.format(",")(n)} sampled shots · ${pct(threeShare(season))} threes`);
    g.style("opacity", mode === "columns" ? 0 : 1);
  }

  // Zone labels above the columns
  function labels(tops, season) {
    const sel = overlay.selectAll("g.col").data(tops || [], (t) => t.z);
    sel.exit().transition().duration(dur(0.3) * 1000).style("opacity", 0).remove();
    const enter = sel.enter().append("g").attr("class", "col").style("opacity", 0);
    enter.append("text").attr("class", "col-label");
    enter.append("text").attr("class", "col-value");
    enter.append("text").attr("class", "col-sub pps");
    enter.append("text").attr("class", "col-sub share");
    const all = enter.merge(sel).attr("transform", (t) => `translate(${t.cx},${t.top - 18})`);
    all.select(".col-label").attr("text-anchor", "middle").attr("y", -66).text((t) => ZONE_NAMES[ZONES[t.z]]);
    all.select(".col-value").attr("text-anchor", "middle").attr("y", -36).text((t) => zoneStat(season, ZONES[t.z]).pps.toFixed(2));
    all.select(".pps").attr("text-anchor", "middle").attr("y", -18).text("pts per shot");
    all.select(".share").attr("text-anchor", "middle").attr("y", -3)
      .text((t) => `${pct(zoneStat(season, ZONES[t.z]).share)} of shots`);
    all.transition().delay(dur(1.2) * 1000).duration(dur(0.6) * 1000).style("opacity", 1);
  }

  // Explore readouts on the floor: the two zones the story is about, each against the first season
  // with today's arc. The numbers count to each new season while the dots move.
  const READOUTS = [
    { cls: "two", name: "Mid-range", share: (s) => zoneStat(s, "MID").share, at: [15, 8] },
    { cls: "three", name: "Threes", share: threeShare, at: [0, 33] },
  ];
  function readouts(season, time = 0) {
    const size = Math.max(18, Math.min(44, court.k * 2));
    const sel = overlay.selectAll("g.readout").data(season == null ? [] : READOUTS, (r) => r.name);
    sel.exit().transition().duration(dur(0.3) * 1000).style("opacity", 0).remove();
    const enter = sel.enter().append("g").attr("class", (r) => `readout ${r.cls}`).style("opacity", 0);
    ["name", "value", "sub"].forEach((part) => enter.append("text").attr("class", `readout-${part}`).attr("text-anchor", "middle"));
    const all = enter.merge(sel).attr("transform", (r) => `translate(${court.x(r.at[0])},${court.y(r.at[1])})`);
    all.interrupt().transition().duration(dur(0.6) * 1000).style("opacity", 1);
    all.select(".readout-name").attr("y", -size * 0.95).text((r) => r.name);
    all.select(".readout-value").style("font-size", `${size}px`).transition().duration(time * 1000).ease(d3.easeCubicInOut)
      .textTween(function (r) {
        const to = r.share(season);
        const i = d3.interpolate(this.share ?? to, to);
        this.share = to;
        return (t) => pct(i(t));
      });
    all.select(".readout-sub").attr("y", 18).text((r) => `${pct(r.share(first))} in ${fmtSeason(first)}`);
  }

  // Trend strip: threes against mid-range, every season, bright up to the season on show. It is also
  // the season control: click or drag along it, or use the arrow keys.
  function trendStrip(parent, onPick) {
    const W = 348;
    const H = 112;
    const m = { l: 9, r: 76, t: 16 };
    const track = 88;
    const x = d3.scalePoint(seasons, [m.l, W - m.r]);
    const y = d3.scaleLinear([0, 0.45], [track - 12, m.t]);
    const series = [READOUTS[1], READOUTS[0]];
    const svg = d3.select(parent).append("svg").attr("class", "trend").attr("viewBox", `0 0 ${W} ${H}`)
      .attr("role", "slider").attr("tabindex", 0).attr("aria-label", "Season")
      .attr("aria-valuemin", seasons[0]).attr("aria-valuemax", last);
    const clip = svg.append("clipPath").attr("id", "q2-trend-past").append("rect").attr("height", H);
    const path = (r) => d3.line().x((s) => x(s)).y((s) => y(r.share(s)))(seasons);
    const groups = svg.selectAll("g.series").data(series).join("g").attr("class", (r) => `series ${r.cls}`);
    groups.append("path").attr("class", "line future").attr("d", path);
    groups.append("path").attr("class", "line").attr("d", path).attr("clip-path", "url(#q2-trend-past)");
    groups.append("text").attr("class", "name").attr("x", W - m.r + 8).attr("y", (r) => y(r.share(last))).attr("dy", "0.35em")
      .text((r) => r.name);
    if (mid) {
      svg.append("line").attr("class", "cross").attr("x1", x(mid)).attr("x2", x(mid)).attr("y1", m.t - 3).attr("y2", y(threeShare(mid)) - 5);
      svg.append("text").attr("class", "end").attr("x", x(mid)).attr("y", m.t - 7).attr("text-anchor", "middle").text("crossover");
    }
    svg.append("line").attr("class", "track").attr("x1", m.l).attr("x2", W - m.r).attr("y1", track).attr("y2", track);
    const head = svg.append("line").attr("class", "head").attr("y1", m.t).attr("y2", track);
    const dots = svg.selectAll("circle.dot").data(series).join("circle").attr("class", (r) => `dot ${r.cls}`).attr("r", 3.5);
    const knob = svg.append("circle").attr("class", "knob").attr("cy", track).attr("r", 7);
    svg.append("text").attr("class", "end").attr("x", m.l).attr("y", H - 4).text(fmtSeason(seasons[0]));
    svg.append("text").attr("class", "end").attr("x", W - m.r).attr("y", H - 4).attr("text-anchor", "end").text(fmtSeason(last));

    const pickAt = (event) => {
      const i = Math.round((d3.pointer(event, svg.node())[0] - m.l) / x.step());
      onPick(seasons[Math.max(0, Math.min(seasons.length - 1, i))]);
    };
    svg.on("pointerdown", (event) => { svg.node().setPointerCapture(event.pointerId); pickAt(event); })
      .on("pointermove", (event) => { if (svg.node().hasPointerCapture(event.pointerId)) pickAt(event); })
      .on("keydown", (event) => {
        const by = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, Home: -Infinity, End: Infinity }[event.key];
        if (by == null) return;
        event.preventDefault();
        onPick(seasons[Math.max(0, Math.min(seasons.length - 1, seasons.indexOf(explore.season) + by))]);
      });

    return {
      set(season, time = 0) {
        const go = (sel) => (time ? sel.transition().duration(time * 1000).ease(d3.easeCubicInOut) : sel.interrupt());
        go(clip).attr("width", x(season));
        go(head).attr("x1", x(season)).attr("x2", x(season));
        go(knob).attr("cx", x(season));
        go(dots).attr("cx", x(season)).attr("cy", (r) => y(r.share(season)));
        svg.attr("aria-valuenow", season).attr("aria-valuetext", fmtSeason(season));
      },
    };
  }

  // --- Steps ------------------------------------------------------------------------------------------
  const explore = { season: last, highlight: "all" };
  const chips = h("div", { class: "row" });
  const controls = h("div", { class: "controls" }, chips);
  const steps = [
    { num: "How to read", title: "Every dot is a shot", body: [
      h("p", null, "Each dot is a real field-goal attempt from ", b(fmtSeason(first)), ", drawn from NBA.com shot charts. ",
        key("three"), "Orange are threes, ", key("two"), "blue are twos. Bright dots went in.")] },
    { num: "Step 2", title: "The mid-range was king", body: [
      h("p", null, "In ", fmtSeason(first), ", ", b(pct(zoneStat(first, "MID").share)), " of all shots were mid-range jumpers, the long twos between the paint and the arc."),
      h("p", null, "Only ", b(pct(threeShare(first))), " were threes.")] },
    mid && { num: "Step 3", title: "The crossover", body: [
      h("p", null, "In ", fmtSeason(mid), ", threes passed the mid-range for the first time: ", b(pct(threeShare(mid))),
        " of attempts against ", b(pct(zoneStat(mid, "MID").share)), ". Watch the dots slide from the mid-range out to the arc.")] },
    { num: mid ? "Step 4" : "Step 3", title: "The arc is the new paint", body: [
      h("p", null, "In ", fmtSeason(last), ", ", b(pct(threeShare(last))), " of shots were threes. Only ", b(pct(zoneStat(last, "MID").share)), " came from the mid-range.")] },
    { num: "The math", title: "Follow the points", body: [
      h("p", null, "Why move? In ", fmtSeason(last), " a mid-range shot returned ", b(zoneStat(last, "MID").pps.toFixed(2)),
        " points per attempt. A corner three returned ", b(zoneStat(last, "C3").pps.toFixed(2)), ", and a shot at the rim ", b(zoneStat(last, "RA").pps.toFixed(2)), "."),
      h("p", null, "Each column holds one zone’s dots; the bright ones at the bottom went in.")] },
    { num: "Your turn", title: "Pick a season", body: [
      h("p", null, `Drag along the chart through ${seasons.length} seasons of shot charts, ${fmtSeason(seasons[0])} to ${fmtSeason(last)}, or press play, and filter by shot type.`),
      seasons[0] < STANDARD_LINE && h("p", null, `In ${fmtSeason(seasons[0])} the arc was 22 ft all the way around. Watch it move back out.`),
      controls] },
  ].filter(Boolean);
  const actions = [
    () => showCourt(first, "all"),
    () => showCourt(first, "mid"),
    ...(mid ? [() => showCourt(mid, "three")] : []),
    () => showCourt(last, "three"),
    () => showColumns(last),
    () => showCourt(explore.season, explore.highlight, { readout: true }),
  ];

  const strip = trendStrip(controls, (v) => {
    stop();
    if (v !== explore.season) goTo(v);
  });
  const out = h("output", null);
  const playBtn = h("button", { class: "btn primary", type: "button" }, "▶ Play");
  const heatBtn = h("button", { class: "chip", type: "button", "aria-pressed": "false" }, "Heat map");
  heatBtn.addEventListener("click", () => {
    heatOn = !heatOn;
    heatBtn.setAttribute("aria-pressed", String(heatOn));
    glowKey.style("display", heatOn ? null : "none");
    gsap.to(heatEl, { opacity: heatOn ? 1 : 0, duration: dur(0.6) });
  });
  controls.append(h("div", { class: "row" }, playBtn, h("span", { class: "control" }, h("span", null, "Season"), out), heatBtn));
  // Strip, output and court follow the season. duration: the morph's length (null = the default glide)
  function goTo(season, duration = null) {
    explore.season = season;
    strip.set(season, dur(duration ?? 0));
    out.textContent = fmtSeason(season);
    showCourt(season, explore.highlight, { duration, readout: true });
  }
  strip.set(explore.season);
  out.textContent = fmtSeason(explore.season);
  // Play runs every season in order, with shorter morphs so each year settles before the next
  let timer = null;
  function stop() {
    timer?.stop();
    timer = null;
    playBtn.textContent = "▶ Play";
  }
  playBtn.addEventListener("click", () => {
    if (timer) { stop(); return; }
    if (explore.season === last) goTo(seasons[0], 0.9);
    playBtn.textContent = "❚❚ Pause";
    timer = d3.interval(() => {
      goTo(seasons[seasons.indexOf(explore.season) + 1], 0.9);
      if (explore.season === last) stop();
    }, 1100);
  });
  const chipSel = d3.select(chips).selectAll("button")
    .data([["all", "All"], ["two", "Twos"], ["three", "Threes"], ["mid", "Mid-range"]]).join("button")
    .attr("class", "chip").attr("type", "button").text((d) => d[1])
    .on("click", (_, d) => {
      explore.highlight = d[0];
      chipSel.attr("aria-pressed", (c) => String(c[0] === explore.highlight));
      showCourt(explore.season, explore.highlight, { readout: true });
    });
  chipSel.attr("aria-pressed", (c) => String(c[0] === explore.highlight));

  const legend = d3.select("#q2-legend").selectAll("span")
    .data([["two", "Two-pointer"], ["three", "Three-pointer"], [null, "Bright = made"], [null, "Glow = every attempt"]])
    .join("span").each(function ([cls, text]) {
      if (cls) this.appendChild(key(cls));
      this.appendChild(document.createTextNode(text));
    });
  const glowKey = legend.filter((_, i) => i === 3).style("display", "none");   // shown with the heat map

  fit();
  showCourt(first, "all", { animate: false });
  const story = setupSteps(document.getElementById("q2-steps"), steps, (i) => { stop(); actions[i](); });
  new ResizeObserver(() => {
    fit();
    const { season, highlight, view, readout } = state;
    if (view === "columns") showColumns(season); else showCourt(season, highlight, { animate: false, readout });
  }).observe(area);

  return { stepEl: (i) => story.els[i] };
}
