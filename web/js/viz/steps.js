// Scrollytelling steps: build the text cards, and activate one at a time as it crosses the
// screen's middle. Content is built from DOM nodes (h), so names from the data never touch innerHTML.
// The bold figures in a card count up from zero the first time it becomes active.
import { countTo, instant } from "../motion.js";

// A bold figure: an optional "r = ", a sign, digits, an optional %. Seasons ("1996-97") don't match.
const FIGURE = /^(r = )?([−-]?)(\d+(?:\.\d+)?)(%?)$/;

/** h("p", { class: "x" }, "text", h("strong", null, "bold")) */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
  return el;
}
export const b = (text) => h("strong", null, text);
export const key = (kind) => h("i", { class: `key ${kind}` });

/**
 * steps: [{ num, title, body: [nodes] }]. onStep(index, previousIndex) runs whenever the active
 * step changes, in either scroll direction.
 */
export function setupSteps(container, steps, onStep) {
  const els = steps.map((st, i) => {
    const el = h("div", { class: "step", "data-step": i },
      h("div", { class: "step-card" },
        h("p", { class: "step-num" }, st.num),
        h("h3", null, st.title),
        ...st.body));
    container.appendChild(el);
    return el;
  });
  const counts = els.map(figures);
  let active = -1;
  function activate(i) {
    if (i === active) return;
    const prev = active;
    active = i;
    els.forEach((el, j) => el.classList.toggle("is-active", j === i));
    counts[i].forEach((count) => count());
    counts[i] = [];
    onStep(i, prev);
  }
  els.forEach((el, i) => ScrollTrigger.create({
    trigger: el, start: "top 60%", end: "bottom 60%",
    onToggle: (self) => { if (self.isActive) activate(i); },
  }));
  return { els, activate, get active() { return active; } };
}

/** The bold figures in a step, each set to zero, with a function that counts it back up to its value. */
function figures(step) {
  if (instant) return [];
  return [...step.querySelectorAll("strong")].flatMap((el) => {
    const m = el.textContent.match(FIGURE);
    if (!m) return [];
    const [, prefix = "", sign, digits, suffix] = m;
    const decimals = (digits.split(".")[1] || "").length;
    const format = (v) => `${prefix}${sign}${v.toFixed(decimals)}${suffix}`;
    el.textContent = format(0);
    return [() => countTo(el, 0, Number(digits), { duration: 1.1, format })];
  });
}
