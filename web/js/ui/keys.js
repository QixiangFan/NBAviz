// Keyboard: steps through the story, jumps between chapters, and lists its keys behind "?".
//   ↓ / J, ↑ / K   next and previous stop: the snap's resting places, plus each rule change in the Q1 scrub,
//                  never more than a screen at a time (so nothing in a tall section is skipped)
//   0 1 2 H 3 4 F  the chapters, as the HUD names them
//   T              pick your team
//   ?              the list of keys
// Keys typed into a field, or already handled by a focused chart (it calls preventDefault), never reach these.
// Two skip links come first in the tab order: one past the HUD into the story, one to the list.
import { blocks, scrollTarget, scrollToY, scrollLimit, stopScroll, startScroll } from "../motion.js";
import { openTeamPicker } from "./team.js";
import { h } from "../viz/steps.js";

const CHAPTERS = { 0: "tipoff", 1: "q1", 2: "q2", h: "half", 3: "q3", 4: "q4", f: "final" };
const TYPING = "input, select, textarea, [contenteditable]";
const KEYS = [
  [["↓", "J"], "Next stop in the story"],
  [["↑", "K"], "Previous stop"],
  [["Space"], "Down a screen (Shift: up)"],
  [["0", "1", "2", "H", "3", "4", "F"], "Tip-off, Q1, Q2, Halftime, Q3, Q4, Final"],
  [["T"], "Pick your team"],
  [["Tab"], "Next button, chart or control"],
  [["←", "→"], "On a chart: step through the seasons, or a radar’s spokes"],
  [["Enter"], "On an MVP: put them in the duel"],
  [["Esc"], "Close a panel, or this list"],
  [["?"], "Show this list"],
];

/** extraStops(): more scroll positions for the story steps (the Q1 scrub's events). */
export function initKeys({ extraStops = () => [] } = {}) {
  const dialog = helpDialog();
  const openHelp = () => { stopScroll(); dialog.showModal(); };
  skipLinks(openHelp);

  function stops() {
    const all = [...blocks().rests, ...extraStops()].map(Math.round).sort((a, b) => a - b);
    return all.filter((y, i) => i === 0 || y - all[i - 1] > 4);
  }
  function step(dir) {
    const y = scrollTarget();
    const vh = window.innerHeight;
    const list = dir > 0 ? stops() : stops().reverse();
    const next = list.find((s) => dir * (s - y) > 4);
    if (next == null) scrollToY(dir > 0 ? scrollLimit() : 0);
    else scrollToY(Math.abs(next - y) > vh + 4 ? y + dir * 0.85 * vh : next);
  }

  addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || document.body.classList.contains("is-loading")) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (dialog.open) {   // Escape closes it natively; so does "?" again
      if (k === "?") { e.preventDefault(); dialog.close(); }
      return;
    }
    if (e.target.closest?.(TYPING) || e.target.closest?.(".team-picker")) return;
    const act = {
      "?": openHelp,
      ArrowDown: () => step(1), j: () => step(1),
      ArrowUp: () => step(-1), k: () => step(-1),
      t: () => openTeamPicker(document.activeElement !== document.body ? document.activeElement : undefined),
    }[k] ?? (CHAPTERS[k] && (() => document.querySelector(`.hud-periods a[data-goto="${CHAPTERS[k]}"]`)?.click()));
    if (!act) return;
    e.preventDefault();
    act();
  });

  function helpDialog() {
    const el = h("dialog", { class: "keys-help", "aria-labelledby": "keys-title" },
      h("div", { class: "keys-body" },
        h("h2", { id: "keys-title" }, "Keyboard"),
        h("dl", null, KEYS.flatMap(([keys, what]) => [h("dt", null, keys.map((k) => h("kbd", null, k))), h("dd", null, what)])),
        h("form", { method: "dialog" }, h("button", { class: "btn" }, "Close"))));
    document.body.append(el);
    el.addEventListener("close", startScroll);
    el.addEventListener("click", (e) => { if (e.target === el) el.close(); });   // a click on the backdrop
    return el;
  }
}

function skipLinks(openHelp) {
  const story = h("a", { class: "skip-link", href: "#tipoff" }, "Skip to the story");
  const keys = h("button", { class: "skip-link", type: "button" }, "Keyboard shortcuts ", h("kbd", null, "?"));
  story.addEventListener("click", (e) => {
    e.preventDefault();
    const main = document.querySelector("main");
    main.setAttribute("tabindex", "-1");
    main.focus({ preventScroll: true });
  });
  keys.addEventListener("click", openHelp);
  document.body.prepend(h("nav", { class: "skip-links", "aria-label": "Skip links" }, story, keys));
}
