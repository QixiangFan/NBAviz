// Ribbon boards: LED tickers like the ones that wrap an arena. One runs along the bottom of the tip-off, a
// courtside board in front of the floor; one runs across the top of halftime with the first half's numbers.
// Every value comes from the data. The boards speed up while the page scrolls and stop when off screen.
import { season as fmtSeason, shiftNumbers } from "../data.js";
import { instant } from "../motion.js";
import { h } from "./steps.js";

const PX_PER_S = 70;   // cruising speed

export function initRibbons(data) {
  const { first, last, midSeason, midFirst, midLast } = shiftNumbers(data);
  const pct = d3.format(".1%");
  // A league stat from the first season it was logged to the latest
  const change = (label, key, fmt, kind) => {
    const a = data.league.find((d) => d[key] != null);
    return { label: `${label} since ${fmtSeason(a.season)}`, value: `${fmt(a[key])} → ${fmt(last[key])}`, kind };
  };
  const midShift = { label: `Mid-range share since ${fmtSeason(midSeason)}`, value: `${pct(midFirst)} → ${pct(midLast)}`, kind: "two" };
  // The first season with more threes than mid-range jumpers (as in the 2nd quarter)
  const threeShare = (s) => data.zoneShare(s, "C3").share + data.zoneShare(s, "AB3").share;
  const crossover = data.gridSeasons.find((s) => s >= midSeason && threeShare(s) > data.zoneShare(s, "MID").share);

  const tweens = [
    ribbon(document.getElementById("hero-ribbon"), [
      change("3PA per team-game", "fg3a_pg", (v) => v.toFixed(1), "three"),
      midShift,
      change("3PT share of shots", "fg3a_rate", pct, "three"),
      change("League 3P%", "fg3_pct", pct, "acc"),
      { label: `Shots charted since ${fmtSeason(data.gridSeasons[0])}`, value: d3.format(",")(data.totalShots) },
    ], 1),
    ribbon(document.getElementById("half-ribbon"), [
      { label: "Halftime report", value: "The shift is real", kind: "three" },
      { label: `3PA per team-game since ${fmtSeason(first.season)}`, value: `${(last.fg3a_pg / first.fg3a_pg).toFixed(1)}×`, kind: "three" },
      crossover && { label: "Threes passed the mid-range", value: fmtSeason(crossover), kind: "three" },
      midShift,
      { label: "Second half", value: "Does volume win?" },
    ].filter(Boolean), -1),
  ].filter(Boolean);
  if (!tweens.length) return;

  // Scrolling pushes the boards faster; they ease back to cruising speed once it stops
  const speed = { v: 1 };
  const apply = () => tweens.forEach((t) => t.timeScale(speed.v));
  ScrollTrigger.create({
    start: 0, end: "max",
    onUpdate: (self) => {
      const boost = 1 + Math.min(5, Math.abs(self.getVelocity()) / 400);
      gsap.to(speed, {
        v: boost, duration: 0.2, overwrite: true, onUpdate: apply,
        onComplete: () => gsap.to(speed, { v: 1, duration: 1.2, ease: "power2.out", onUpdate: apply }),
      });
    },
  });
}

/**
 * Fill a board with items (repeated until one run is wider than the screen), followed by a copy of that run,
 * and scroll it by one run forever: left (direction 1) or right (-1). Returns the tween, or null if static.
 */
function ribbon(el, items, direction) {
  if (!el) return null;
  const run = h("div", { class: "ribbon-run" });
  const add = () => items.forEach((it) => run.append(
    h("span", { class: `ribbon-item${it.kind ? ` ${it.kind}` : ""}` }, h("small", null, it.label), h("b", null, it.value)),
    h("i", { class: "ribbon-sep" })));
  add();
  const track = h("div", { class: "ribbon-track" }, run);
  el.append(track);
  for (let i = 0; i < 6 && run.offsetWidth < Math.max(window.innerWidth, screen.width); i++) add();
  track.append(run.cloneNode(true));
  if (instant) return null;
  const tween = gsap.fromTo(track, { xPercent: direction > 0 ? 0 : -50 }, {
    xPercent: direction > 0 ? -50 : 0, duration: run.offsetWidth / PX_PER_S, ease: "none", repeat: -1, paused: true,
  });
  ScrollTrigger.create({ trigger: el, start: "top bottom", end: "bottom top", animation: tween, toggleActions: "play pause resume pause" });
  return tween;
}
