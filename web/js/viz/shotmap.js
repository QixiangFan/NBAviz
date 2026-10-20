// 2nd quarter (sketches ZD8 / QF7): real shots as glowing dots on a flat court. Scroll steps carry the
// dots from one season's spots to another's (each dot moves outward along the floor, not across it),
// then stack them into one column per zone to show what each zone returns. DRAFT.
import { sampleShots, migrationOrder, ZONES, ZONE_NAMES, season as fmtSeason, STANDARD_LINE } from "../data.js";
import { ParticleField } from "./particles.js";
import { fitCourt, drawCourt } from "./court.js";
import { SHOT_STYLES, shotStyle } from "./hero.js";
import { dur } from "../motion.js";
import { setupSteps, h, b, key } from "./steps.js";
import { slider } from "../ui/controls.js";

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
  const overlay = d3.select("#q2-overlay");
  const field = new ParticleField(document.getElementById("q2-canvas"), n);
  field.setStyles(STYLES);

  const cache = new Map();
  const sample = (s) => {
    if (!cache.has(s)) cache.set(s, sampleShots(data.gridBySeason.get(s), n, 1000 + s));
    return cache.get(s);
  };
  const zoneStat = (s, z) => data.zoneShare(s, z);
  const threeShare = (s) => zoneStat(s, "C3").share + zoneStat(s, "AB3").share;
  // Middle step: the first season with more threes than mid-range jumpers
  const crossover = seasons.find((s) => s > first && threeShare(s) > zoneStat(s, "MID").share);
  const mid = crossover && crossover < last ? crossover : null;

  // Which sampled shot each particle shows, and where that shot is in feet (for pairing seasons)
  const assign = new Int32Array(n);
  const feetX = new Float32Array(n);
  const feetY = new Float32Array(n);
  let court = null;
  let state = { season: null, highlight: "all", view: "court" };

  function fit() {
    court = fitCourt(area.clientWidth, area.clientHeight);
    drawCourt(linesEl, court, { shortLine: (state.season ?? last) < STANDARD_LINE });
    overlay.attr("width", court.w).attr("height", court.h);
    field.resize(court.w, court.h);
  }

  function pair(season) {
    const sm = sample(season);
    const target = migrationOrder(sm.x, sm.y, n);
    if (state.season == null) target.forEach((q, k) => { assign[k] = q; });
    else migrationOrder(feetX, feetY, n).forEach((p, k) => { assign[p] = target[k]; });
    for (let i = 0; i < n; i++) { feetX[i] = sm.x[assign[i]]; feetY[i] = sm.y[assign[i]]; }
  }

  function showCourt(season, highlight, { animate = true, duration = null } = {}) {
    const sm = sample(season);
    const moved = season !== state.season;
    if (moved) pair(season);
    const lineStyle = (season < STANDARD_LINE) !== ((state.season ?? last) < STANDARD_LINE);
    state = { season, highlight, view: "court" };
    if (lineStyle) drawCourt(linesEl, court, { shortLine: season < STANDARD_LINE });
    const test = HIGHLIGHT[highlight];
    const tx = Float32Array.from(feetX, (v) => court.x(v));
    const ty = Float32Array.from(feetY, (v) => court.y(v));
    const st = Uint8Array.from({ length: n }, (_, i) => {
      const q = assign[i];
      return test(sm.zone[q]) ? shotStyle(sm.zone[q], sm.made[q]) : DIM;
    });
    gsap.to(linesEl, { opacity: 1, duration: dur(0.6) });
    labels(null);
    stamp(season, highlight);
    return field.morph(tx, ty, st, {
      duration: animate ? dur(duration ?? (moved ? 2.2 : 0.7)) : 0, spread: moved ? 0.55 : 0.25, ease: "power3.inOut",
    });
  }

  function showColumns(season) {
    const sm = sample(season);
    if (season !== state.season) pair(season);
    state = { season, highlight: "all", view: "columns" };
    const groups = ZONES.map(() => []);
    for (let i = 0; i < n; i++) groups[sm.zone[assign[i]]].push(i);
    groups.forEach((g) => g.sort((a, c) => sm.made[assign[c]] - sm.made[assign[a]]));  // makes at the bottom
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
        st[i] = shotStyle(z, sm.made[assign[i]]);
      });
      tops.push({ z, cx, top: base - Math.ceil(g.length / perRow) * d });
    });
    gsap.to(linesEl, { opacity: 0.12, duration: dur(0.6) });
    stamp(season, "columns");
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
      h("p", null, `Drag through ${seasons.length} seasons of shot charts, ${fmtSeason(seasons[0])} to ${fmtSeason(last)}, or press play, and filter by shot type.`),
      seasons[0] < STANDARD_LINE && h("p", null, `In ${fmtSeason(seasons[0])} the arc was 22 ft all the way around. Watch it move back out.`),
      controls] },
  ].filter(Boolean);
  const actions = [
    () => showCourt(first, "all"),
    () => showCourt(first, "mid"),
    ...(mid ? [() => showCourt(mid, "three")] : []),
    () => showCourt(last, "three"),
    () => showColumns(last),
    () => showCourt(explore.season, explore.highlight),
  ];

  const row = h("div", { class: "row" });
  controls.append(row);
  const seasonSlider = slider(row, "Season", seasons, explore.season, fmtSeason, (v) => {
    stop();
    explore.season = v;
    showCourt(explore.season, explore.highlight);
  });
  seasonSlider.input.style("width", "150px");
  // Play runs every season in order, with shorter morphs so each year settles before the next
  let timer = null;
  const playBtn = h("button", { class: "btn primary", type: "button" }, "▶ Play");
  row.append(playBtn);
  function stop() {
    timer?.stop();
    timer = null;
    playBtn.textContent = "▶ Play";
  }
  playBtn.addEventListener("click", () => {
    if (timer) { stop(); return; }
    const show = () => {
      seasonSlider.set(explore.season);
      showCourt(explore.season, explore.highlight, { duration: 0.9 });
    };
    if (explore.season === last) { explore.season = seasons[0]; show(); }
    playBtn.textContent = "❚❚ Pause";
    timer = d3.interval(() => {
      explore.season = seasons[seasons.indexOf(explore.season) + 1];
      show();
      if (explore.season === last) stop();
    }, 1100);
  });
  const chipSel = d3.select(chips).selectAll("button")
    .data([["all", "All"], ["two", "Twos"], ["three", "Threes"], ["mid", "Mid-range"]]).join("button")
    .attr("class", "chip").attr("type", "button").text((d) => d[1])
    .on("click", (_, d) => {
      explore.highlight = d[0];
      chipSel.attr("aria-pressed", (c) => String(c[0] === explore.highlight));
      showCourt(explore.season, explore.highlight);
    });
  chipSel.attr("aria-pressed", (c) => String(c[0] === explore.highlight));

  d3.select("#q2-legend").selectAll("span").data([["two", "Two-pointer"], ["three", "Three-pointer"], [null, "Bright = made"]])
    .join("span").each(function ([cls, text]) {
      if (cls) this.appendChild(key(cls));
      this.appendChild(document.createTextNode(text));
    });

  fit();
  showCourt(first, "all", { animate: false });
  const story = setupSteps(document.getElementById("q2-steps"), steps, (i) => { stop(); actions[i](); });
  new ResizeObserver(() => {
    fit();
    const { season, highlight, view } = state;
    state = { ...state, season: null };          // re-pair from scratch at the new size
    if (view === "columns") showColumns(season); else showCourt(season, highlight, { animate: false });
  }).observe(area);

  return { stepEl: (i) => story.els[i] };
}
