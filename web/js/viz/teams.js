// 3rd quarter, the main message (sketches QF8 / KN7 / JB2 / JB4 / JB6). Each team is a ball with its logo.
// Scroll steps move the same balls from volume to accuracy to efficiency, zoom out to every season
// (correlation lines), then sort every team-season into four groups. The last step hands over the controls.
import { season as fmtSeason } from "../data.js";
import { dur, instant } from "../motion.js";
import { setupSteps, h, b } from "./steps.js";
import { segmented, slider } from "../ui/controls.js";
import { showTip, hideTip } from "../ui/tooltip.js";

export const METRICS = [
  { key: "fg3a_rate", name: "3PA rate", label: "Volume", long: "share of shots that are threes", color: "#ec5e22" },
  { key: "fg3_pct", name: "3P%", label: "Accuracy", long: "3-point percentage", color: "#16ab85" },
  { key: "efg", name: "eFG%", label: "Efficiency", long: "effective field-goal %", color: "#3d8ff0" },
];
const [VOL, ACC, EFF] = METRICS;
const X_MAX = 3.6;           // |z| of the most extreme team-season is about 3.5
const pct = d3.format(".1%");
const pct0 = d3.format(".0%");
const r2 = (v) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(2);
const ordinalLow = (k) => (k === 1 ? "lowest" : `${["", "", "second", "third", "fourth", "fifth"][k] || `${k}th`}-lowest`);
const seamPath = (r) => `M${-r},0H${r}M0,${-r}V${r}`
  + `M${-r * 0.72},${-r * 0.69}C${-r * 0.22},${-r * 0.3} ${-r * 0.22},${r * 0.3} ${-r * 0.72},${r * 0.69}`
  + `M${r * 0.72},${-r * 0.69}C${r * 0.22},${-r * 0.3} ${r * 0.22},${r * 0.3} ${r * 0.72},${r * 0.69}`;

export function initTeams(data) {
  const teams = data.teams;
  const seasons = [...new Set(teams.map((d) => d.season))].sort(d3.ascending);
  const last = seasons[seasons.length - 1];
  const rOf = (s, metric) => data.corr.find((d) => d.first_season === s && d.last_season === s && d.metric === metric)?.r;
  const rEra = (f, l, metric) => data.corr.find((d) => d.first_season === f && d.last_season === l && d.metric === metric)?.r;
  const quads = data.quads.filter((d) => d.period === `${fmtSeason(seasons[0])} to ${fmtSeason(last)}`);
  const quad = (volume, accuracy) => quads.find((d) => d.volume === volume && d.accuracy === accuracy);
  const rowsOf = (s) => teams.filter((d) => d.season === s);

  // Story numbers, all from the data
  const now = rowsOf(last);
  const most = d3.greatest(now, (d) => d.fg3a_rate);
  const counter = d3.greatest(now.filter((d) => d.fg3a_rate_z < 0), (d) => d.win_pct);
  const lowRank = now.filter((d) => d.fg3a_rate <= counter.fg3a_rate).length;
  const peak = d3.greatest(seasons, (s) => rOf(s, VOL.key));

  // Logos: a team whose logo fails to load (e.g. offline) falls back to its abbreviation
  const failed = new Set();
  const logoOf = (d) => { const url = data.logo(d); return url && !failed.has(url) ? url : null; };
  now.forEach((d) => { if (logoOf(d)) new Image().src = logoOf(d); });   // fetch during the loader

  // --- SVG scaffold --------------------------------------------------------------------------
  const area = document.getElementById("q3-viz");
  const svg = d3.select("#q3-svg");
  const root = svg.append("g");
  const gGrid = root.append("g").attr("class", "grid");
  const gX = root.append("g").attr("class", "axis");
  const gY = root.append("g").attr("class", "axis");
  const xTitle = root.append("text").attr("text-anchor", "middle");
  const yTitle = root.append("text").attr("text-anchor", "middle");
  const gRef = root.append("g");
  const fitLine = root.append("line").style("stroke-width", 2.5).style("stroke-linecap", "round").style("opacity", 0);
  const gCorr = root.append("g").style("opacity", 0);
  const gQuads = root.append("g").style("opacity", 0);
  const gBalls = root.append("g");
  const gAnnot = root.append("g").attr("class", "annot");
  const hit = root.append("rect").style("fill", "transparent");
  const meter = document.getElementById("q3-r");
  const meterValue = document.getElementById("q3-r-value");
  const meterCaption = document.getElementById("q3-r-caption");
  const meterState = { v: 0 };

  let W, H, iw, ih, R;
  let current = null;           // the state currently on screen
  let dropped = false;          // the balls have made their entrance

  function size() {
    W = area.clientWidth;
    H = area.clientHeight;
    const narrow = W < 600;
    const m = { top: 24, right: narrow ? 70 : 96, bottom: 64, left: narrow ? 48 : 60 };
    iw = W - m.left - m.right;
    ih = H - m.top - m.bottom;
    R = Math.max(10, Math.min(17, iw / 54));
    svg.attr("viewBox", `0 0 ${W} ${H}`);
    root.attr("transform", `translate(${m.left},${m.top})`);
    hit.attr("width", iw).attr("height", ih);
  }
  const xz = () => d3.scaleLinear().domain([-X_MAX, X_MAX]).range([0, iw]);
  const yw = () => d3.scaleLinear().domain([0, 1]).range([ih, 0]);
  const xt = () => d3.scaleLinear().domain([seasons[0], last]).range([0, iw]);
  const yr = () => d3.scaleLinear().domain([-0.2, 1]).range([ih, 0]);

  // --- Axes per view ---------------------------------------------------------------------------
  function axes(view, metric, t) {
    const show = view !== "quads";
    for (const sel of [gGrid, gX, gY, xTitle, yTitle, gRef]) sel.transition(t).style("opacity", show ? 1 : 0);
    if (!show) return;
    if (view === "scatter") {
      const x = xz();
      const y = yw();
      gGrid.transition(t).call(d3.axisLeft(y).ticks(4).tickSize(-iw).tickFormat(""));
      gY.transition(t).call(d3.axisLeft(y).ticks(4).tickFormat(pct0).tickSize(0).tickPadding(10));
      gX.attr("transform", `translate(0,${ih})`).transition(t)
        .call(d3.axisBottom(x).tickValues(iw < 460 ? [-2, 0, 2] : [-3, -2, -1, 0, 1, 2, 3]).tickSizeOuter(0)
          .tickFormat((v) => (v === 0 ? "league avg" : `${v > 0 ? "+" : "−"}${Math.abs(v)} SD`)));
      xTitle.attr("x", iw / 2).attr("y", ih + 48).text(iw < 460
        ? `${metric.label} (${metric.name}) vs. league avg →`
        : `${metric.label}: ${metric.long}, vs. that season’s league average →`);
      yTitle.attr("transform", `translate(-44,${ih / 2}) rotate(-90)`).text("Win %");
      gRef.selectAll("line").data([[x(0), x(0), 0, ih], [0, iw, y(0.5), y(0.5)]]).join("line")
        .attr("x1", (d) => d[0]).attr("x2", (d) => d[1]).attr("y1", (d) => d[2]).attr("y2", (d) => d[3])
        .style("stroke", "rgba(242,238,230,0.18)");
    } else {
      const x = xt();
      const y = yr();
      gGrid.transition(t).call(d3.axisLeft(y).ticks(6).tickSize(-iw).tickFormat(""));
      gY.transition(t).call(d3.axisLeft(y).ticks(6).tickFormat(r2).tickSize(0).tickPadding(10));
      gX.attr("transform", `translate(0,${ih})`).transition(t)
        .call(d3.axisBottom(x).tickValues(d3.range(1985, last + 1, iw < 560 ? 10 : 5)).tickFormat(fmtSeason).tickSizeOuter(0));
      xTitle.attr("x", iw / 2).attr("y", ih + 48).text("Season");
      yTitle.attr("transform", `translate(-44,${ih / 2}) rotate(-90)`).text("Correlation with win % (r)");
      gRef.selectAll("line").data([[0, iw, y(0), y(0)]]).join("line")
        .attr("x1", (d) => d[0]).attr("x2", (d) => d[1]).attr("y1", (d) => d[2]).attr("y2", (d) => d[3])
        .style("stroke", "rgba(242,238,230,0.3)");
    }
    gX.select(".domain").style("stroke", "var(--court)");
    gY.select(".domain").remove();
  }

  // --- Scatter of one season -----------------------------------------------------------------------
  function scatter(st, t) {
    const x = xz();
    const y = yw();
    const rows = rowsOf(st.season);
    const X = (d) => x(Math.max(-X_MAX, Math.min(X_MAX, d[`${st.metric.key}_z`])));
    const Y = (d) => y(d.win_pct);
    const drop = st.drop && !dropped && !instant;
    gBalls.transition(t).style("opacity", 1);
    const balls = gBalls.selectAll("g.ball").data(rows, (d) => d.team_id).join(
      (enter) => {
        const g = enter.append("g").attr("class", "ball")
          .attr("transform", (d) => `translate(${X(d)},${drop ? -R * 3 - Math.random() * ih * 0.4 : Y(d)}) scale(${drop ? 1 : 0.001})`);
        g.append("circle").attr("class", "leather");
        g.append("path").attr("class", "seam");
        g.append("image").attr("class", "logo").on("error", function () {
          failed.add(this.getAttribute("href"));
          d3.select(this.parentNode).classed("has-logo", false);
        });
        g.append("text");
        return g;
      },
      (update) => update,
      (exit) => exit.transition(t).attr("transform", function () {
        return `${d3.select(this).attr("transform").replace(/scale\([^)]*\)/, "")} scale(0.001)`;
      }).remove(),
    );
    balls.select("circle").attr("r", R);
    balls.select("path").attr("d", seamPath(R));
    balls.select("text").text((d) => d.team);
    balls.select("image").attr("x", -R * 0.78).attr("y", -R * 0.78).attr("width", R * 1.56).attr("height", R * 1.56)
      .attr("href", logoOf);
    balls.classed("has-logo", (d) => !!logoOf(d));
    balls.classed("hot", (d) => st.highlight && d === most)
      .classed("cold", (d) => st.highlight && d === counter)
      .classed("dim", (d) => st.highlight && d !== most && d !== counter);
    if (drop) {
      dropped = true;
      balls.transition().duration(1300).delay((_, i) => 120 + i * 35).ease(d3.easeBounceOut)
        .attr("transform", (d) => `translate(${X(d)},${Y(d)}) scale(1)`);
    } else {
      balls.transition(t).delay((_, i) => (instant ? 0 : i * 14))
        .attr("transform", (d) => `translate(${X(d)},${Y(d)}) scale(1)`);
    }

    // Least-squares fit across the visible spread, and the r readout
    const pts = rows.map((d) => [d[`${st.metric.key}_z`], d.win_pct]);
    const mx = d3.mean(pts, (p) => p[0]);
    const my = d3.mean(pts, (p) => p[1]);
    const slope = d3.sum(pts, (p) => (p[0] - mx) * (p[1] - my)) / d3.sum(pts, (p) => (p[0] - mx) ** 2);
    const [x0, x1] = d3.extent(pts, (p) => p[0]);
    fitLine.style("stroke", st.metric.color).transition(t)
      .attr("x1", x(x0)).attr("x2", x(x1))
      .attr("y1", y(my + slope * (x0 - mx))).attr("y2", y(my + slope * (x1 - mx)))
      .style("opacity", st.fit ? 0.95 : 0);
    setMeter(st.fit ? rOf(st.season, st.metric.key) : null, st);

    // Annotations for the two teams the story names
    const notes = st.annot ? [
      { d: most, lines: [most.team_name, `${pct(most.fg3a_rate)} of shots were threes · won ${pct0(most.win_pct)}`] },
      { d: counter, lines: [counter.team_name, `${ordinalLow(lowRank)} 3-point rate · ${counter.wins} wins`] },
    ] : [];
    const ann = gAnnot.selectAll("g.note").data(notes, (n) => n.d.team_id).join(
      (enter) => enter.append("g").attr("class", "note").style("opacity", 0),
      (update) => update,
      (exit) => exit.transition(t).style("opacity", 0).remove(),
    );
    ann.each(function (n) {
      const right = X(n.d) < iw * 0.62;
      const g = d3.select(this).attr("transform", `translate(${X(n.d) + (right ? R + 12 : -R - 12)},${Y(n.d)})`);
      g.selectAll("text").data(n.lines).join("text")
        .attr("class", (_, i) => (i ? "sub" : null)).attr("dy", (_, i) => (i ? "1.25em" : "-0.15em"))
        .attr("text-anchor", right ? "start" : "end").text((l) => l);
    });
    ann.transition(t).delay(instant ? 0 : 500).style("opacity", 1);

    // Nearest-ball hover
    const delaunay = d3.Delaunay.from(rows, X, Y);
    hit.style("pointer-events", "all").on("pointermove", (event) => {
      const [px, py] = d3.pointer(event);
      const d = rows[delaunay.find(px, py)];
      if (!d || Math.hypot(X(d) - px, Y(d) - py) > 36) { hideTip(); return; }
      showTip(event, {
        title: `${d.team_name} · ${fmtSeason(d.season)}`,
        logo: logoOf(d),
        rows: [
          { value: pct(d.win_pct), label: `win % (${d.wins}-${d.games - d.wins})` },
          ...METRICS.map((mm) => ({
            value: pct(d[mm.key]), label: `${mm.name} (${d[`${mm.key}_z`] >= 0 ? "+" : "−"}${Math.abs(d[`${mm.key}_z`]).toFixed(1)} SD)`,
            color: mm === st.metric ? mm.color : null,
          })),
        ],
      });
    }).on("pointerleave", hideTip);
  }

  function setMeter(r, st) {
    meter.classList.toggle("show", r != null);
    if (r == null) return;
    meterCaption.textContent = `${st.metric.label} (${st.metric.name}) vs. win % · ${fmtSeason(st.season)}`;
    meterValue.style.color = st.metric.color;
    meterValue.style.textShadow = `0 0 22px ${st.metric.color}`;
    gsap.to(meterState, { v: r, duration: dur(1.1), ease: "power2.out", onUpdate: () => { meterValue.textContent = r2(meterState.v); } });
  }

  // --- Every season: correlation lines -------------------------------------------------------------
  function history(t, animate) {
    const x = xt();
    const y = yr();
    const line = d3.line().x((p) => x(p[0])).y((p) => y(p[1]));
    gCorr.transition(t).style("opacity", 1);
    // Thick line: 5-season centred average (the trend). Thin faint line: each season (the noise).
    const series = METRICS.map((mm) => {
      const raw = seasons.map((s) => [s, rOf(s, mm.key)]);
      const smooth = raw.map(([s], i) => [s, d3.mean(raw.slice(Math.max(0, i - 2), i + 3), (p) => p[1])]);
      return { ...mm, raw, smooth };
    });
    gCorr.selectAll("path.raw").data(series, (s) => s.key).join("path").attr("class", "raw")
      .attr("d", (s) => line(s.raw)).style("fill", "none").style("stroke", (s) => s.color)
      .style("stroke-width", 1.2).style("opacity", 0.35);
    const paths = gCorr.selectAll("path.corr").data(series, (s) => s.key).join("path").attr("class", "corr")
      .attr("d", (s) => line(s.smooth)).style("fill", "none").style("stroke", (s) => s.color)
      .style("stroke-width", 3.5).style("stroke-linejoin", "round").style("stroke-linecap", "round");
    if (animate && !instant) {
      paths.each(function (_, i) {
        const len = this.getTotalLength();
        d3.select(this).attr("stroke-dasharray", `${len} ${len}`).attr("stroke-dashoffset", len)
          .transition().delay(300 + i * 450).duration(1600).ease(d3.easeCubicInOut).attr("stroke-dashoffset", 0);
      });
    } else {
      paths.attr("stroke-dasharray", null).attr("stroke-dashoffset", null);
    }
    const ends = series.map((s) => ({ s, v: s.raw[s.raw.length - 1][1], ty: y(s.smooth[s.smooth.length - 1][1]) })).sort((a, c) => a.ty - c.ty);
    for (let i = 1; i < ends.length; i++) ends[i].ty = Math.max(ends[i].ty, ends[i - 1].ty + 16);
    gCorr.selectAll("text.end").data(ends, (e) => e.s.key).join("text").attr("class", "end")
      .attr("x", iw + 8).attr("y", (e) => e.ty).attr("dy", "0.35em").style("fill", "var(--ink)")
      .style("font", "600 12px var(--mono)").text((e) => `${e.s.name} ${r2(e.v)}`);
    gCorr.selectAll("text.key").data([0]).join("text").attr("class", "key").attr("x", 0).attr("y", -6)
      .style("font", "500 11px var(--mono)").style("fill", "var(--ink-2)")
      .text("Thick line: 5-season average · faint line: each season · end labels: latest season");
    const pv = rOf(peak, VOL.key);
    const peakG = gCorr.selectAll("g.peak").data([peak]).join("g").attr("class", "peak annot")
      .attr("transform", `translate(${x(peak)},${y(pv)})`);
    peakG.selectAll("circle").data([0]).join("circle").attr("r", 6).style("fill", "none").style("stroke", VOL.color).style("stroke-width", 2);
    peakG.selectAll("text").data([`Volume’s peak: r = ${r2(pv)}`, fmtSeason(peak)]).join("text")
      .attr("class", (_, i) => (i ? "sub halo" : "halo")).attr("x", 0).attr("y", (_, i) => (i ? 26 : 12))
      .attr("dy", "0.8em").attr("text-anchor", "middle").text((l) => l);
  }

  // --- Every team-season: four groups ---------------------------------------------------------------
  function quadrants(t) {
    const all = teams.filter((d) => d.fg3a_rate_z != null && d.fg3_pct_z != null);
    const blocks = [
      { volume: "low", accuracy: "high", col: 0, row: 0, name: "Fewer threes, more accurate" },
      { volume: "high", accuracy: "high", col: 1, row: 0, name: "More threes, more accurate" },
      { volume: "low", accuracy: "low", col: 0, row: 1, name: "Fewer threes, less accurate" },
      { volume: "high", accuracy: "low", col: 1, row: 1, name: "More threes, less accurate" },
    ];
    const bw = iw / 2;
    const bh = ih / 2;
    const counts = blocks.map((blk) => all.filter((r) => (r.fg3a_rate_z > 0 ? "high" : "low") === blk.volume
      && (r.fg3_pct_z > 0 ? "high" : "low") === blk.accuracy).length);
    let d = 16;   // largest spacing at which the biggest group still fits under its label
    while (d > 4 && Math.ceil(d3.max(counts) / Math.floor((bw - 48) / d)) * d > bh - 116) d -= 0.5;
    const cols = Math.floor((bw - 48) / d);
    const pos = new Map();
    for (const blk of blocks) {
      const members = all.filter((r) => (r.fg3a_rate_z > 0 ? "high" : "low") === blk.volume
        && (r.fg3_pct_z > 0 ? "high" : "low") === blk.accuracy).sort((a, c) => c.win_pct - a.win_pct);
      blk.n = members.length;
      members.forEach((r, i) => pos.set(r, [blk.col * bw + 24 + (i % cols) * d, blk.row * bh + 96 + Math.floor(i / cols) * d]));
    }
    gQuads.transition(t).style("opacity", 1);
    const x = xz();
    const y = yw();
    gQuads.selectAll("circle.dot").data(all, (r) => `${r.season}-${r.team_id}`).join(
      (enter) => enter.append("circle").attr("class", "dot")
        .attr("cx", (r) => x(Math.max(-X_MAX, Math.min(X_MAX, r.fg3a_rate_z)))).attr("cy", (r) => y(r.win_pct)),
    )
      .attr("r", Math.max(1.8, d * 0.36))
      .style("fill", "var(--ink)").style("opacity", (r) => (r.win_pct >= 0.5 ? 0.9 : 0.22))
      .transition(t).delay(() => (instant ? 0 : Math.random() * 700)).duration(instant ? 0 : 1300)
      .attr("cx", (r) => pos.get(r)[0]).attr("cy", (r) => pos.get(r)[1]);
    const labels = gQuads.selectAll("g.qlabel").data(blocks, (blk) => blk.name).join((enter) => {
      const g = enter.append("g").attr("class", "qlabel");
      g.append("text").attr("class", "quad-label");
      g.append("text").attr("class", "quad-value");
      g.append("text").attr("class", "quad-sub");
      return g;
    }).attr("transform", (blk) => `translate(${blk.col * bw + 24},${blk.row * bh + 10})`);
    labels.select(".quad-label").attr("y", 16).text((blk) => blk.name);
    labels.select(".quad-value").attr("y", 58).text((blk) => pct(quad(blk.volume, blk.accuracy).win_pct));
    labels.select(".quad-sub").attr("y", 78).text((blk) => `average win % · ${blk.n} team-seasons`);
    const legend = gQuads.selectAll("g.qkey").data([[0.9, "winning record"], [0.22, "losing record"]]).join((enter) => {
      const g = enter.append("g").attr("class", "qkey");
      g.append("circle").attr("r", 4).style("fill", "var(--ink)");
      g.append("text").attr("x", 10).attr("dy", "0.35em").style("font", "500 11px var(--mono)").style("fill", "var(--ink-2)");
      return g;
    }).attr("transform", (_, i) => `translate(${i * 150},${ih + 28})`);
    legend.select("circle").style("opacity", (k) => k[0]);
    legend.select("text").text((k) => `= ${k[1]}`);
    gQuads.selectAll("line.divider").data([[bw, bw, 0, ih], [0, iw, bh, bh]]).join("line").attr("class", "divider")
      .attr("x1", (q) => q[0]).attr("x2", (q) => q[1]).attr("y1", (q) => q[2]).attr("y2", (q) => q[3])
      .style("stroke", "rgba(242,238,230,0.14)");
  }

  // --- State machine: every step is a full description of what should be on screen ---------------------
  function render(st, { animate = true } = {}) {
    const t = d3.transition().duration(animate && !instant ? 900 : 0).ease(d3.easeCubicInOut);
    const prevView = current?.view;
    current = st;
    axes(st.view, st.metric, t);
    if (st.view !== "scatter") {
      gBalls.transition(t).style("opacity", 0);
      fitLine.transition(t).style("opacity", 0);
      gAnnot.selectAll("g.note").transition(t).style("opacity", 0).remove();
      hit.style("pointer-events", "none");
      setMeter(null, st);
      hideTip();
    }
    if (st.view !== "history") gCorr.transition(t).style("opacity", 0);
    if (st.view !== "quads") gQuads.transition(t).style("opacity", 0);
    if (st.view === "scatter") scatter(st, t);
    if (st.view === "history") history(t, prevView !== "history" && animate);
    if (st.view === "quads") quadrants(t);
  }

  // --- Steps ---------------------------------------------------------------------------------------------
  const explore = { season: last, metric: VOL };
  const base = { view: "scatter", season: last, metric: VOL, highlight: false, annot: false, fit: false };
  const vol = rOf(last, VOL.key);
  const states = [
    { ...base, drop: true },
    { ...base, highlight: true, annot: true },
    { ...base, highlight: true, fit: true },
    { ...base, highlight: true, fit: true, metric: ACC },
    { ...base, highlight: true, fit: true, metric: EFF },
    { ...base, view: "history" },
    { ...base, view: "quads" },
    null,   // explore: built from the controls
  ];
  const nAll = d3.sum(quads, (q) => q.n);
  const controls = h("div", { class: "controls" });
  const steps = [
    { num: "How to read", title: "Thirty teams, one question", body: [
      h("p", null, "Each logo is one team in ", fmtSeason(last), ". Left to right: how much more often than the league average it shot threes. Bottom to top: how often it won."),
      h("p", null, "If more threes meant more wins, the balls would climb from left to right.")] },
    { num: "Step 2", title: "The most three-happy team", body: [
      h("p", null, most.team_name, " took ", b(pct(most.fg3a_rate)), " of its shots from three, the most in the league, and won ", b(pct0(most.win_pct)), " of its games."),
      h("p", null, counter.team_name, " had the ", ordinalLow(lowRank), " 3-point rate and won ", b(String(counter.wins)), " games.")] },
    { num: "Step 3", title: "Volume vs. winning", body: [
      h("p", null, "The best-fit line is nearly flat: ", b(`r = ${r2(vol)}`), ". How many threes a team took told you almost nothing about its record in ", fmtSeason(last), ".")] },
    { num: "Step 4", title: "Now sort by making them", body: [
      h("p", null, "Same teams, new x-axis: 3-point accuracy. The balls slide and the line tilts up: ", b(`r = ${r2(rOf(last, ACC.key))}`), ". Teams that make their threes win more.")] },
    { num: "Step 5", title: "And by every shot", body: [
      h("p", null, "eFG% counts every shot and gives threes 1.5× credit. ", b(`r = ${r2(rOf(last, EFF.key))}`), ", the closest link of the three.")] },
    { num: "Step 6", title: "It wasn’t always like this", body: [
      h("p", null, "Every season since ", fmtSeason(seasons[0]), ". Volume’s link to winning peaked at ", b(`r = ${r2(rOf(peak, VOL.key))}`), " in ", fmtSeason(peak), ", when only some teams leaned on threes. Once everyone did, it faded to ", b(r2(vol)), "."),
      h("p", null, "Accuracy went the other way: r = ", r2(rEra(1985, 1999, ACC.key)), " in 1985–2000, ", r2(rEra(2020, last, ACC.key)), " since 2020.")] },
    { num: "Step 7", title: "Four kinds of teams", body: [
      h("p", null, "All ", d3.format(",")(nAll), " team-seasons since ", fmtSeason(seasons[0]), ", split by whether they shot more threes than average and whether they made more. Bright dots had winning records."),
      h("p", null, "Accurate, low-volume teams won ", b(pct(quad("low", "high").win_pct)), ". High-volume, inaccurate teams won ", b(pct(quad("high", "low").win_pct)), ".")] },
    { num: "Your turn", title: "Run the seasons", body: [
      h("p", null, "Pick a stat and a season, or press play to run every season since ", fmtSeason(seasons[0]), ". Hover a ball for its numbers."),
      controls] },
  ];

  const exploreState = () => ({ ...base, season: explore.season, metric: explore.metric, fit: true });
  const metricSeg = h("div");
  controls.append(metricSeg);
  segmented(metricSeg, METRICS.map((mm) => ({ value: mm.key, label: mm.label })), explore.metric.key, (k) => {
    explore.metric = METRICS.find((mm) => mm.key === k);
    render(exploreState());
  }, "x-axis stat");
  const row = h("div", { class: "row" });
  controls.append(row);
  const seasonSlider = slider(row, "Season", seasons, explore.season, fmtSeason, (v) => {
    explore.season = v;
    render(exploreState());
  });
  seasonSlider.input.style("width", "150px");
  let timer = null;
  const playBtn = h("button", { class: "btn primary", type: "button" }, "▶ Play");
  row.append(playBtn);
  playBtn.addEventListener("click", () => {
    if (timer) { timer.stop(); timer = null; playBtn.textContent = "▶ Play"; return; }
    if (explore.season === last) explore.season = seasons[0];
    playBtn.textContent = "❚❚ Pause";
    const tick = () => {
      seasonSlider.set(explore.season);
      render(exploreState());
      const i = seasons.indexOf(explore.season);
      if (i >= seasons.length - 1) { timer.stop(); timer = null; playBtn.textContent = "▶ Play"; return; }
      explore.season = seasons[i + 1];
    };
    timer = d3.interval(tick, 950);
    tick();
  });

  size();
  const story = setupSteps(document.getElementById("q3-steps"), steps, (i) => {
    render(states[i] || exploreState());
  });
  new ResizeObserver(() => {
    size();
    if (current) render(current, { animate: false });
  }).observe(area);

  return { stepEl: (i) => story.els[i] };
}
