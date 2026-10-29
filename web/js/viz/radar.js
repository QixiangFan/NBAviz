// Radar drawn like a court's center circle: in the 4th quarter, two players' season percentiles on six axes
// with the league median as a dashed ring; at halftime, small glyphs of each era's average team. When a
// radar first scrolls into view its rings open, a sweep beam turns once and each point pops out as the beam
// crosses its axis. A new matchup runs a quicker sweep that moves the points one axis at a time. Hovering
// an axis compares the shapes on it.
import { dur, instant } from "../motion.js";
import { showTip, moveTip, hideTip } from "../ui/tooltip.js";

const RINGS = [0.25, 0.5, 0.75];   // the floor's edge is the 100th percentile
const TRAIL = 14;                  // wedges fading out behind the sweep beam
const TRAIL_DEG = 2.5;
let count = 0;                     // gradient, filter and path ids must be unique on the page
const polar = (deg, r) => [r * Math.cos((deg * Math.PI) / 180), r * Math.sin((deg * Math.PI) / 180)];
/** A slice from the center, clockwise from a0 to a1 degrees (0 = three o'clock). */
const wedge = (a0, a1, r) => {
  const [x0, y0] = polar(a0, r);
  const [x1, y1] = polar(a1, r);
  return `M0,0L${x0},${y0}A${r},${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1},${y1}Z`;
};

/**
 * radarDuel(fig, { axes, colors, describe, max, pad, median, rim, ghost }) → { set(values, { animate }), intro() }.
 * values[slot][axis] runs from 0 (center) to 1 (rim); describe(axis) returns the tooltip spec for that axis
 * (ui/tooltip.js). Until intro() runs the radar stays dark and set() only stores the values. max caps the
 * drawing's width and pad leaves room for the axis names around it (a number, or a function of the drawing's
 * size); labelGap is how far out from the rim the names sit. median labels the dashed middle ring and rim the
 * edge (null: a plain ring, no label). Slots listed in ghost are drawn as a dashed outline only.
 */
export function radarDuel(fig, { axes, colors, describe, max = 520, pad = 62, labelGap = 30, median = "League median", rim = "100", ghost = [] }) {
  const id = `radar-${++count}`;
  const n = axes.length;
  const deg = (j) => (360 * j) / n - 90;   // the first axis points up, the rest follow clockwise
  const svg = d3.select(fig).append("svg");
  let goal = colors.map(() => axes.map(() => 0));   // where set() wants the points
  let now = goal.map((row) => row.slice());         // where they are drawn
  let shown = instant;
  let anim = null;
  let size = 0;
  let r = 0;
  let margin = 0;   // pad, for the current size
  let el = null;

  function draw() {
    size = Math.min(fig.clientWidth, max);
    margin = typeof pad === "function" ? pad(size) : pad;
    r = Math.max(4, size / 2 - margin);
    svg.attr("viewBox", `0 0 ${size} ${size}`).selectAll("*").remove();
    const defs = svg.append("defs");
    const floor = defs.append("radialGradient").attr("id", `${id}-floor`);   // lit in the middle, like center court
    floor.append("stop").attr("offset", "0%").attr("stop-color", "#f2eee6").attr("stop-opacity", 0.07);
    floor.append("stop").attr("offset", "100%").attr("stop-color", "#f2eee6").attr("stop-opacity", 0.01);
    colors.forEach((c, s) => {   // each shape brightens toward its edge
      const fill = defs.append("radialGradient").attr("id", `${id}-fill-${s}`).attr("gradientUnits", "userSpaceOnUse")
        .attr("cx", 0).attr("cy", 0).attr("r", r);
      [[0, 0.04], [0.7, 0.16], [1, 0.36]].forEach(([o, a]) => fill.append("stop").attr("offset", o).attr("stop-color", c).attr("stop-opacity", a));
    });
    defs.append("filter").attr("id", `${id}-glow`).attr("x", "-25%").attr("y", "-25%").attr("width", "150%").attr("height", "150%")
      .append("feGaussianBlur").attr("stdDeviation", 5);
    const midline = defs.append("linearGradient").attr("id", `${id}-midline`).attr("gradientUnits", "userSpaceOnUse")
      .attr("x1", -size / 2).attr("x2", size / 2);
    [[0, 0], [0.5, 0.22], [1, 0]].forEach(([o, a]) => midline.append("stop").attr("offset", o).attr("stop-color", "#f2eee6").attr("stop-opacity", a));
    const [ax, ay] = polar(-150, r / 2);   // the median ring's upper half, for its label
    const [bx, by] = polar(30, r / 2);
    defs.append("path").attr("id", `${id}-median`).attr("d", `M${ax},${ay}A${r / 2},${r / 2} 0 0 1 ${bx},${by}`);

    const g = svg.append("g").attr("transform", `translate(${size / 2},${size / 2})`)
      .style("opacity", shown ? 1 : 0).style("pointer-events", shown ? null : "none");
    const line = g.append("line").attr("class", "midline").attr("x1", -size / 2).attr("x2", size / 2).style("stroke", `url(#${id}-midline)`);
    const floorDisc = g.append("circle").attr("class", "floor").attr("r", r).style("fill", `url(#${id}-floor)`);
    const rings = g.append("g").selectAll("circle").data(RINGS).join("circle")
      .attr("class", (v) => (v === 0.5 && median ? "ring median" : "ring")).attr("r", (v) => r * v);
    const spokes = g.append("g").selectAll("line").data(d3.range(n)).join("line").attr("class", "spoke")
      .attr("x2", (j) => polar(deg(j), r)[0]).attr("y2", (j) => polar(deg(j), r)[1]);
    const ends = g.append("g").selectAll("circle").data(d3.range(n)).join("circle").attr("class", "spoke-end").attr("r", 1.8)
      .attr("cx", (j) => polar(deg(j), r)[0]).attr("cy", (j) => polar(deg(j), r)[1]);
    const marks = g.append("g");
    if (median && r > 120) {   // the label needs the arc between the first two axes
      marks.append("text").attr("class", "median-label").attr("dy", -5).append("textPath")
        .attr("href", `#${id}-median`).attr("startOffset", "50%").text(median);
    }
    if (rim) marks.append("text").attr("class", "ring-label").attr("x", 5).attr("y", -r).attr("dy", "-0.4em").text(rim);
    const labels = g.append("g").selectAll("text").data(axes).join("text").attr("class", "axis-name")
      .each(function (a, j) {
        const [lx] = polar(deg(j), r + labelGap);
        d3.select(this).attr("x", lx).attr("y", polar(deg(j), r + labelGap - 4)[1]).attr("dy", "0.35em")
          .attr("text-anchor", Math.abs(lx) < 5 ? "middle" : lx > 0 ? "start" : "end").text(a.label);
      });
    const sweep = g.append("g").attr("class", "sweep").style("opacity", 0);
    for (let k = 0; k < TRAIL; k++) {
      sweep.append("path").attr("d", wedge(-(k + 1) * TRAIL_DEG, -k * TRAIL_DEG, r)).style("fill-opacity", 0.13 * (1 - k / TRAIL));
    }
    sweep.append("line").attr("class", "beam").attr("x2", r);
    const shapes = g.append("g").selectAll("g").data(colors).join("g")
      .attr("class", (_, s) => (ghost.includes(s) ? "shape ghost" : "shape"));
    shapes.append("path").attr("class", "glow").style("stroke", (c) => c).attr("filter", `url(#${id}-glow)`);
    shapes.append("path").attr("class", "area").style("stroke", (c) => c)
      .style("fill", (_, s) => (ghost.includes(s) ? "none" : `url(#${id}-fill-${s})`));
    const dots = g.append("g").attr("class", "dots").selectAll("circle")
      .data(colors.flatMap((c, s) => (ghost.includes(s) ? [] : d3.range(n).map((j) => ({ s, j, c }))))).join("circle")
      .attr("r", 4.5).style("fill", (d) => d.c);
    const pings = g.append("g").attr("class", "pings");
    g.append("g").attr("class", "hit").selectAll("path").data(d3.range(n)).join("path")
      .attr("d", (j) => wedge(deg(j) - 180 / n, deg(j) + 180 / n, r + margin))
      .on("pointerenter", (event, j) => focus(j, event))
      .on("pointermove", moveTip)
      .on("pointerleave", () => focus(null));
    el = { g, line, floorDisc, rings, spokes, ends, marks, labels, sweep, shapes, dots, pings };
    render();
  }

  function render() {
    const at = (s, j) => polar(deg(j), r * Math.max(0, now[s][j]));
    el.shapes.each(function (_, s) {
      d3.select(this).selectAll("path").attr("d", `${d3.line()(d3.range(n).map((j) => at(s, j)))}Z`);
    });
    el.dots.attr("cx", (d) => at(d.s, d.j)[0]).attr("cy", (d) => at(d.s, d.j)[1]);
  }

  // Hover: light up one axis and its two points, and compare the players on it
  function focus(j, event) {
    el.g.classed("focused", j != null);
    el.spokes.classed("on", (k) => k === j);
    el.labels.classed("on", (_, k) => k === j);
    el.dots.classed("on", (d) => d.j === j).each(function (d) {
      gsap.to(this, { attr: { r: d.j === j ? 7 : 4.5 }, duration: dur(0.25), overwrite: "auto" });
    });
    if (j == null) hideTip();
    else showTip(event, describe(j));
  }

  function ping(s, j) {
    const [x, y] = polar(deg(j), r * Math.max(0, goal[s][j]));
    const c = el.pings.append("circle").attr("cx", x).attr("cy", y).attr("r", 4).style("stroke", colors[s]).node();
    gsap.to(c, { attr: { r: 18 }, opacity: 0, duration: 0.7, ease: "power2.out", onComplete: () => c.remove() });
  }

  /**
   * The beam turns once (turn seconds, from the first axis) and each axis's points move to the goal as it
   * passes, over `each` seconds. Points ping where they land: all of them, or only those that move.
   */
  function sweepTo({ turn, each, ease, pingAll }) {
    anim?.kill();
    const from = now.map((row) => row.slice());
    const easing = gsap.parseEase(ease);
    const lag = (j) => (turn * j) / n;
    const pinged = new Set();
    const clock = { t: 0 };
    const total = lag(n - 1) + each;
    anim = gsap.to(clock, {
      t: total, duration: total, ease: "none",
      onUpdate: () => {
        const t = clock.t;
        for (let j = 0; j < n; j++) {
          const k = Math.min(1, Math.max(0, (t - lag(j)) / each));
          for (let s = 0; s < now.length; s++) {
            now[s][j] = from[s][j] + (goal[s][j] - from[s][j]) * easing(k);
            if (k > 0 && !pinged.has(j) && !ghost.includes(s) && (pingAll || Math.abs(goal[s][j] - from[s][j]) > 0.005)) ping(s, j);
          }
          if (k > 0) pinged.add(j);
        }
        const fade = t < turn ? Math.min(1, t / 0.12) : Math.max(0, 1 - (t - turn) / 0.35);
        el.sweep.attr("transform", `rotate(${-90 + 360 * Math.min(1, t / turn)})`).style("opacity", fade);
        render();
      },
    });
  }

  /** First view: the rings open from the center, the spokes reach out, then the beam sweeps the points in. */
  function intro() {
    if (shown) return;
    shown = true;
    el.g.style("opacity", 1).style("pointer-events", null);
    gsap.timeline()
      .from([...el.rings.nodes(), el.floorDisc.node()], { attr: { r: 0 }, duration: 1.1, stagger: 0.08, ease: "expo.out" }, 0)
      .from(el.spokes.nodes(), { attr: { x2: 0, y2: 0 }, duration: 0.8, stagger: 0.05, ease: "expo.out" }, 0.15)
      .from([el.line.node(), ...el.ends.nodes(), ...el.labels.nodes(), el.marks.node()], { opacity: 0, duration: 0.6, stagger: 0.04 }, 0.3)
      .add(() => sweepTo({ turn: 1.5, each: 0.7, ease: "back.out(1.7)", pingAll: true }), 0.55);
  }

  function set(values, { animate = false } = {}) {
    goal = values.map((row) => row.slice());
    if (!shown) return;
    if (animate && !instant) {
      sweepTo({ turn: 0.9, each: 0.6, ease: "back.out(1.4)", pingAll: false });
    } else {
      anim?.kill();
      now = goal.map((row) => row.slice());
      render();
    }
  }

  draw();
  new ResizeObserver(() => {
    if (Math.abs(Math.min(fig.clientWidth, max) - size) >= 2) draw();
  }).observe(fig);
  return { set, intro };
}
