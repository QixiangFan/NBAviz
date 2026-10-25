// Motion system: Lenis smooth scrolling driving GSAP ScrollTrigger, text reveals, counters.
// ?shot=<chapter>:<step> (screenshots) and prefers-reduced-motion both make every animation instant.

export const params = new URLSearchParams(location.search);
export const shotMode = params.has("shot");
export const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches || params.has("static");
export const instant = shotMode || reduceMotion;

/** Duration helper: every animation goes through it so instant mode is one switch. */
export const dur = (seconds) => (instant ? 0 : seconds);

let lenis = null;

export function initMotion() {
  gsap.registerPlugin(ScrollTrigger, SplitText);
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
  if (lenis) lenis.scrollTo(el, { offset, duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
  else window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY + offset);
}

/**
 * Soft page snapping. Each element matching selector starts a block. When scrolling comes to rest
 * with a boundary between two blocks on screen, glide to the nearest clean position: a block's top
 * at the top of the screen, or a tall block's bottom at the bottom. The aim leans 30% of a screen
 * the way the reader was going, so crossing a fifth of the way into the next block carries on to it.
 * Inside a block taller than the screen (the Q1 scrub, long sections) scrolling stays free.
 */
export function initSnap(selector) {
  if (!lenis) return;
  let timer = 0;
  let dir = 1;
  let touching = false;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(settle, 10); };
  lenis.on("scroll", (l) => { if (l.direction) dir = l.direction; schedule(); });
  addEventListener("touchstart", () => { touching = true; clearTimeout(timer); }, { passive: true });
  ["touchend", "touchcancel"].forEach((type) => addEventListener(type, () => { touching = false; schedule(); }, { passive: true }));

  function settle() {
    if (touching || lenis.isStopped) return;
    if (lenis.isScrolling === "smooth") return schedule();   // wait for the glide to finish, not just the next frame
    const y = window.scrollY;
    const vh = window.innerHeight;
    const tops = [...document.querySelectorAll(selector)].map((el) => el.getBoundingClientRect().top + y).sort((a, b) => a - b);
    if (!tops.some((t) => t > y + 2 && t < y + vh - 2)) return;
    const ends = [...tops.slice(1), document.documentElement.scrollHeight];
    const rests = tops.flatMap((t, i) => (ends[i] - t > vh ? [t, ends[i] - vh] : [t]))
      .map((r) => Math.min(Math.max(r, 0), lenis.limit));
    const aim = y + dir * 0.3 * vh;
    const target = rests.reduce((a, r) => (Math.abs(r - aim) < Math.abs(a - aim) ? r : a));
    if (Math.abs(target - y) > 2) lenis.scrollTo(target, { duration: 0.3, easing: (t) => 1 - Math.pow(1 - t, 3) });
  }
}

/** Headlines and leads slide up line by line from behind a mask when they enter the viewport.
 *  autoSplit re-splits the lines once the web fonts load and whenever the width changes. */
export function revealText(root = document) {
  if (instant) return;
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

/** Count a number up (or down) inside an element. */
export function countTo(el, from, to, { decimals = 1, suffix = "", duration = 1.6, delay = 0, format = null } = {}) {
  const fmt = format || ((v) => `${v.toFixed(decimals)}${suffix}`);
  const state = { v: from };
  el.textContent = fmt(instant ? to : from);
  if (instant) return Promise.resolve();
  return new Promise((done) => gsap.to(state, {
    v: to, duration, delay, ease: "power2.out", onUpdate: () => { el.textContent = fmt(state.v); }, onComplete: done,
  }));
}
