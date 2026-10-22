// Motion system: Lenis smooth scrolling driving GSAP ScrollTrigger, text reveals, counters, parallax.
// ?shot=<chapter>:<step> (screenshots) and prefers-reduced-motion both make every animation instant.

export const params = new URLSearchParams(location.search);
export const shotMode = params.has("shot");
export const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches || params.has("static");
export const instant = shotMode || reduceMotion;
document.documentElement.classList.toggle("instant", instant);   // CSS holds looping decoration still

/** Duration helper: every animation goes through it so instant mode is one switch. */
export const dur = (seconds) => (instant ? 0 : seconds);

let lenis = null;
// A scripted glide (a jump from the nav or a snap) is running. Lenis moves its target along with a scripted
// scroll, so it looks at rest to the snap; this flag keeps the snap out until the glide ends or the reader
// takes over (wheel, key or touch).
let gliding = false;

export function initMotion() {
  gsap.registerPlugin(ScrollTrigger, SplitText, ScrambleTextPlugin);
  gsap.defaults({ ease: "power3.out" });
  if (instant) return;
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95, smoothWheel: true });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);
}

export function stopScroll() { lenis?.stop(); }
export function startScroll() { lenis?.start(); }

/** Scroll to an element (smoothly when motion is on). */
export function scrollToEl(el, offset = 0) {
  if (!el) return;
  if (lenis && !lenis.isStopped) {
    gliding = true;
    lenis.scrollTo(el, { offset, duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4), onComplete: () => { gliding = false; } });
  } else {
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + offset);
  }
}

/**
 * Soft page snapping. Each element matching selector starts a block. When scrolling comes to rest
 * with a boundary between two blocks on screen, glide to the nearest clean position: a block's top
 * at the top of the screen, or a tall block's bottom at the bottom. The aim leans 30% of a screen
 * the way the reader was going, so crossing a fifth of the way into the next block carries on to it.
 * Inside a block taller than the screen (the Q1 scrub, long sections) scrolling stays free.
 *
 * "At rest" means Lenis is idle, or its smooth scroll is within 10 px of where it will stop (the lerp
 * tail crawls on for most of a second); native scrolling (touch, scrollbar) is idle 400 ms after its
 * last event. A plain debounce is not enough: Lenis emits once per frame, so a short timer fires between
 * frames, mid-scroll. Scripted glides (the snap's own, or a jump from the nav) are not the reader's
 * scroll: their events are ignored (they would read as a change of direction, or as rest), and any
 * wheel, key or touch hands control back to the reader.
 */
export function initSnap(selector) {
  if (!lenis) return;
  let timer = 0;
  let dir = 1;
  let touching = false;
  const moving = () => lenis.isScrolling === "native"
    || (lenis.isScrolling === "smooth" && Math.abs(lenis.targetScroll - lenis.animatedScroll) > 10);
  const cancel = () => { clearTimeout(timer); timer = 0; };
  const schedule = () => { cancel(); timer = setTimeout(settle, 60); };
  lenis.on("scroll", (l) => {
    if (gliding) return;
    if (l.direction) dir = l.direction;
    if (moving()) cancel();
    else if (!timer) schedule();
  });
  const reader = () => { gliding = false; };
  addEventListener("wheel", reader, { passive: true });
  addEventListener("keydown", reader);
  addEventListener("touchstart", () => { reader(); touching = true; cancel(); }, { passive: true });
  ["touchend", "touchcancel"].forEach((type) => addEventListener(type, () => { touching = false; schedule(); }, { passive: true }));

  function settle() {
    timer = 0;
    if (touching || gliding || lenis.isStopped || moving()) return;
    const y = lenis.targetScroll;   // where the reader's scroll stops
    const vh = window.innerHeight;
    const tops = [...document.querySelectorAll(selector)].map((el) => el.getBoundingClientRect().top + window.scrollY).sort((a, b) => a - b);
    if (!tops.some((t) => t > y + 2 && t < y + vh - 2)) return;
    const ends = [...tops.slice(1), document.documentElement.scrollHeight];
    const rests = tops.flatMap((t, i) => (ends[i] - t > vh ? [t, ends[i] - vh] : [t]))
      .map((r) => Math.min(Math.max(r, 0), lenis.limit));
    const aim = y + dir * 0.3 * vh;
    const target = rests.reduce((a, r) => (Math.abs(r - aim) < Math.abs(a - aim) ? r : a));
    if (Math.abs(target - y) <= 2) return;
    gliding = true;
    lenis.scrollTo(target, { duration: 0.35, easing: (t) => 1 - Math.pow(1 - t, 3), onComplete: () => { gliding = false; } });
  }
}

/** Headlines and leads slide up line by line from behind a mask when they enter the viewport.
 *  autoSplit re-splits the lines once the web fonts load and whenever the width changes.
 *  Period labels flicker through random letters first, like a scoreboard powering on. */
export function revealText(root = document) {
  if (instant) return;
  root.querySelectorAll(".period-label").forEach((el) => {
    const text = el.textContent;
    ScrollTrigger.create({ trigger: el, start: "top 88%", once: true, onEnter: () => scramble(el, text, { duration: 1 }) });
  });
  const targets = root.querySelectorAll(".chapter-title, .final-title, .chapter-lead, .final-sub");
  targets.forEach((el) => {
    let played = false;
    SplitText.create(el, {
      type: "lines", mask: "lines", linesClass: "split-line", autoSplit: true,
      onSplit: (self) => {
        if (played) return null;
        return gsap.from(self.lines, {
          yPercent: 110, duration: 1.2, stagger: 0.09, ease: "expo.out",
          scrollTrigger: { trigger: el, start: "top 85%", once: true, onEnter: () => { played = true; } },
        });
      },
    });
  });
}

/**
 * Chapter title cards: while a card scrolls past, its giant quarter number and its center circle drift
 * at their own speeds and the circle turns a little. Both are pseudo-elements, so GSAP drives the CSS
 * variables they read. The number also swells in the first time the card arrives.
 */
export function parallaxCards() {
  if (instant) return;
  document.querySelectorAll(".chapter-card").forEach((card) => {
    gsap.fromTo(card, { "--num-y": "14vh", "--circle-y": "-8vh", "--circle-turn": "-14deg" }, {
      "--num-y": "-14vh", "--circle-y": "8vh", "--circle-turn": "14deg", ease: "none",
      scrollTrigger: { trigger: card, start: "top bottom", end: "bottom top", scrub: true },
    });
    gsap.fromTo(card, { "--num-scale": 0.85, "--num-o": 0 }, {
      "--num-scale": 1, "--num-o": 1, duration: 1.6, ease: "expo.out",
      scrollTrigger: { trigger: card, start: "top 70%", once: true },
    });
  });
}

/** Scramble an element's text into `text` through random characters. Resolves once it settles. */
export function scramble(el, text, { duration = 0.8, chars = "upperCase", delay = 0 } = {}) {
  if (instant) { el.textContent = text; return Promise.resolve(); }
  return new Promise((done) => gsap.to(el, {
    duration, delay, ease: "none", overwrite: "auto", onComplete: done,
    scrambleText: { text, chars, speed: 0.6, revealDelay: duration * 0.35 },
  }));
}

const counting = new WeakMap();   // element → its running count, which a new count replaces

/** Count a number up (or down) inside an element. */
export function countTo(el, from, to, { decimals = 1, suffix = "", duration = 1.6, delay = 0, format = null } = {}) {
  const fmt = format || ((v) => `${v.toFixed(decimals)}${suffix}`);
  const state = { v: from };
  counting.get(el)?.kill();
  el.textContent = fmt(instant ? to : from);
  if (instant) return Promise.resolve();
  return new Promise((done) => counting.set(el, gsap.to(state, {
    v: to, duration, delay, ease: "power2.out", onUpdate: () => { el.textContent = fmt(state.v); }, onComplete: done,
  })));
}
