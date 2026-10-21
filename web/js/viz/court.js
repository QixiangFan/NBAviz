// Half-court geometry in feet, to NBA dimensions: hoop at the origin (63 in from the baseline,
// 15 in in front of the backboard), baseline at y = -5.25, half court at y = 41.75.
// Drawn with the hoop at the top. Shared by the tip-off court and the 2nd quarter.

export const COURT = { left: -25, right: 25, baseline: -5.25, halfcourt: 41.75, board: -1.25 };
const W = COURT.right - COURT.left;
const H = COURT.halfcourt - COURT.baseline;

/** Fit the half court, centered, into a w × h box. Returns feet -> pixel mappers. */
export function fitCourt(w, h, pad = 0) {
  const k = Math.min((w - 2 * pad) / W, (h - 2 * pad) / H);
  const ox = (w - W * k) / 2;
  const oy = (h - H * k) / 2;
  return {
    k, ox, oy, w, h, width: W * k, height: H * k,
    x: (ft) => ox + (ft - COURT.left) * k,
    y: (ft) => oy + (ft - COURT.baseline) * k,
  };
}

/** Seams of a basketball of radius r centered on the origin, as SVG path data. */
export const ballSeams = (r) => `M${-r},0H${r}M0,${-r}V${r}`
  + `M${-r * 0.72},${-r * 0.69}C${-r * 0.22},${-r * 0.3} ${-r * 0.22},${r * 0.3} ${-r * 0.72},${r * 0.69}`
  + `M${r * 0.72},${-r * 0.69}C${r * 0.22},${-r * 0.3} ${r * 0.22},${r * 0.3} ${r * 0.72},${r * 0.69}`;

/**
 * Court lines into an <svg>. shortLine draws the uniform 22 ft arc of 1994-95 to 1996-97. paint stains
 * the floor under the lines: darker inside the arc, darkest in the lane and the two circles.
 */
export function drawCourt(svgEl, s, { shortLine = false, paint = false } = {}) {
  const svg = d3.select(svgEl).attr("width", s.w).attr("height", s.h).attr("viewBox", `0 0 ${s.w} ${s.h}`);
  svg.selectAll("*").remove();
  const line = d3.line().x((p) => s.x(p[0])).y((p) => s.y(p[1]));
  const arc = (cx, cy, r, a0, a1, n = 72) => d3.range(n + 1).map((i) => {
    const a = a0 + ((a1 - a0) * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });
  const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  // 3-point line: corner lines up from the baseline, joined by the arc
  let three;
  if (shortLine) {
    three = [[22, COURT.baseline], ...arc(0, 0, 22, 0, Math.PI), [-22, COURT.baseline]];
  } else {
    const top = Math.sqrt(23.75 ** 2 - 22 ** 2);
    const a0 = Math.atan2(top, 22);
    three = [[22, COURT.baseline], ...arc(0, 0, 23.75, a0, Math.PI - a0), [-22, COURT.baseline]];
  }
  const ftCircle = arc(0, 13.75, 6, 0, Math.PI);
  const centerCircle = arc(0, COURT.halfcourt, 6, Math.PI, 2 * Math.PI);
  if (paint) {
    const stain = svg.append("g").attr("class", "paint");
    stain.append("path").attr("class", "inside-arc").attr("d", `${line(three)}Z`);
    stain.selectAll("path.spot").data([box(-8, COURT.baseline, 8, 13.75), ftCircle, centerCircle]).join("path")
      .attr("class", "spot").attr("d", (p) => `${line(p)}Z`);
  }
  const paths = [
    box(COURT.left, COURT.baseline, COURT.right, COURT.halfcourt),
    box(-8, COURT.baseline, 8, 13.75),                        // lane, free-throw line 15 ft from the board
    box(-6, COURT.baseline, 6, 13.75),
    ftCircle,                                                 // free-throw circle
    [[-4, COURT.board], ...arc(0, 0, 4, Math.PI, 0), [4, COURT.board]],   // restricted area
    centerCircle,
    three,
  ];
  svg.append("g").selectAll("path").data(paths).join("path").attr("d", line);
  drawHoop(svg, s);
  return svg;
}

/** The basket seen from above: 6 ft backboard, the neck holding the rim, the net, and an 18 in rim. */
function drawHoop(svg, s) {
  const g = svg.append("g").attr("class", "hoop");
  const px = (ft) => ft * s.k;
  const board = Math.max(2, px(0.2));
  g.append("rect").attr("x", s.x(-3)).attr("y", s.y(COURT.board) - board).attr("width", px(6)).attr("height", board)
    .attr("rx", board / 2).style("fill", "var(--ink-2)");
  g.append("rect").attr("x", s.x(-0.25)).attr("y", s.y(COURT.board)).attr("width", px(0.5)).attr("height", px(0.5))
    .style("fill", "var(--ink-2)").style("opacity", 0.7);
  // Net: a diamond mesh narrowing from the rim to its bottom opening (skipped when too small to read)
  if (px(0.75) >= 10) {
    const n = 14;
    const pt = (r, a) => [s.x(r * Math.cos(a)), s.y(r * Math.sin(a))];
    const d = d3.range(n).map((i) => {
      const a = (2 * Math.PI * i) / n;
      const da = Math.PI / n;
      return `M${pt(0.45, a - da)}L${pt(0.75, a)}L${pt(0.45, a + da)}`;
    }).join("");
    g.append("path").attr("d", d).style("fill", "none").style("stroke", "var(--ink-2)").style("stroke-width", 0.8).style("opacity", 0.55);
    g.append("circle").attr("cx", s.x(0)).attr("cy", s.y(0)).attr("r", px(0.45))
      .style("fill", "none").style("stroke", "var(--ink-2)").style("stroke-width", 0.8).style("opacity", 0.55);
  }
  g.append("circle").attr("cx", s.x(0)).attr("cy", s.y(0)).attr("r", px(0.75))
    .style("fill", "none").style("stroke", "var(--three)").style("stroke-width", Math.max(1.5, px(0.07)))
    .style("filter", "drop-shadow(0 0 6px var(--three))");
}
