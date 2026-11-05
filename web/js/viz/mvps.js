// 4th quarter, first screen (sketch KN4, reframed as "MVPs by 3-point rate"): the MVP hall. Every MVP since
// 1996-97 is a medallion, placed by the share of their shots that were threes, over the league average for
// that season. A stem joins each MVP to the league line: orange when they took more threes than the league,
// blue when fewer. On first view the line draws itself and the MVPs pop out one season after another.
// Hover or focus a medallion for the season's numbers; click it (or press Enter) to deal that MVP into the
// duel below. MVPs of the reader's team (ui/team.js) wear a second ring.
import { season as fmtSeason } from "../data.js";
import { instant, scrollToEl } from "../motion.js";
import { headshotUrl, teamColors } from "../media.js";
import { showTip, moveTip, hideTip } from "../ui/tooltip.js";
import { getTeam, onTeam } from "../ui/team.js";
import { h, b } from "./steps.js";

const pct = d3.format(".1%");
const pct0 = d3.format(".0%");
const initials = (name) => name.split(" ").map((w) => w[0]).join("").slice(0, 3);

export function initMvps(data, duel) {
  const league = new Map(data.league.map((d) => [d.season, d.fg3a_rate]));
  const players = d3.index(data.players, (p) => p.season, (p) => p.player_id);
  const mvps = data.mvps.map((m) => {
    const p = players.get(m.season)?.get(m.player_id);
    return p && { ...m, p, team: data.teamBySeason.get(m.season)?.get(p.team), rate: p.fg3a_rate, league: league.get(m.season) };
  }).filter(Boolean);
  if (!mvps.length) return;
  mvps.forEach((m) => { m.above = m.rate > m.league; });

  // Story numbers: the MVP who leaned on threes the most, and the latest run of MVPs below the league line
  const peak = d3.greatest(mvps, (m) => m.rate);
  let streak = 0;
  while (streak < mvps.length && !mvps[mvps.length - 1 - streak].above) streak++;
  const run = mvps.slice(mvps.length - streak);
  const below = mvps.filter((m) => !m.above).length;
  document.getElementById("mvp-lead").append(
    "Every MVP since ", fmtSeason(mvps[0].season), ", placed by the share of their shots that were threes. ",
    peak.player_name, " leaned on them the most: ", b(pct(peak.rate)), " in ", fmtSeason(peak.season), ", ",
    (peak.rate / peak.league).toFixed(1), "× the league. But ", b(`${below} of ${mvps.length}`), " MVPs took threes less often than the league",
    ...(streak > 1 ? [", including all ", b(String(streak)), " since ", fmtSeason(run[0].season), "."] : ["."]));
  d3.select("#mvp-legend").selectAll("span").data([
    ["above", "took more threes than the league"], ["below", "took fewer"], ["league", "league average"],
  ]).join("span").each(function ([kind, text]) { this.append(h("i", { class: `mvp-key ${kind}` }), text); });
  document.getElementById("mvp-legend").append(h("span", { class: "mvp-hint" }, "Click an MVP to put them in the duel below"));

  const fig = document.getElementById("mvp-chart");
  const svg = d3.select(fig).append("svg");
  let shown = instant;   // the line has drawn itself and the medallions are out
  let els = null;
  let drawnWidth = 0;

  function draw() {
    const W = fig.clientWidth;
    if (!W) return;
    drawnWidth = W;
    const H = Math.max(360, Math.min(500, W * 0.42));
    const m = { top: 44, right: 112, bottom: 42, left: 48 };
    const iw = W - m.left - m.right;
    const ih = H - m.top - m.bottom;
    const x = d3.scalePoint(mvps.map((d) => d.season), [0, iw]).padding(0.5);
    const R = Math.max(10, Math.min(19, x.step() * 0.44));
    const y = d3.scaleLinear([0, 0.6], [ih - R, R]);   // a medallion at 0% still clears the season labels
    // A stem runs from the league line to the medallion's edge (none if the medallion sits on the line)
    const stemEnd = (d) => {
      const gap = y(d.rate) - y(d.league);
      return Math.abs(gap) <= R ? y(d.league) : y(d.rate) - Math.sign(gap) * R;
    };

    svg.attr("viewBox", `0 0 ${W} ${H}`).selectAll("*").remove();
    const defs = svg.append("defs");
    defs.append("clipPath").attr("id", "mvp-clip").append("circle").attr("r", R);
    const wash = defs.append("linearGradient").attr("id", "mvp-wash").attr("x1", 0).attr("x2", 0).attr("y1", 0).attr("y2", 1);
    wash.append("stop").attr("offset", "0%").attr("stop-color", "#f2eee6").attr("stop-opacity", 0.09);
    wash.append("stop").attr("offset", "100%").attr("stop-color", "#f2eee6").attr("stop-opacity", 0);
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    const ticks = [0, 0.2, 0.4, 0.6];
    g.append("g").attr("class", "grid").call(d3.axisLeft(y).tickValues(ticks).tickSize(-iw).tickFormat(""));
    g.append("g").attr("class", "axis").call(d3.axisLeft(y).tickValues(ticks).tickFormat(pct0).tickSize(0).tickPadding(10))
      .call((a) => a.select(".domain").remove());
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih + 4})`)
      .call(d3.axisBottom(x).tickValues(x.domain().filter((_, i) => i % 5 === 0)).tickFormat(fmtSeason).tickSize(0).tickPadding(8))
      .call((a) => a.select(".domain").remove());
    g.append("text").attr("class", "mvp-title").attr("x", -m.left + 2).attr("y", -26).text("Share of shots that were threes");

    // The league average under everything, labeled where it ends
    const area = g.append("path").attr("class", "mvp-area").style("fill", "url(#mvp-wash)")
      .attr("d", d3.area().x((d) => x(d.season)).y0(y(0)).y1((d) => y(d.league)).curve(d3.curveMonotoneX)(mvps));
    const line = g.append("path").attr("class", "mvp-league")
      .attr("d", d3.line().x((d) => x(d.season)).y((d) => y(d.league)).curve(d3.curveMonotoneX)(mvps));
    const lastMvp = mvps[mvps.length - 1];
    const notes = g.append("g").attr("class", "annot mvp-notes");
    notes.append("text").attr("class", "sub").attr("x", x(lastMvp.season) + R + 8).attr("y", y(lastMvp.league)).attr("dy", "0.35em")
      .text("League average");

    const stems = g.append("g").selectAll("line").data(mvps).join("line").attr("class", (d) => `mvp-stem ${d.above ? "above" : "below"}`)
      .attr("x1", (d) => x(d.season)).attr("x2", (d) => x(d.season)).attr("y1", (d) => y(d.league));

    // Medallions: the outer g places one, the pop g scales it in, the body grows on hover
    const medals = g.append("g").selectAll("g").data(mvps).join("g").attr("class", "medal")
      .attr("transform", (d) => `translate(${x(d.season)},${y(d.rate)})`)
      .attr("tabindex", 0).attr("role", "button")
      .attr("aria-label", (d) => `${d.player_name}, ${fmtSeason(d.season)} MVP: ${pct(d.rate)} of shots were threes, league ${pct(d.league)}. Put in the duel.`)
      .style("--team", (d) => teamColors(d.team).accent);
    const pops = medals.append("g").attr("class", "medal-pop");
    const body = pops.append("g").attr("class", "medal-body");
    body.append("circle").attr("class", "medal-fan").attr("r", R + 5);
    body.append("circle").attr("class", "medal-disc").attr("r", R);
    body.append("text").attr("class", "medal-initials").attr("dy", "0.35em").style("font-size", `${Math.round(R * 0.7)}px`)
      .text((d) => initials(d.player_name));
    body.append("image").attr("clip-path", "url(#mvp-clip)").attr("href", (d) => headshotUrl(d.player_id, "260x190"))
      .attr("x", -R * 1.3).attr("y", -R * 1.02).attr("width", R * 2.6).attr("height", R * 2.6)
      .attr("preserveAspectRatio", "xMidYMin slice")
      .on("error", function () { this.remove(); });   // the initials show instead
    body.append("circle").attr("class", "medal-ring").attr("r", R);

    // Two notes, both from the data: the MVP who leaned on threes the most, and the latest run below the line
    const peakNote = notes.append("g").attr("transform", `translate(${x(peak.season) - R - 10},${y(peak.rate) - 10})`);
    peakNote.selectAll("text").data([`${peak.player_name}, ${fmtSeason(peak.season)}`, `${pct(peak.rate)} of shots were threes`]).join("text")
      .attr("class", (_, i) => (i ? "sub" : null)).attr("y", (_, i) => i * 16).attr("text-anchor", "end").text((l) => l);
    if (streak > 1) {
      const [x0, x1] = [x(run[0].season) - R, x(run[run.length - 1].season) + R];
      const yb = d3.max(run, (d) => y(d.rate)) + R + 12;
      notes.append("path").attr("d", `M${x0},${yb - 6}V${yb}H${x1}V${yb - 6}`);
      notes.append("text").attr("class", "sub").attr("x", (x0 + x1) / 2).attr("y", yb + 16).attr("text-anchor", "middle")
        .text(`${streak} straight MVPs below the league line`);
    }

    // Hover and focus: the medallion grows and the tooltip reads out the season
    medals.on("pointerenter", function (event, d) { show(this, d, event); })
      .on("pointermove", moveTip)
      .on("pointerleave", function () { show(this, null); })
      .on("focus", function (_, d) {
        const r = this.getBoundingClientRect();
        show(this, d, { clientX: r.right, clientY: r.top });
      })
      .on("blur", function () { show(this, null); })
      .on("click", (_, d) => pick(d))
      .on("keydown", (event, d) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        pick(d);
      });

    els = { line, area, stems, pops, notes, medals, stemEnd };
    paintFan();
    if (shown) {
      stems.attr("y2", stemEnd);
    } else {   // waiting for the first view
      line.style("opacity", 0);
      area.style("opacity", 0);
      notes.style("opacity", 0);
      stems.attr("y2", (d) => y(d.league));
      pops.attr("transform", "scale(0)");
    }
  }

  function show(node, d, event) {
    d3.select(node).classed("hover", !!d);
    if (!d) { hideTip(); return; }
    d3.select(node).raise();
    showTip(event, {
      title: `${d.player_name} · ${fmtSeason(d.season)} MVP`,
      logo: data.logo(d.team),
      accent: teamColors(d.team).accent,
      rows: [
        { value: pct(d.rate), label: "of shots were threes", color: d.above ? "#ec5e22" : "#3d8ff0" },
        { value: pct(d.league), label: "league average" },
        { value: d.p.fg3m_pg.toFixed(1), label: "threes made / game" },
        { value: d.p.pts_pg.toFixed(1), label: "points / game" },
        { value: pct(d.p.ts_pct), label: "true shooting" },
      ],
      note: "Click to put this MVP in the duel below",
    });
  }

  function pick(d) {
    hideTip();
    duel.load(d.season, d.player_id);
    scrollToEl(document.getElementById("q4-players"));
  }

  function paintFan() {
    const fan = getTeam();
    els?.medals.classed("fan", (d) => fan != null && d.team?.team_id === fan);
  }

  // First view: the league line draws itself, then the MVPs pop out season by season on their stems
  function reveal() {
    shown = true;
    const { line, area, stems, pops, notes, stemEnd } = els;
    const len = line.node().getTotalLength();
    line.style("opacity", 1).attr("stroke-dasharray", `${len} ${len}`).attr("stroke-dashoffset", len)
      .transition().duration(1400).ease(d3.easeCubicInOut).attr("stroke-dashoffset", 0)
      .on("end", function () { d3.select(this).attr("stroke-dasharray", null).attr("stroke-dashoffset", null); });
    area.transition().duration(1200).style("opacity", 1);
    pops.transition().delay((_, i) => 300 + i * 45).duration(600).ease(d3.easeBackOut.overshoot(1.6)).attr("transform", "scale(1)");
    stems.transition().delay((_, i) => 420 + i * 45).duration(500).ease(d3.easeCubicOut).attr("y2", stemEnd);
    notes.transition().delay(400 + mvps.length * 45).duration(600).style("opacity", 1);
  }

  draw();
  new ResizeObserver(() => {
    if (Math.abs(fig.clientWidth - drawnWidth) >= 2) draw();
  }).observe(fig);
  onTeam(paintFan);
  if (!instant) ScrollTrigger.create({ trigger: fig, start: "top 75%", once: true, onEnter: reveal });
}
