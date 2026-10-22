// Boot: load the data behind a loader, start the motion system, build every chapter, run the HUD.
// ?shot=<chapter>[:<step>] jumps straight to a chapter state for screenshots, e.g. ?shot=q1:0.6, ?shot=q3:5.
import { loadAll } from "./data.js";
import { initMotion, initSnap, revealText, parallaxCards, scrollToEl, countTo, params, instant, stopScroll, startScroll } from "./motion.js";
import { initHero } from "./viz/hero.js";
import { initTimeline } from "./viz/timeline.js";
import { initShotMap } from "./viz/shotmap.js";
import { initTeams } from "./viz/teams.js";
import { initPlayers, initHalftime } from "./viz/players.js";
import { initScoreboard } from "./viz/scoreboard.js";
import { initRibbons } from "./viz/ribbons.js";
import { initCursor } from "./ui/cursor.js";

async function boot() {
  initMotion();
  if (params.has("shot")) document.documentElement.classList.add("no-loader");
  document.body.classList.add("is-loading");
  stopScroll();
  const label = document.getElementById("loader-label");
  const data = await loadAll((p) => { label.textContent = `Loading the box scores… ${Math.round(p * 100)}%`; });
  // Line breaks for the text reveals depend on the web fonts; give them up to 3 s
  await Promise.race([
    Promise.all(['900 64px "Big Shoulders Display"', '400 16px "Inter"', '700 16px "JetBrains Mono"'].map((f) => document.fonts.load(f))),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  await Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 1500))]);

  const hero = initHero(data);
  const q1 = initTimeline(data);
  const q2 = initShotMap(data);
  initHalftime();
  const q3 = initTeams(data);
  initPlayers(data);
  initScoreboard(data);
  initRibbons(data);
  revealText();
  parallaxCards();
  initHud();
  initCursor();
  initSnap("main > section:not(.scrolly), .scrolly .step");   // a scrolly section starts at its first step
  ScrollTrigger.refresh();

  await hideLoader(data);
  document.body.classList.remove("is-loading");
  startScroll();
  hero.play();
  if (params.has("shot")) deepLink(params.get("shot"), { q1, q2, q3 });
}

async function hideLoader(data) {
  const loader = document.getElementById("loader");
  if (instant) { loader.remove(); return; }
  document.getElementById("loader-label").textContent =
    `${data.gridSeasons.length} seasons of shot charts · ${d3.format(",")(data.teams.length)} team-seasons · ${d3.format(",")(data.players.length)} player-seasons`;
  await Promise.all([
    countTo(document.getElementById("loader-num"), 0, data.totalShots, { duration: 1.6, format: (v) => d3.format(",")(Math.round(v)) }),
    shoot(1.6),
  ]);
  await gsap.to(loader, { yPercent: -100, duration: 1.1, ease: "expo.inOut", delay: 0.35 });
  loader.remove();
}

/** The loader's ball flies along the dotted arc while the shots count up, then drops through the net. */
function shoot(duration) {
  const ball = document.getElementById("loader-ball");
  const rim = document.getElementById("loader-rim");
  // The arc is the quadratic curve (10,100) → (100,-40) → (190,100): x moves at a steady speed, y as a
  // parabola, like a real shot. Backspin turns the ball the other way.
  const at = (t) => [10 + 180 * t, (1 - t) ** 2 * 100 - 2 * (1 - t) * t * 40 + t * t * 100];
  const place = (x, y, turn) => ball.setAttribute("transform", `translate(${x} ${y}) rotate(${turn})`);
  const flight = { t: 0, drop: 0 };
  return gsap.timeline()
    .to(flight, { t: 1, duration, ease: "none", onUpdate: () => place(...at(flight.t), -540 * flight.t) })
    .call(() => rim.classList.add("hit"))
    .to(flight, { drop: 1, duration: 0.3, ease: "power2.in", onUpdate: () => place(190, 100 + 20 * flight.drop, -540) })
    .to(ball, { opacity: 0, duration: 0.15 }, "<0.15")
    .fromTo("#loader-net", { scaleY: 1 }, { scaleY: 1.35, duration: 0.14, yoyo: true, repeat: 1, ease: "power1.out", transformOrigin: "50% 0%" }, "<-0.1");
}

/** Period nav, game clock (whole page) and shot clock (24 → 0 inside each section). */
function initHud() {
  const links = [...document.querySelectorAll(".hud-periods a")];
  document.querySelectorAll("[data-goto]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    scrollToEl(document.getElementById(a.dataset.goto));
  }));
  const bar = document.getElementById("game-clock-bar");
  ScrollTrigger.create({ start: 0, end: "max", onUpdate: (self) => gsap.set(bar, { scaleX: self.progress }) });
  const clock = document.getElementById("shot-clock");
  document.querySelectorAll("[data-period]").forEach((section) => {
    ScrollTrigger.create({
      trigger: section, start: section.id === "tipoff" ? "top top" : "top 50%", end: "bottom 50%",
      onToggle: (self) => {
        if (!self.isActive) return;
        links.forEach((a) => a.classList.toggle("active", a.dataset.goto === section.dataset.period));
      },
      onUpdate: (self) => {
        const secs = Math.max(0, Math.ceil(24 * (1 - self.progress)));
        clock.textContent = String(secs).padStart(2, "0");
        clock.parentElement.classList.toggle("low", secs <= 5);
      },
    });
  });
}

/** Jump to a chapter state without animation (for screenshots and deep links). */
function deepLink(spec, chapters) {
  const [id, arg] = spec.split(":");
  let y;
  if (id === "q1" && arg != null) {
    const st = chapters.q1.trigger;
    y = st.start + (st.end - st.start) * Number(arg);
  } else if (chapters[id]?.stepEl && arg != null) {
    const el = chapters[id].stepEl(Number(arg));
    y = el.getBoundingClientRect().top + window.scrollY;
  } else {
    const el = document.getElementById(id === "q4" ? "q4-players" : id);
    y = el.getBoundingClientRect().top + window.scrollY;
  }
  window.scrollTo(0, y);
  ScrollTrigger.update();
}

boot().catch((err) => {
  console.error(err);
  const label = document.getElementById("loader-label");
  if (label) label.textContent = "Could not load the data. Serve the project folder (python -m http.server) and open /web/.";
});
