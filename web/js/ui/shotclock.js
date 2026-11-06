// The HUD shot clock, drawn like the one on top of the backboard: three seven-segment LED digits (tens,
// ones, tenths) with the unlit segments faintly visible. A jump in the reading (a snap to the next step,
// a fast scroll) runs through every tenth in between instead of skipping to the new number.
import { instant } from "../motion.js";

const NS = "http://www.w3.org/2000/svg";
// Segments a-g in a 12 x 20 cell: hexagonal bars, 2 units thick
const hBar = (y, x1 = 1.5, x2 = 10.5) => `${x1},${y} ${x1 + 1},${y - 1} ${x2 - 1},${y - 1} ${x2},${y} ${x2 - 1},${y + 1} ${x1 + 1},${y + 1}`;
const vBar = (x, y1, y2) => `${x},${y1} ${x + 1},${y1 + 1} ${x + 1},${y2 - 1} ${x},${y2} ${x - 1},${y2 - 1} ${x - 1},${y1 + 1}`;
const SEGMENTS = [hBar(1), vBar(11, 1.5, 9.5), vBar(11, 10.5, 18.5), hBar(19), vBar(1, 10.5, 18.5), vBar(1, 1.5, 9.5), hBar(10)];
const GLYPHS = { " ": "", 0: "abcdef", 1: "bc", 2: "abdeg", 3: "abcdg", 4: "bcfg", 5: "acdfg", 6: "acdefg", 7: "abc", 8: "abcdefg", 9: "abcdfg" };

function digit() {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "sc-digit");
  svg.setAttribute("viewBox", "0 0 12 20");
  const segs = SEGMENTS.map((points) => {
    const p = document.createElementNS(NS, "polygon");
    p.setAttribute("points", points);
    svg.append(p);
    return p;
  });
  return { svg, show: (ch) => segs.forEach((p, i) => p.classList.toggle("on", GLYPHS[ch].includes("abcdefg"[i]))) };
}

/** Builds the LED face inside `face`. Returns run(seconds), which counts to a reading, and set(seconds), which jumps (a reset). */
export function initShotClock(face, total = 24) {
  const housing = face.closest(".shot-clock");
  const [tens, ones, tenths] = [digit(), digit(), digit()];
  const dp = document.createElement("span");
  dp.className = "sc-dp";
  face.replaceChildren(tens.svg, ones.svg, dp, tenths.svg);

  const state = { v: total };
  let shown = -1;   // tenths of a second on the face
  const draw = () => {
    const t = Math.max(0, Math.ceil(state.v * 10 - 1e-6));   // like the real clock: 0.0 only once time is up
    if (t === shown) return;
    shown = t;
    const whole = Math.floor(t / 10);
    tens.show(whole >= 10 ? String(Math.floor(whole / 10)) : " ");   // no leading zero
    ones.show(String(whole % 10));
    tenths.show(String(t % 10));
    housing.classList.toggle("low", t <= 50);
    housing.classList.toggle("expired", t === 0);
  };

  // The face chases the reading frame by frame: at least a tenth per frame, so a small jump shows every
  // tenth in between, and 12% of the gap per frame (at 60 fps), so it never trails the scroll for long.
  let target = total;
  const chase = () => {
    const gap = target - state.v;
    const step = Math.max(0.1, Math.abs(gap) * (1 - 0.88 ** gsap.ticker.deltaRatio(60)));
    state.v = Math.abs(gap) <= step ? target : state.v + Math.sign(gap) * step;
    draw();
    if (state.v === target) gsap.ticker.remove(chase);
  };
  const set = (secs) => {
    gsap.ticker.remove(chase);
    target = state.v = secs;
    draw();
  };
  const run = (secs) => {
    if (instant) return set(secs);
    target = secs;
    gsap.ticker.add(chase);   // re-adding a listener does not duplicate it
  };
  set(total);
  return { run, set };
}
