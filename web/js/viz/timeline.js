// 1st quarter (sketch QF1): scrolling runs the clock from 1979-80 to today. The line draws itself, a
// scoreboard reads out the season, and rule changes pop up as the line passes them. Switching the
// metric morphs the line; hovering reads any season the clock has reached.
import { season as fmtSeason } from "../data.js";
import { dur } from "../motion.js";
import { segmented } from "../ui/controls.js";
import { showTip, hideTip } from "../ui/tooltip.js";

const METRICS = [
  { key: "fg3a_pg", label: "Attempts", title: "3-point attempts per team-game", fmt: d3.format(".1f"), axis: d3.format("d"), zero: true, color: "var(--three)" },
  { key: "fg3a_rate", label: "Share of shots", title: "Share of shots that are threes", fmt: d3.format(".1%"), axis: d3.format(".0%"), zero: true, color: "var(--three)" },
  { key: "fg3_pct", label: "Accuracy", title: "3-point percentage", fmt: d3.format(".1%"), axis: d3.format(".0%"), zero: false, color: "var(--acc)" },
  { key: "fg3m_pg", label: "Makes", title: "3-pointers made per team-game", fmt: d3.format(".1f"), axis: d3.format("d"), zero: true, color: "var(--three)" },
];
const BOARD = [["season", "Season"], ["fg3a_pg", "3PA / game"], ["fg3a_rate", "3PT share"], ["fg3_pct", "3P%"], ["fg3m_pg", "3PM / game"]];
const SHORT_LINE = [1994, 1996];   // seasons with the 22 ft arc
const HOLD = [0.06, 0.9];          // scroll progress where the clock starts and stops

export function initTimeline(data) {
  const league = data.league;
  const seasons = league.map((d) => d.season);
  const first = seasons[0];
  const last = seasons[seasons.length - 1];
  const bySeason = new Map(league.map((d) => [d.season, d]));
  const events = data.events.map((e, i) => ({ ...e, n: i + 1 }));
  const chartEl = document.getElementById("q1-chart");
  const seasonBg = document.getElementById("q1-season");
  let metric = METRICS[0];
  let current = first;       // fractional season the clock has reached
  let shown = "";            // which events are in the stack
  let refs = null;

  segmented(document.getElementById("q1-metric"), METRICS.map((m) => ({ value: m.key, label: m.label })), metric.key,
    (k) => { const prev = metric; metric = METRICS.find((m) => m.key === k); morph(prev); }, "Timeline metric");
  document.getElementById("q1-note").textContent =
    "3-point attempts were not logged for every game before 1985-86, so attempts, share and accuracy start there.";

  const cells = d3.select("#q1-board").selectAll("div").data(BOARD).join("div")
    .attr("class", (d) => `cell${d[0] === "season" ? " wide" : ""}`);
  cells.append("span").attr("class", "lbl").text((d) => d[1]);
  cells.append("span").attr("class", "led");

  const yScale = (m, ih) => {
    const vals = league.map((d) => d[m.key]).filter((v) => v != null);
    const dom = m.zero ? [0, d3.max(vals) * 1.1] : [d3.min(vals) - 0.03, d3.max(vals) + 0.02];
    return d3.scaleLinear().domain(dom).nice().range([ih, 0]);
  };
  const lineOf = (m, y) => d3.line().defined((d) => d[m.key] != null).x((d) => refs.x(d.season)).y((d) => y(d[m.key]));
  const areaOf = (m, y) => d3.area().defined((d) => d[m.key] != null).x((d) => refs.x(d.season)).y0(y(0)).y1((d) => y(d[m.key]));

  function draw() {
    const w = chartEl.clientWidth;
    const h = chartEl.clientHeight;
    if (!w || !h) return;
    // Event markers: a second row where neighbours would touch (2014-15 and 2015-16)
    const lastX = [-Infinity, -Infinity];
    const x0 = d3.scaleLinear().domain([first - 0.5, last + 0.5]).range([0, w - 64]);
    for (const e of events) {
      e.row = x0(e.season) - lastX[0] < 22 ? 1 : 0;
      lastX[e.row] = x0(e.season);
    }
    const m = { top: 40 + d3.max(events, (e) => e.row) * 22, right: 18, bottom: 30, left: 46 };
    const iw = w - m.left - m.right;
    const ih = h - m.top - m.bottom;
    const x = d3.scaleLinear().domain([first - 0.5, last + 0.5]).range([0, iw]);
    d3.select(chartEl).selectAll("svg").remove();
    const svg = d3.select(chartEl).append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const defs = svg.append("defs");
    const clip = defs.append("clipPath").attr("id", "q1-clip").append("rect").attr("x", -12).attr("y", -m.top).attr("height", h);
    const grad = defs.append("linearGradient").attr("id", "q1-wash").attr("x1", 0).attr("x2", 0).attr("y1", 0).attr("y2", 1);
    grad.append("stop").attr("offset", "0%").attr("stop-color", "#ec5e22").attr("stop-opacity", 0.3);
    grad.append("stop").attr("offset", "100%").attr("stop-color", "#ec5e22").attr("stop-opacity", 0);
    defs.append("filter").attr("id", "q1-glow").attr("x", "-10%").attr("y", "-30%").attr("width", "120%").attr("height", "160%")
      .append("feGaussianBlur").attr("stdDeviation", 6);
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    g.append("rect").attr("x", x(SHORT_LINE[0] - 0.5)).attr("width", x(SHORT_LINE[1] + 0.5) - x(SHORT_LINE[0] - 0.5))
      .attr("height", ih).style("fill", "rgba(242,238,230,0.045)");
    g.append("text").attr("x", x((SHORT_LINE[0] + SHORT_LINE[1]) / 2)).attr("y", ih - 8).attr("text-anchor", "middle")
      .style("font", "600 9px var(--mono)").style("letter-spacing", "0.1em").style("fill", "var(--muted)").text("22 FT LINE");
    const grid = g.append("g").attr("class", "grid");
    const yAxis = g.append("g").attr("class", "axis");
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`)
      .call(d3.axisBottom(x).tickValues(d3.range(1980, last + 1, w < 640 ? 10 : 5)).tickFormat(fmtSeason).tickSizeOuter(0));

    const ticks = g.append("g").selectAll("g").data(events).join("g").attr("transform", (e) => `translate(${x(e.season)},0)`);
    ticks.append("line").attr("class", "event-tick").attr("y1", (e) => -16 - e.row * 22).attr("y2", ih);
    ticks.append("circle").attr("cy", (e) => -24 - e.row * 22).attr("r", 9).style("fill", "var(--bg)").style("stroke", "rgba(242,238,230,0.3)");
    ticks.append("text").attr("y", (e) => -24 - e.row * 22).attr("dy", "0.35em").attr("text-anchor", "middle")
      .style("font", "700 10px var(--mono)").style("fill", "var(--ink-2)").text((e) => e.n);

    const area = g.append("path").attr("clip-path", "url(#q1-clip)").style("fill", "url(#q1-wash)");
    const glow = g.append("path").attr("clip-path", "url(#q1-clip)").attr("filter", "url(#q1-glow)")
      .style("fill", "none").style("stroke-width", 5).style("opacity", 0.75);
    const path = g.append("path").attr("clip-path", "url(#q1-clip)")
      .style("fill", "none").style("stroke-width", 2.5).style("stroke-linejoin", "round").style("stroke-linecap", "round");
    const nowLine = g.append("line").attr("y1", -8).attr("y2", ih).style("stroke", "rgba(242,238,230,0.3)");
    const nowDot = g.append("circle").attr("class", "now-dot").attr("r", 6);
    const cross = g.append("line").attr("y1", 0).attr("y2", ih).style("stroke", "var(--ink-2)").style("display", "none");
    g.append("rect").attr("width", iw).attr("height", ih).style("fill", "transparent")
      .on("pointermove", (event) => hover(event)).on("pointerleave", () => { cross.style("display", "none"); hideTip(); });

    refs = { x, y: yScale(metric, ih), iw, ih, clip, grid, yAxis, ticks, area, glow, path, nowLine, nowDot, cross };
    paint();
    setSeason(current, true);
  }

  function paintAxes(y, t) {
    const { grid, yAxis, iw } = refs;
    (t ? grid.transition(t) : grid).call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat(""));
    (t ? yAxis.transition(t) : yAxis).call(d3.axisLeft(y).ticks(5).tickFormat(metric.axis).tickSize(0).tickPadding(10));
    yAxis.select(".domain").remove();
  }

  function paint() {
    const { y, area, glow, path } = refs;
    paintAxes(y);
    path.attr("d", lineOf(metric, y)(league)).style("stroke", metric.color);
    glow.attr("d", lineOf(metric, y)(league)).style("stroke", metric.color);
    area.attr("d", metric.zero ? areaOf(metric, y)(league) : null);
  }

  // Morph the line from one metric to another: each season's point slides between the two scales.
  function morph(prev) {
    if (!refs) return;
    const oldY = refs.y;
    const newY = yScale(metric, refs.ih);
    refs.y = newY;
    const t = d3.transition().duration(dur(0.9) * 1000).ease(d3.easeCubicInOut);
    paintAxes(newY, t);
    const pts = league.map((d) => ({ season: d.season, a: d[prev.key], b: d[metric.key] }));
    const at = (p, k) => {
      const ya = p.a != null ? oldY(p.a) : newY(p.b ?? 0);
      const yb = p.b != null ? newY(p.b) : ya;
      return ya + (yb - ya) * k;
    };
    const lineAt = (k) => d3.line().defined((p) => (k < 0.5 ? p.a : p.b) != null).x((p) => refs.x(p.season)).y((p) => at(p, k))(pts);
    for (const sel of [refs.path, refs.glow]) {
      sel.transition(t).style("stroke", metric.color).attrTween("d", () => lineAt);
    }
    const areaTr = refs.area.transition(t).style("opacity", metric.zero ? 1 : 0);
    if (metric.zero || prev.zero) {
      areaTr.attrTween("d", () => (k) => d3.area().defined((p) => (k < 0.5 ? p.a : p.b) != null)
        .x((p) => refs.x(p.season)).y0(newY.range()[0]).y1((p) => at(p, k))(pts));
    }
    t.on("end", () => setSeason(current, true));
    setSeason(current, true);
  }

  function setSeason(sf, force = false) {
    current = sf;
    if (!refs) return;
    const { x, y, clip, nowLine, nowDot, ticks } = refs;
    clip.attr("width", Math.max(0, x(sf) + 12));
    const lo = Math.floor(sf);
    const hi = Math.min(last, lo + 1);
    const a = bySeason.get(lo)?.[metric.key];
    const c = bySeason.get(hi)?.[metric.key];
    const v = a != null && c != null ? a + (c - a) * (sf - lo) : a;
    nowLine.attr("x1", x(sf)).attr("x2", x(sf));
    nowDot.style("display", v == null ? "none" : null).attr("cx", x(sf)).attr("cy", v == null ? 0 : y(v));
    ticks.select("line").classed("passed", (e) => e.season <= sf);
    ticks.select("circle").style("fill", (e) => (e.season <= sf ? (e.kind === "rule" ? "var(--ink)" : "var(--three)") : "var(--bg)"));
    ticks.select("text").style("fill", (e) => (e.season <= sf ? "var(--bg)" : "var(--ink-2)"));

    const row = bySeason.get(Math.min(last, lo));
    seasonBg.textContent = fmtSeason(row.season);
    cells.select(".led").each(function ([k]) {
      const mm = METRICS.find((q) => q.key === k);
      const val = k === "season" ? fmtSeason(row.season) : row[k] == null ? "--.-" : mm.fmt(row[k]);
      if (this.textContent !== val) this.textContent = val;
      this.classList.toggle("off", k !== "season" && row[k] == null);
    });
    const passed = events.filter((e) => e.season <= sf);
    const signature = passed.map((e) => e.n).join(",");
    if (signature !== shown || force) { shown = signature; stack(passed); }
  }

  // Newest three events, newest on top; a new one slides in from the right.
  function stack(passed) {
    const recent = passed.slice(-3).reverse();
    d3.select("#q1-events").selectAll("li").data(recent, (e) => e.n).join(
      (enter) => {
        const li = enter.append("li").attr("class", (e) => `event ${e.kind}`);
        li.append("span").attr("class", "when").text((e) => `${e.n} · ${fmtSeason(e.season)} · ${e.kind}`);
        li.append("h4").text((e) => e.label);
        li.append("p").text((e) => e.detail);
        li.each(function () { gsap.from(this, { x: 60, opacity: 0, duration: dur(0.7), ease: "expo.out" }); });
        return li;
      },
      (update) => update,
      (exit) => exit.remove(),
    ).classed("old", (_, i) => i > 0).order();
  }

  function hover(event) {
    const { x, cross } = refs;
    const reached = Math.min(last, Math.floor(current));
    const s = Math.max(first, Math.min(reached, Math.round(x.invert(d3.pointer(event)[0]))));
    const d = bySeason.get(s);
    cross.style("display", null).attr("x1", x(s)).attr("x2", x(s));
    const ev = events.find((e) => e.season === s);
    showTip(event, {
      title: fmtSeason(s),
      rows: METRICS.map((mm) => ({
        value: d[mm.key] == null ? "n/a" : mm.fmt(d[mm.key]), label: mm.title, color: mm === metric ? mm.color : null,
      })),
      note: [d.shortened ? `Shortened season (${d.shortened})` : null, ev ? `${ev.n}. ${ev.label}` : null].filter(Boolean).join(" · ") || null,
    });
  }

  const trigger = ScrollTrigger.create({
    trigger: "#q1-scrub", start: "top top", end: "bottom bottom",
    onUpdate: (self) => {
      const p = Math.min(1, Math.max(0, (self.progress - HOLD[0]) / (HOLD[1] - HOLD[0])));
      setSeason(first + p * (last - first));
    },
  });
  new ResizeObserver(draw).observe(chartEl);
  draw();

  return { trigger };
}
