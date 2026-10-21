// A basketball jersey seen from the back, as SVG: the body in the team's main color, trim on the collar,
// armholes and side panels, the surname arched across the shoulders and the number below it. Names and
// numbers come from the data, so they are written with textContent only.

const NS = "http://www.w3.org/2000/svg";
// Tank top in a 200 x 230 box: straps at the top, armholes curving out to the sides, a curved hem
const BODY = "M62,8 Q100,24 138,8 L160,10 C162,46 172,68 188,78 L188,212 Q100,226 12,212 L12,78 C28,68 38,46 40,10 Z";
const BINDING = "M12,78 C28,68 38,46 40,10 L62,8 Q100,24 138,8 L160,10 C162,46 172,68 188,78";
const NAME_ARC = "M44,66 Q100,50 156,66";
let count = 0;   // gradient, clip and arc ids must be unique on the page

function add(parent, tag, attrs = {}) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent.appendChild(node);
  return node;
}

/**
 * jersey({ primary, secondary, ink, number, name, label }) → <svg>. primary is the body, secondary the
 * trim, ink the lettering; number and name may be empty. With a label the jersey is an image for screen
 * readers, without one it is decoration.
 */
export function jersey({ primary, secondary, ink, number = "", name = "", label = null }) {
  const id = `jersey-${++count}`;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 200 230");
  svg.setAttribute("class", "jersey");
  if (label) {
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
  } else {
    svg.setAttribute("aria-hidden", "true");
  }

  const defs = add(svg, "defs");
  add(add(defs, "clipPath", { id: `${id}-body` }), "path", { d: BODY });
  add(defs, "path", { id: `${id}-arc`, d: NAME_ARC });
  const mesh = add(defs, "pattern", { id: `${id}-mesh`, width: 4, height: 4, patternUnits: "userSpaceOnUse" });
  add(mesh, "circle", { cx: 2, cy: 2, r: 0.8, fill: "#000", "fill-opacity": 0.18 });
  const shade = add(defs, "linearGradient", { id: `${id}-shade` });   // darker at the sides, so it looks round
  [[0, 0.32], [0.24, 0], [0.76, 0], [1, 0.32]].forEach(([offset, a]) =>
    add(shade, "stop", { offset, "stop-color": "#000", "stop-opacity": a }));
  const shine = add(defs, "radialGradient", { id: `${id}-shine`, cx: 0.5, cy: 0.05, r: 0.7 });
  [[0, 0.2], [1, 0]].forEach(([offset, a]) => add(shine, "stop", { offset, "stop-color": "#fff", "stop-opacity": a }));

  // Cloth, clipped to the body: fill, side panels, binding (only its inner half shows), mesh and light
  const cloth = add(svg, "g", { "clip-path": `url(#${id}-body)` });
  add(cloth, "path", { d: BODY }).style.fill = primary;
  for (const x of [12, 179]) add(cloth, "rect", { x, y: 70, width: 9, height: 160 }).style.fill = secondary;
  Object.assign(add(cloth, "path", { d: BINDING }).style, { fill: "none", stroke: secondary, strokeWidth: 9, strokeLinejoin: "round" });
  for (const fill of [`url(#${id}-mesh)`, `url(#${id}-shade)`, `url(#${id}-shine)`]) {
    add(cloth, "rect", { width: 200, height: 230 }).style.fill = fill;
  }
  add(svg, "path", { class: "jersey-edge", d: BODY });   // a faint rim, so black jerseys show on the dark page

  if (name) {
    const text = add(svg, "text", { class: "jersey-name" });
    const upper = name.toUpperCase();
    text.style.fill = ink;
    text.style.fontSize = `${Math.min(17, 104 / (0.56 * upper.length)).toFixed(1)}px`;   // long names shrink to fit
    add(text, "textPath", { href: `#${id}-arc`, startOffset: "50%", "text-anchor": "middle" }).textContent = upper;
  }
  if (number) {
    const num = add(svg, "text", { class: "jersey-number", x: 100, y: 172, "text-anchor": "middle" });
    Object.assign(num.style, { fill: ink, stroke: secondary === ink ? "none" : secondary });
    num.textContent = number;
  }
  return svg;
}
