// TIP-OFF: thousands of real shots from the latest season burst out of the rim onto a court tilted
// in 3D (closest shots land first, threes last). Scrolling lays the court flat; the pointer turns it.
import { sampleShots, season as fmtSeason, STANDARD_LINE } from "../data.js";
import { ParticleField } from "./particles.js";
import { fitCourt, drawCourt } from "./court.js";
import { dur, instant, countTo } from "../motion.js";

// Particle styles shared with the 2nd quarter: index = (three ? 2 : 0) + made
export const SHOT_STYLES = [
  { color: "#3d8ff0", alpha: 0.30, size: 1.7 },   // two, missed
  { color: "#3d8ff0", alpha: 0.95, size: 2.1 },   // two, made
  { color: "#ec5e22", alpha: 0.36, size: 1.7 },   // three, missed
  { color: "#ec5e22", alpha: 1.0, size: 2.2 },    // three, made
];
export const shotStyle = (zone, made) => (zone >= 3 ? 2 : 0) + made;

export function initHero(data) {
  const box = document.getElementById("hero-court");
  const canvas = document.getElementById("hero-canvas");
  const lines = document.getElementById("hero-lines");
  const latest = data.gridSeasons[data.gridSeasons.length - 1];
  const n = window.innerWidth < 900 ? 2600 : 6000;
  const shots = sampleShots(data.gridBySeason.get(latest), n, 11);
  const styles = Uint8Array.from({ length: n }, (_, i) => shotStyle(shots.zone[i], shots.made[i]));
  const field = new ParticleField(canvas, n);
  field.setStyles(SHOT_STYLES);
  let s;
  let tx;
  let ty;

  function layout() {
    s = fitCourt(box.offsetWidth, box.offsetHeight);   // offset sizes ignore the 3D transform
    drawCourt(lines, s);
    field.resize(s.w, s.h);
    tx = Float32Array.from(shots.x, (v) => s.x(v));
    ty = Float32Array.from(shots.y, (v) => s.y(v));
  }
  layout();
  field.place(new Float32Array(n).fill(s.x(0)), new Float32Array(n).fill(s.y(0)), styles);

  // Hero numbers come from the data, not the HTML fallbacks
  const first3pa = data.league.find((d) => d.fg3a_pg != null);
  const last = data.league[data.league.length - 1];
  // Mid-range baseline: the first season with today's arc (in 1996-97 the line was 22 ft)
  const midSeason = d3.min(data.zones.filter((d) => d.season >= STANDARD_LINE), (d) => d.season);
  const midFirst = data.zoneShare(midSeason, "MID").share;
  const midLast = data.zoneShare(last.season, "MID").share;
  const [ledA, ledB] = document.querySelectorAll(".hero-stats .led");
  const [noteA, noteB] = document.querySelectorAll(".hero-stats p");
  noteA.textContent = `threes per team-game, up from ${first3pa.fg3a_pg.toFixed(1)} in ${fmtSeason(first3pa.season)}`;
  noteB.textContent = `of shots from mid-range, down from ${(midFirst * 100).toFixed(1)}% in ${fmtSeason(midSeason)}`;

  gsap.set(box, { yPercent: 26, rotateX: 60, transformOrigin: "50% 85%" });
  gsap.timeline({ scrollTrigger: { trigger: "#tipoff", start: "top top", end: "bottom top", scrub: 0.6 } })
    .to(box, { rotateX: 16, yPercent: 4, scale: 0.84, ease: "none" }, 0)
    .to(".hero-copy", { yPercent: -16, opacity: 0, ease: "none" }, 0)
    .to(".lower-third, .scroll-cue", { y: -50, opacity: 0, ease: "none" }, 0);

  if (!instant) {
    const turn = gsap.quickTo(box, "rotateZ", { duration: 1.4, ease: "power3" });
    const slide = gsap.quickTo(box, "x", { duration: 1.4, ease: "power3" });
    document.getElementById("tipoff").addEventListener("pointermove", (e) => {
      const dx = e.clientX / window.innerWidth - 0.5;
      turn(dx * -5);
      slide(dx * 40);
    });
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { layout(); field.place(tx, ty, styles); }, 150);
  });

  // Wrap each title line in a mask so it can slide up from behind it
  const titleLines = [...document.querySelectorAll("#hero-title > span")];
  titleLines.forEach((span) => {
    const mask = document.createElement("span");
    mask.className = "line-mask";
    span.replaceWith(mask);
    mask.appendChild(span);
  });

  return {
    play() {
      const delays = Float32Array.from({ length: n }, (_, i) =>
        Math.min(1, (Math.hypot(shots.x[i], shots.y[i]) / 30) * 0.8 + Math.random() * 0.2));
      field.morph(tx, ty, styles, { duration: dur(3.4), spread: 0.72, ease: "expo.out", delays });
      countTo(ledA, first3pa.fg3a_pg, last.fg3a_pg, { decimals: 1, duration: 2.4, delay: 0.6 });
      countTo(ledB, midFirst * 100, midLast * 100, { decimals: 1, suffix: "%", duration: 2.4, delay: 0.8 });
      if (instant) return;
      gsap.from(titleLines, { yPercent: 110, duration: 1.4, stagger: 0.12, ease: "expo.out", delay: 0.1 });
      gsap.from(".hero-copy .kicker, .hero-dek, .hero-stats, .lower-third, .scroll-cue", {
        y: 26, opacity: 0, duration: 1.2, stagger: 0.1, delay: 0.5,
      });
    },
  };
}
