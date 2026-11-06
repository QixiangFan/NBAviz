// 4th quarter, first screen: every MVP since 1955-56 on five rows, one per listed position, across the
// seasons. Dot size can show the MVP's three-point attempts per game; MVPs from before the line
// (1979-80) are hollow rings, since they had no threes to take. A table beside the chart counts the MVPs
// per decade and position; hovering a cell or row picks out its dots. MVPs from 1996-97 on (the seasons
// with player data) can be clicked to deal them into the duel below.
import { season as fmtSeason } from "../data.js";
import { instant, scrollToEl } from "../motion.js";
import { showTip, moveTip, hideTip } from "../ui/tooltip.js";
import { segmented } from "../ui/controls.js";
import { h, b } from "./steps.js";

const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
const POS_NAME = { PG: "Point guard", SG: "Shooting guard", SF: "Small forward", PF: "Power forward", C: "Center" };
const DECADES = [[1955, 1969, "1955–69"], [1970, 1979, "1970s"], [1980, 1989, "1980s"], [1990, 1999, "1990s"],
  [2000, 2009, "2000s"], [2010, 2019, "2010s"], [2020, 2029, "2020s"]];
const LINE_SEASON = 1979;   // the 3-point line's first season
const SIZE_KEY = [1, 5, 10];

const pct = d3.format(".1%");
const dec = (v) => (v == null ? "–" : v.toFixed(1));

export function initPositions(data, duel) {
  const mvps = data.mvpPositions.filter((m) => POSITIONS.includes(m.pos));
  if (!mvps.length) return;
  const first = mvps[0].season;
  const last = mvps[mvps.length - 1].season;
  const known = new Set(data.players.map((p) => `${p.season}:${p.player_id}`));
  const linked = (m) => m.player_id != null && known.has(`${m.season}:${m.player_id}`);   // in the duel's data

  // Story numbers, all from the data
  const centers = mvps.filter((m) => m.pos === "C");
  const early = mvps.filter((m) => m.season < 1980);
  const earlyC = early.filter((m) => m.pos === "C").length;
  const recent = mvps.filter((m) => m.season >= 2014);
  const lo = d3.least(recent, (m) => m.fg3a_pg);
  document.getElementById("pos-lead").append(
    b(String(mvps.length)), " MVPs since ", fmtSeason(first), ", on the position each was listed at that season. Centers won ",
    b(`${earlyC} of ${early.length}`), " before 1980-81, and ", b(String(centers.length - earlyC)), " since. ",
    "Dot size is threes attempted per game: every MVP since ", fmtSeason(recent[0].season), " took at least ",
    b(dec(lo.fg3a_pg)), ` a game (${lo.player_name}, ${fmtSeason(lo.season)}), centers included.`);

  const st = { size: "fg3a", focus: null };   // focus: { lo, hi, pos? } from the table
  const sizeCtl = segmented(document.getElementById("pos-size"),
    [{ value: "fg3a", label: "3PA per game" }, { value: "same", label: "Same size" }], st.size,
    (v) => { st.size = v; paint(true); }, "Dot size");

  d3.select("#pos-legend").selectAll("span").data([
    ["fill", "3PA per game (dot size)"], ["ring", "before the 3-point line"],
  ]).join("span").each(function ([kind, text]) { this.append(h("i", { class: `pos-key ${kind}` }), text); });
  document.getElementById("pos-legend").append(
    h("span", { class: "mvp-hint" }, `Click an MVP from ${fmtSeason(data.mvps[0].season)} on to put them in the duel below`));

  buildTable();

  const fig = document.getElementById("pos-chart");
  const svg = d3.select(fig).append("svg");
  let shown = instant;
  let els = null;
  let drawnWidth = 0;

  function draw() {
    const W = fig.clientWidth;
    if (!W) return;
    drawnWidth = W;
    const H = Math.max(340, Math.min(460, W * 0.5));
    const m = { top: 44, right: 18, bottom: 34, left: 132 };
    const iw = W - m.left - m.right;
    const ih = H - m.top - m.bottom;
    const x = d3.scaleLinear([first - 0.5, last + 0.5], [0, iw]);
    const y = d3.scalePoint(POSITIONS, [0, ih]).padding(0.5);
    const rMax = Math.max(9, Math.min(15, y.step() * 0.4));
    const size = d3.scaleSqrt([0, 12], [2.5, rMax]);
    const radius = (d) => (st.size === "same" ? 6 : d.fg3a_pg == null ? 4 : size(d.fg3a_pg));

    svg.attr("viewBox", `0 0 ${W} ${H}`).selectAll("*").remove();
    const g = svg.append("g").attr("transform", `translate(${m.left},${m.top})`);

    // Five lanes, named on the left
    g.append("g").attr("class", "grid").selectAll("line").data(POSITIONS).join("line")
      .attr("x1", 0).attr("x2", iw).attr("y1", y).attr("y2", y);
    g.append("g").selectAll("text").data(POSITIONS).join("text").attr("class", "pos-lane")
      .attr("x", -16).attr("y", y).attr("dy", "0.35em").attr("text-anchor", "end").text((p) => POS_NAME[p]);
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih + 6})`)
      .call(d3.axisBottom(x).tickValues(d3.range(1960, last + 1, 10)).tickFormat(fmtSeason).tickSize(0).tickPadding(8))
      .call((a) => a.select(".domain").remove());
    g.append("text").attr("class", "mvp-title").attr("x", -m.left + 2).attr("y", -26).text("MVP by listed position");

    // The 3-point line's first season
    const notes = g.append("g").attr("class", "annot");
    const lx = x(LINE_SEASON - 0.5);
    notes.append("line").attr("x1", lx).attr("x2", lx).attr("y1", -6).attr("y2", ih).attr("stroke-dasharray", "3 4");
    notes.append("text").attr("class", "sub").attr("x", lx + 6).attr("y", -2).text(`3-point line, ${fmtSeason(LINE_SEASON)}`);

    // Size key, laid out left to right, then moved flush with the top right corner
    const key = g.append("g").attr("class", "pos-size-key annot");
    const label = (x, text) => key.append("text").attr("class", "sub").attr("x", x).attr("y", 0).attr("dy", "0.35em").text(text);
    let kx = label(0, "3PA / game").node().getComputedTextLength() + 12;
    SIZE_KEY.forEach((v) => {
      const r = size(v);
      key.append("circle").attr("class", "pos-dot").attr("cx", kx + r).attr("cy", 0).attr("r", r);
      kx += 2 * r + 5;
      kx += label(kx, v).node().getComputedTextLength() + 12;
    });
    key.attr("transform", `translate(${iw - kx + 12},-22)`);

    const dots = g.append("g").selectAll("circle").data(mvps, (d) => d.season).join("circle")
      .attr("class", (d) => `pos-dot${linked(d) ? " link" : ""}`)
      .attr("cx", (d) => x(d.season)).attr("cy", (d) => y(d.pos))
      .attr("r", shown ? radius : 0)
      .attr("tabindex", (d) => (linked(d) ? 0 : null)).attr("role", (d) => (linked(d) ? "button" : null))
      .attr("aria-label", (d) => `${d.player_name}, ${fmtSeason(d.season)} MVP, ${POS_NAME[d.pos]}, ${dec(d.fg3a_pg)} threes attempted per game` +
        (linked(d) ? ". Put in the duel." : ""))
      .on("pointerenter", function (event, d) { show(this, d, event); })
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

    els = { dots, key, radius };
    paint(false);
  }

  /** Dot sizes, the size key and the table's focus; animated when the reader changes the size. */
  function paint(animate) {
    if (!els) return;
    const { dots, key, radius } = els;
    sizeCtl.set(st.size);
    key.style("display", st.size === "fg3a" ? null : "none");
    d3.select("#pos-legend").classed("same", st.size === "same");
    const f = st.focus;
    dots.classed("ring", (d) => st.size === "fg3a" && d.fg3a_pg == null);
    dots.classed("dim", (d) => f != null && !(d.season >= f.lo && d.season <= f.hi && (!f.pos || d.pos === f.pos)));
    if (shown) (animate && !instant ? dots.transition().duration(500).ease(d3.easeCubicOut) : dots).attr("r", radius);
  }

  function buildTable() {
    const table = d3.select("#pos-table");
    table.append("thead").append("tr").selectAll("th").data(["", ...POSITIONS]).join("th")
      .attr("title", (p) => POS_NAME[p] || null).text((p) => p);
    const rows = table.append("tbody").selectAll("tr").data(DECADES).join("tr");
    rows.append("th").attr("scope", "row").text((d) => d[2]);
    rows.selectAll("td").data(([lo, hi]) => POSITIONS.map((pos) => ({
      lo, hi, pos, n: mvps.filter((m) => m.pos === pos && m.season >= lo && m.season <= hi).length,
    }))).join("td")
      .classed("zero", (c) => !c.n)
      .style("--n", (c) => c.n)
      .text((c) => c.n || "·");
    rows.on("pointerenter", (_, [lo, hi]) => setFocus({ lo, hi }))
      .on("pointerleave", () => setFocus(null));
    rows.selectAll("td").on("pointerenter", (_, c) => setFocus(c))
      .on("pointerleave", function () {
        const [lo, hi] = d3.select(this.parentNode).datum();
        setFocus({ lo, hi });
      });
  }

  function setFocus(f) {
    st.focus = f;
    paint(false);
  }

  function show(node, d, event) {
    d3.select(node).classed("hover", !!d);
    if (!d) { hideTip(); return; }
    d3.select(node).raise();
    showTip(event, {
      title: `${d.player_name} · ${fmtSeason(d.season)} MVP`,
      rows: [
        { value: POS_NAME[d.pos], label: d.team },
        d.fg3a_pg == null ? { value: "–", label: "no 3-point line yet" }
          : { value: dec(d.fg3a_pg), label: "threes attempted / game", color: "#ec5e22" },
        { value: `${dec(d.pts_pg)} / ${dec(d.reb_pg)} / ${dec(d.ast_pg)}`, label: "pts / reb / ast" },
        { value: d.ts_pct == null ? "–" : pct(d.ts_pct), label: "true shooting" },
        ...(d.vote_share == null ? [] : [{ value: pct(d.vote_share), label: "of the MVP vote points" }]),
      ],
      note: linked(d) ? "Click to put this MVP in the duel below" : null,
    });
  }

  function pick(d) {
    if (!linked(d)) return;
    hideTip();
    duel.load(d.season, d.player_id);
    scrollToEl(document.getElementById("q4-players"));
  }

  // First view: the MVPs drop into their lanes season by season
  function reveal() {
    shown = true;
    const { dots, radius } = els;
    dots.attr("r", 0).transition().delay((_, i) => 200 + i * 22).duration(500)
      .ease(d3.easeBackOut.overshoot(1.8)).attr("r", radius);
  }

  draw();
  new ResizeObserver(() => {
    if (Math.abs(fig.clientWidth - drawnWidth) >= 2) draw();
  }).observe(fig);
  if (!instant) ScrollTrigger.create({ trigger: fig, start: "top 75%", once: true, onEnter: reveal });
}
