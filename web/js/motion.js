// Motion system: Lenis smooth scrolling driving GSAP ScrollTrigger, text reveals, counters.
// ?shot=<chapter>:<step> (screenshots) and prefers-reduced-motion both make every animation instant.

export const params = new URLSearchParams(location.search);
export const shotMode = params.has("shot");
export const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches || params.has("static");
export const instant = shotMode || reduceMotion;
document.documentElement.classList.toggle("instant", instant);   // CSS holds looping decoration still

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
 *
 * "At rest" means Lenis is idle, or its smooth scroll is within 10 px of where it will stop (the lerp
 * tail crawls on for most of a second); native scrolling (touch, scrollbar) is idle 400 ms after its
 * last event. A plain debounce is not enough: Lenis emits once per frame, so a short timer fires between
 * frames, mid-scroll. The snap's own glide is not the reader's scroll: its events are ignored (they
 * would read as a change of direction), and any wheel, key or touch hands control back to the reader.
 */
export function initSnap(selector) {
  if (!lenis) return;
  let timer = 0;
  let dir = 1;
  let touching = false;
  let gliding = false;
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
