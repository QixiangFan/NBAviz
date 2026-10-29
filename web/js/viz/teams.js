// 3rd quarter, the main message (sketches QF8 / KN7 / JB2 / JB4 / JB6). Each team is a ball with its logo.
// Scroll steps move the same balls from volume to accuracy to efficiency, zoom out to every season
// (correlation lines), pour every team-season into one cloud (volume × accuracy), light up the champions
// in it, then sort the cloud's four corners into four groups. The last step hands over the controls. The
// reader's team (ui/team.js) is ringed in its colors throughout.
import { season as fmtSeason } from "../data.js";
import { dur, instant } from "../motion.js";
import { teamColors } from "../media.js";
import { setupSteps, h, b } from "./steps.js";
import { ballSeams } from "./court.js";
import { segmented, slider } from "../ui/controls.js";
import { showTip, hideTip } from "../ui/tooltip.js";
import { getTeam, onTeam, openTeamPicker } from "../ui/team.js";

export const METRICS = [
  { key: "fg3a_rate", name: "3PA rate", label: "Volume", long: "share of shots that are threes", color: "#ec5e22" },
  { key: "fg3_pct", name: "3P%", label: "Accuracy", long: "3-point percentage", color: "#16ab85" },
  { key: "efg", name: "eFG%", label: "Efficiency", long: "effective field-goal %", color: "#3d8ff0" },
];
const [VOL, ACC, EFF] = METRICS;
const X_MAX = 3.6;           // |z| of the most extreme team-season is about 3.5
const clampZ = (v) => Math.max(-X_MAX, Math.min(X_MAX, v));
const sdTick = (v) => (v === 0 ? "league avg" : `${v > 0 ? "+" : "−"}${Math.abs(v)} SD`);
const pct = d3.format(".1%");
const pct0 = d3.format(".0%");
const r2 = (v) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(2);
const ordinalLow = (k) => (k === 1 ? "lowest" : `${["", "", "second", "third", "fourth", "fifth"][k] || `${k}th`}-lowest`);
/** A three-point crown w wide, centered on the origin: the champion's ball wears it. */
const crown = (w) => {
  const x = w / 2;
  const y = w * 0.36;
  return `M${-x},${y}L${-x},${-y / 2}L${-x / 2},${y * 0.15}L0,${-y}L${x / 2},${y * 0.15}L${x},${-y / 2}L${x},${y}Z`;
};

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
  // The cloud and the four groups: every team-season, bright when it won at least half its games
  const everyTeam = teams.filter((d) => d.fg3a_rate_z != null && d.fg3_pct_z != null);
  const dotKey = (d) => `${d.season}-${d.team_id}`;
  const shade = (d) => (d.win_pct >= 0.5 ? 0.9 : 0.22);
  const winners = everyTeam.filter((d) => d.win_pct >= 0.5);
  const winnersWhere = (test) => pct0(d3.mean(winners, (d) => (test(d) ? 1 : 0)));
  // Champions turn gold from the champions step on; the reader's team is ringed in its colors
  const champOf = new Map(data.champs.map((c) => [c.season, c.team_id]));
  const isChamp = (d) => champOf.get(d.season) === d.team_id;
  const champs = everyTeam.filter(isChamp);
  const champsWhere = (test) => champs.filter(test).length;
  let fan = getTeam();
  const isFan = (d) => d.team_id === fan;

  // Logos: a team whose logo fails to load (e.g. offline) falls back to its abbreviation
  const failed = new Set();
  const logoOf = (d) => { const url = data.logo(d); return url && !failed.has(url) ? url : null; };
  now.forEach((d) => { if (logoOf(d)) new Image().src = logoOf(d); });   // fetch during the loader

  // Title card: today's thirty logos drift past in three rows, the reader's team in color. Each row holds
  // its logos twice, so sliding it by half its width loops without a seam.
  const wall = now.filter(logoOf);
  d3.select("#q3-wall").selectAll("div").data(d3.range(3)).join("div").attr("class", "logo-row").each(function (k) {
    const row = wall.filter((_, i) => i % 3 === k);
    for (const d of [...row, ...row]) this.append(h("img", { src: logoOf(d), alt: "", decoding: "async", "data-team": d.team_id }));
  });
  const paintWall = () => document.querySelectorAll("#q3-wall img").forEach((img) => img.classList.toggle("fan", +img.dataset.team === fan));
  paintWall();

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
  const gQuads = root.append("g").style("opacity", 0);     // group labels and dividers
  const gCloud = root.append("g").attr("class", "cloud-corners").style("opacity", 0);
  const gFan = root.append("g").attr("class", "fan-trail").style("opacity", 0);   // the reader's team, season to season
  const gDots = root.append("g").style("opacity", 0);      // every team-season: the cloud, then the groups
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
  let hovered = null;           // the team-season under the pointer

  // Tooltip for one team-season; metric: the stat on screen, if any
  const teamTip = (d, metric = null) => ({
    title: `${d.team_name} · ${fmtSeason(d.season)}`,
    logo: logoOf(d),
    accent: teamColors(d).accent,
    rows: [
      { value: pct(d.win_pct), label: `win % (${d.wins}-${d.games - d.wins})` },
      ...METRICS.map((mm) => ({
        value: pct(d[mm.key]), label: `${mm.name} (${d[`${mm.key}_z`] >= 0 ? "+" : "−"}${Math.abs(d[`${mm.key}_z`]).toFixed(1)} SD)`,
        color: mm === metric ? mm.color : null,
      })),
    ],
    note: [isChamp(d) && `${fmtSeason(d.season)} NBA champion`, isFan(d) && "Your team"].filter(Boolean).join(" · ") || null,
  });

  // The hovered ball grows, takes its team's color as a ring and comes to the front
  function hover(d) {
    if (d === hovered) return;
    hovered = d;
    const balls = gBalls.selectAll("g.ball").classed("hover", (x) => x === d);
    if (d) balls.filter((x) => x === d).raise();
  }

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
  const ya = () => d3.scaleLinear().domain([-X_MAX, X_MAX]).range([ih, 0]);   // accuracy (3P% z), for the cloud
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
        .call(d3.axisBottom(x).tickValues(iw < 460 ? [-2, 0, 2] : [-3, -2, -1, 0, 1, 2, 3]).tickSizeOuter(0).tickFormat(sdTick));
      xTitle.attr("x", iw / 2).attr("y", ih + 48).text(iw < 460
        ? `${metric.label} (${metric.name}) vs. league avg →`
        : `${metric.label}: ${metric.long}, vs. that season’s league average →`);
      yTitle.attr("transform", `translate(-44,${ih / 2}) rotate(-90)`).text("Win %");
      gRef.selectAll("line").data([[x(0), x(0), 0, ih], [0, iw, y(0.5), y(0.5)]]).join("line")
        .attr("x1", (d) => d[0]).attr("x2", (d) => d[1]).attr("y1", (d) => d[2]).attr("y2", (d) => d[3])
        .style("stroke", "rgba(242,238,230,0.18)");
    } else if (view === "cloud") {
      // Volume across, accuracy up, both against the team's own season. The two average lines cut the
      // cloud into the four groups of the next step, and become that step's dividers.
      const x = xz();
      const y = ya();
      const ticks = iw < 460 ? [-2, 0, 2] : [-3, -2, -1, 0, 1, 2, 3];
      gGrid.transition(t).call(d3.axisLeft(y).tickValues(ticks).tickSize(-iw).tickFormat(""));
      gY.transition(t).call(d3.axisLeft(y).tickValues(ticks).tickSize(0).tickPadding(10)
        .tickFormat((v) => (v === 0 ? "avg" : `${v > 0 ? "+" : "−"}${Math.abs(v)}`)));
      gX.attr("transform", `translate(0,${ih})`).transition(t)
        .call(d3.axisBottom(x).tickValues(ticks).tickSizeOuter(0).tickFormat(sdTick));
      xTitle.attr("x", iw / 2).attr("y", ih + 48).text(iw < 460
        ? `${VOL.label} (${VOL.name}) vs. league avg →`
        : `${VOL.label}: ${VOL.long}, vs. that season’s league average →`);
      yTitle.attr("transform", `translate(-44,${ih / 2}) rotate(-90)`).text(`${ACC.label}: ${ACC.name} vs. league avg (SD) →`);
      gRef.selectAll("line").data([[x(0), x(0), 0, ih], [0, iw, y(0), y(0)]]).join("line")
        .attr("x1", (d) => d[0]).attr("x2", (d) => d[1]).attr("y1", (d) => d[2]).attr("y2", (d) => d[3])
        .style("stroke", "rgba(242,238,230,0.3)");
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
        const body = g.append("g").attr("class", "ball-body");   // scaled on hover; the outer g places the ball
        body.append("circle").attr("class", "fan-ring");
        body.append("circle").attr("class", "leather");
        body.append("path").attr("class", "seam");
        body.append("image").attr("class", "logo").on("error", function () {
          failed.add(this.getAttribute("href"));
          d3.select(this.closest("g.ball")).classed("has-logo", false);
        });
        body.append("text").attr("class", "abbr");
        body.append("path").attr("class", "crown");
        g.append("text").attr("class", "fan-tag").text("Your team");
        return g;
      },
      (update) => update,
      (exit) => exit.transition(t).attr("transform", function () {
        return `${d3.select(this).attr("transform").replace(/scale\([^)]*\)/, "")} scale(0.001)`;
      }).remove(),
    );
    balls.select(".leather").attr("r", R);
    balls.select(".fan-ring").attr("r", R + 5);
    balls.select(".seam").attr("d", ballSeams(R));
    balls.select(".abbr").text((d) => d.team);
    balls.select(".crown").attr("d", crown(R * 0.95)).attr("transform", `translate(${R * 0.62},${-R * 0.92}) rotate(20)`);
    balls.select(".fan-tag").attr("y", R + 17);
    balls.style("--team", (d) => teamColors(d).accent).classed("hover", (d) => d === hovered);
    balls.select("image").attr("x", -R * 0.78).attr("y", -R * 0.78).attr("width", R * 1.56).attr("height", R * 1.56)
      .attr("href", logoOf);
    balls.classed("has-logo", (d) => !!logoOf(d));
    balls.classed("hot", (d) => st.highlight && d === most)
      .classed("cold", (d) => st.highlight && d === counter)
      .classed("dim", (d) => st.highlight && d !== most && d !== counter && !isFan(d))
      .classed("champ", (d) => !!st.gold && isChamp(d))
      .classed("fan", isFan);
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
      if (!d || Math.hypot(X(d) - px, Y(d) - py) > 36) { hideTip(); hover(null); return; }
      hover(d);
      showTip(event, teamTip(d, st.metric));
    }).on("pointerleave", () => { hideTip(); hover(null); });
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

  // --- Every team-season: one cloud ------------------------------------------------------------------
  const cloudR = () => Math.max(1.8, Math.min(3.2, iw / 320));
  const cloudXY = () => {
    const x = xz();
    const y = ya();
    return [(d) => x(clampZ(d.fg3a_rate_z)), (d) => y(clampZ(d.fg3_pct_z))];
  };

  // Dot styles. st.gold: champions in gold; st.spot (the champions step): everyone else faded; the reader's
  // team ringed in its colors. Colors switch at once (CSS colors don't tween); opacity moves with the dots.
  const isGold = (d, st) => !!st.gold && isChamp(d);
  const dotOpacity = (d, st) => (st.spot && !isChamp(d) ? (isFan(d) ? 0.55 : 0.08) : isFan(d) || isGold(d, st) ? 1 : shade(d));
  function paintDots(sel, st) {
    sel.classed("champ", (d) => isGold(d, st)).classed("fan", isFan)
      .style("fill", (d) => (isGold(d, st) ? "var(--gold)" : "var(--ink)"))
      .style("stroke", (d) => (isFan(d) ? teamColors(d).accent : isGold(d, st) ? "var(--bg)" : null))
      .style("stroke-width", (d) => (isFan(d) || isGold(d, st) ? 1.5 : null));
    sel.filter((d) => isGold(d, st) || isFan(d)).raise();   // drawn over the rest
  }

  // The legend is shared: above the cloud (whose x labels sit under it), under the groups. Each key starts
  // after the one before; narrow charts use the short labels.
  function dotLegend(t, y, st) {
    const fanRow = everyTeam.filter(isFan).at(-1);
    const keys = [
      ...(st.spot ? [] : [{ label: "winning record", short: "winning", opacity: 0.9 }, { label: "losing record", short: "losing", opacity: 0.22 }]),
      ...(st.gold ? [{ label: "champion", short: "champion", fill: "var(--gold)" }] : []),
      ...(st.spot ? [{ label: "every other team-season", short: "others", opacity: 0.22 }] : []),
      ...(fanRow ? [{ label: `your team (${fanRow.team})`, short: fanRow.team, stroke: teamColors(fanRow).accent }] : []),
    ];
    const narrow = iw < 460;
    const legend = gDots.selectAll("g.qkey").data(keys, (k) => k.label).join((enter) => {
      const g = enter.append("g").attr("class", "qkey").attr("transform", `translate(0,${y})`);
      g.append("circle").attr("r", 4);
      g.append("text").attr("x", 10).attr("dy", "0.35em").style("font", "500 11px var(--mono)").style("fill", "var(--ink-2)");
      return g;
    });
    legend.select("circle").style("fill", (k) => k.fill || "var(--ink)").style("opacity", (k) => k.opacity ?? 1)
      .style("stroke", (k) => k.stroke || null).style("stroke-width", (k) => (k.stroke ? 1.5 : null));
    legend.select("text").text((k) => `= ${narrow ? k.short : k.label}`);
    let x = 0;
    const xs = legend.nodes().map((node) => {
      const at = x;
      x += 10 + node.querySelector("text").getComputedTextLength() + (narrow ? 14 : 24);
      return at;
    });
    legend.transition(t).attr("transform", (_, i) => `translate(${xs[i]},${y})`);
  }

  // The reader's team, season to season: a faint line through its dots, labeled at the latest season
  function fanTrail(t, X, Y, delay = 0) {
    const rows = everyTeam.filter(isFan).sort((a, c) => a.season - c.season);
    const latest = rows.at(-1);
    gFan.transition(t).delay(instant ? 0 : delay).style("opacity", rows.length ? 1 : 0);
    gFan.selectAll("path").data(rows.length ? [rows] : []).join("path")
      .attr("d", d3.line().x(X).y(Y).curve(d3.curveCatmullRom.alpha(0.5)))
      .style("stroke", latest && teamColors(latest).accent);
    gFan.selectAll("text").data(latest ? [latest] : []).join("text")
      .attr("x", (d) => X(d) + 9).attr("y", (d) => Y(d) - 9).text((d) => `${d.team} ${fmtSeason(d.season)}`);
  }

  // Every dot answers to the pointer: the nearest one within reach shows its numbers
  function hoverDots(rows, X, Y) {
    const delaunay = d3.Delaunay.from(rows, X, Y);
    hit.style("pointer-events", "all").on("pointermove", (event) => {
      const [px, py] = d3.pointer(event);
      const d = rows[delaunay.find(px, py)];
      if (!d || Math.hypot(X(d) - px, Y(d) - py) > 20) { hideTip(); return; }
      showTip(event, teamTip(d));
    }).on("pointerleave", hideTip);
  }

  // pour (arriving from the views above): the seasons pour in, oldest first. Otherwise (back from the
  // groups, or a resize) every dot walks to its place in the cloud. In the champions step the gold dots
  // swell one season after another, and only they (and the reader's team) answer to the pointer.
  function cloud(t, pour, st) {
    const [X, Y] = cloudXY();
    const r = cloudR();
    const size = (d) => (st.spot && isChamp(d) ? r * 2.2 : isFan(d) ? r * 1.6 : r);
    const span = last - seasons[0];
    gDots.transition(t).style("opacity", 1);
    gCloud.transition(t).style("opacity", 1);
    const dots = gDots.selectAll("circle.dot").data(everyTeam, dotKey)
      .join((enter) => enter.append("circle").attr("class", "dot").attr("r", 0))
      .call(paintDots, st);
    if (pour && !instant) {
      dots.interrupt().attr("cx", X).attr("cy", Y).attr("r", 0).style("opacity", (d) => dotOpacity(d, st))
        .transition().delay((d) => 250 + ((d.season - seasons[0]) / span) * 1200 + Math.random() * 150)
        .duration(500).ease(d3.easeBackOut).attr("r", size);
    } else {
      const delay = (d) => (instant ? 0 : st.spot && isChamp(d) ? 200 + ((d.season - seasons[0]) / span) * 900 : Math.random() * 300);
      dots.transition(t).delay(delay).duration(instant ? 0 : 1100)
        .attr("cx", X).attr("cy", Y).attr("r", size).style("opacity", (d) => dotOpacity(d, st));
    }
    fanTrail(t, X, Y, pour ? 1700 : 0);
    // The four corners, named as the groups they become; in the champions step, with their champions
    const short = iw < 560;
    const corners = [
      [0, 0, "start", short ? "Fewer 3s · accurate" : "Fewer threes · more accurate", (d) => d.fg3a_rate_z <= 0 && d.fg3_pct_z > 0],
      [iw, 0, "end", short ? "More 3s · accurate" : "More threes · more accurate", (d) => d.fg3a_rate_z > 0 && d.fg3_pct_z > 0],
      [0, ih, "start", short ? "Fewer 3s · inaccurate" : "Fewer threes · less accurate", (d) => d.fg3a_rate_z <= 0 && d.fg3_pct_z <= 0],
      [iw, ih, "end", short ? "More 3s · inaccurate" : "More threes · less accurate", (d) => d.fg3a_rate_z > 0 && d.fg3_pct_z <= 0],
    ];
    const cx = (c) => c[0] + (c[2] === "start" ? 10 : -10);
    gCloud.selectAll("text.corner").data(corners).join("text").attr("class", "corner")
      .attr("x", cx).attr("y", (c) => c[1] + (c[1] ? -12 : 20))
      .attr("text-anchor", (c) => c[2]).text((c) => c[3]);
    const counts = gCloud.selectAll("text.count").data(st.spot ? corners : []).join((enter) => {
      const text = enter.append("text").attr("class", "count");
      text.append("tspan").attr("class", "mark").text("● ");
      text.append("tspan").attr("class", "n");
      return text;
    });
    counts.attr("x", cx).attr("y", (c) => c[1] + (c[1] ? -30 : 38)).attr("text-anchor", (c) => c[2]);
    counts.select(".n").text((c) => `${champsWhere(c[4])} champions`);
    dotLegend(t, -12, st);
    hoverDots(st.spot ? everyTeam.filter((d) => isChamp(d) || isFan(d)) : everyTeam, X, Y);
  }

  // --- Every team-season: four groups -----------------------------------------------------------------
  // Each corner of the cloud lines up in its own quarter of the chart, best record first, so a dot
  // never leaves its corner; the best teams move first and fill the rows in reading order.
  function quadrants(t, st) {
    const all = everyTeam;
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
    const order = new Map();   // 0 for the group's best record, 1 for its worst
    for (const blk of blocks) {
      const members = all.filter((r) => (r.fg3a_rate_z > 0 ? "high" : "low") === blk.volume
        && (r.fg3_pct_z > 0 ? "high" : "low") === blk.accuracy).sort((a, c) => c.win_pct - a.win_pct);
      blk.n = members.length;
      blk.champs = members.filter(isChamp).length;
      members.forEach((r, i) => {
        pos.set(r, [blk.col * bw + 24 + (i % cols) * d, blk.row * bh + 96 + Math.floor(i / cols) * d]);
        order.set(r, i / Math.max(1, members.length - 1));
      });
    }
    gQuads.transition(t).style("opacity", 1);
    gDots.transition(t).style("opacity", 1);
    const [X, Y] = cloudXY();
    const dot = Math.max(1.8, d * 0.36);
    gDots.selectAll("circle.dot").data(all, dotKey).join(
      (enter) => enter.append("circle").attr("class", "dot").attr("cx", X).attr("cy", Y).attr("r", cloudR()),   // e.g. a deep link
    )
      .call(paintDots, st)
      .transition(t).delay((r) => (instant ? 0 : order.get(r) * 700)).duration(instant ? 0 : 1100)
      .attr("cx", (r) => pos.get(r)[0]).attr("cy", (r) => pos.get(r)[1]).attr("r", (r) => (isFan(r) ? dot * 1.3 : dot))
      .style("opacity", (r) => dotOpacity(r, st));
    const labels = gQuads.selectAll("g.qlabel").data(blocks, (blk) => blk.name).join((enter) => {
      const g = enter.append("g").attr("class", "qlabel");
      g.append("text").attr("class", "quad-label");
      g.append("text").attr("class", "quad-value");
      g.append("text").attr("class", "quad-sub");
      const champ = g.append("text").attr("class", "quad-champs");
      champ.append("tspan").attr("class", "mark").text("● ");
      champ.append("tspan").attr("class", "n");
      return g;
    }).attr("transform", (blk) => `translate(${blk.col * bw + 24},${blk.row * bh + 10})`);
    labels.select(".quad-label").attr("y", 16).text((blk) => blk.name);
    labels.select(".quad-value").attr("y", 58).text((blk) => pct(quad(blk.volume, blk.accuracy).win_pct));
    labels.select(".quad-sub").attr("y", 78).text((blk) => `average win % · ${blk.n} team-seasons`);
    labels.select(".quad-champs").attr("x", 132).attr("y", 52).style("display", st.gold ? null : "none")
      .select(".n").text((blk) => `${blk.champs} champions`);
    dotLegend(t, ih + 28, st);
    hoverDots(all, (r) => pos.get(r)[0], (r) => pos.get(r)[1]);
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
      hover(null);
    }
    if (st.view !== "history") gCorr.transition(t).style("opacity", 0);
    if (st.view !== "quads") gQuads.transition(t).style("opacity", 0);
    if (st.view !== "cloud") gCloud.transition(t).style("opacity", 0);
    if (st.view !== "cloud") gFan.transition(t).style("opacity", 0);
    if (st.view !== "cloud" && st.view !== "quads") gDots.transition(t).style("opacity", 0);
    if (st.view === "scatter") scatter(st, t);
    if (st.view === "history") history(t, prevView !== "history" && animate);
    if (st.view === "cloud") cloud(t, animate && prevView !== "cloud" && prevView !== "quads", st);
    if (st.view === "quads") quadrants(t, st);
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
    { ...base, view: "cloud" },
    { ...base, view: "cloud", gold: true, spot: true },
    { ...base, view: "quads", gold: true },
    null,   // explore: built from the controls
  ];
  const nAll = d3.sum(quads, (q) => q.n);
  const controls = h("div", { class: "controls" });
  // The first card invites the reader to follow a team (the same picker as the HUD chip)
  const teamBtn = h("button", { class: "btn", type: "button" });
  teamBtn.addEventListener("click", () => openTeamPicker(teamBtn));
  const paintCta = () => {
    const row = now.find(isFan);
    teamBtn.textContent = row ? `Your team: ${row.team}` : "Follow your team";
  };
  paintCta();
  const steps = [
    { num: "How to read", title: "Thirty teams, one question", body: [
      h("p", null, "Each logo is one team in ", fmtSeason(last), ". Left to right: how much more often than the league average it shot threes. Bottom to top: how often it won."),
      h("p", null, "If more threes meant more wins, the balls would climb from left to right."),
      h("p", { class: "team-cta" }, teamBtn, h("small", null, "It stays ringed in its colors from here on."))] },
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
    { num: "Step 7", title: "Every team, every season", body: [
      h("p", null, "All ", d3.format(",")(nAll), " team-seasons since ", fmtSeason(seasons[0]), ", each against its own season’s league. Left to right: how much more often it shot threes. Bottom to top: how much better it made them."),
      h("p", null, "Bright dots had winning records. ", b(winnersWhere((d) => d.fg3_pct_z > 0)), " of them sit above the middle line: more accurate than their league. Only ",
        b(winnersWhere((d) => d.fg3a_rate_z > 0)), " sit right of it: more threes.")] },
    { num: "Step 8", title: "Where the champions sit", body: [
      h("p", null, "The ", String(champs.length), " champions since ", fmtSeason(seasons[0]), ", in gold. ", b(String(champsWhere((d) => d.fg3_pct_z > 0))),
        " of them shot threes more accurately than their league. Only ", b(String(champsWhere((d) => d.fg3a_rate_z > 0))), " took more of them."),
      h("p", null, "Count every shot, with threes worth 1.5 (eFG%), and ", b(String(champsWhere((d) => d.efg_z > 0))), " of the ", String(champs.length),
        " beat their league. Hover a gold dot to find a team.")] },
    { num: "Step 9", title: "Four kinds of teams", body: [
      h("p", null, "Cut the cloud at both averages and line up each corner’s teams, best record first."),
      h("p", null, "Accurate, low-volume teams won ", b(pct(quad("low", "high").win_pct)), ". High-volume, inaccurate teams won ", b(pct(quad("high", "low").win_pct)), ".")] },
    { num: "Your turn", title: "Run the seasons", body: [
      h("p", null, "Pick a stat and a season, or press play to run every season since ", fmtSeason(seasons[0]), ". Hover a ball for its numbers. The crown marks that season’s champion."),
      controls] },
  ];

  const exploreState = () => ({ ...base, season: explore.season, metric: explore.metric, fit: true, gold: true });
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
  onTeam((id) => {
    fan = id;
    paintWall();
    paintCta();
    if (current) render(current, { animate: false });
  });

  return { stepEl: (i) => story.els[i] };
}
