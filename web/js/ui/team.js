// Your team: the reader can pick a favorite team from the HUD (or the 3rd quarter's first card), and the
// 3rd quarter, the MVP hall and the duel pick it out from then on. The pick is kept in this browser;
// ?team=NYK sets it from the URL. Screenshot links (?shot=) only use ?team=, so a capture never depends
// on what a browser has stored.
import { dur, params, shotMode } from "../motion.js";
import { h } from "../viz/steps.js";

const KEY = "nbaviz-team";
const listeners = [];
let current = null;   // franchise id (team_id), or null
let open = null;      // opens the picker, once it is built

export const getTeam = () => current;
/** fn(teamId) runs whenever the reader picks a team, or none (null). */
export const onTeam = (fn) => { listeners.push(fn); };
/** Open the picker; focus goes back to `from` when it closes. */
export const openTeamPicker = (from) => open?.(from);

export function setTeam(id) {
  if (id === current) return;
  current = id;
  try {
    if (id == null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, String(id));
  } catch { /* storage blocked: the pick lasts for this visit */ }
  listeners.forEach((fn) => fn(id));
}

/** The HUD chip and the logo grid it opens. Runs before the chapters, so they start out with the stored team. */
export function initTeamPicker(data) {
  const teams = data.teams.filter((d) => d.season === data.lastSeason).sort((a, c) => d3.ascending(a.team_name, c.team_name));
  if (params.has("team")) {
    current = teams.find((d) => d.team === params.get("team").toUpperCase())?.team_id ?? null;
  } else if (!shotMode) {
    try {
      const id = Number(localStorage.getItem(KEY));
      if (teams.some((d) => d.team_id === id)) current = id;
    } catch { /* no storage */ }
  }

  const chipLogo = h("img", { class: "logo-chip", alt: "" });
  const chipText = h("span");
  const chip = h("button", { class: "hud-team", type: "button", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-controls": "team-picker" },
    chipLogo, chipText);
  document.querySelector(".hud .shot-clock").before(chip);

  const options = teams.map((d) => {
    const logo = data.logo(d);
    const btn = h("button", { class: "team-opt", type: "button", "aria-pressed": "false", "aria-label": d.team_name, title: d.team_name },
      logo && h("img", { class: "logo-chip", src: logo, alt: "", loading: "lazy" }), h("span", null, d.team));
    btn.addEventListener("click", () => { setTeam(d.team_id); close(); });
    return { d, btn };
  });
  const none = h("button", { class: "btn", type: "button" }, "No team");
  none.addEventListener("click", () => { setTeam(null); close(); });
  const panel = h("div", { class: "team-picker", id: "team-picker", role: "dialog", "aria-label": "Pick your team", hidden: "" },
    h("p", { class: "team-picker-title" }, "Follow a team through the story"),
    h("div", { class: "team-grid" }, options.map((o) => o.btn)),
    none);
  document.body.append(panel);

  let back = chip;   // where focus returns
  open = (from = chip) => {
    back = from;
    if (panel.hidden) {
      panel.hidden = false;
      chip.setAttribute("aria-expanded", "true");
      gsap.fromTo(panel, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: dur(0.25) });
    }
    (options.find((o) => o.d.team_id === current) || options[0]).btn.focus({ preventScroll: true });
  };
  // returnFocus: false when focus has already moved on (Tab out of the panel)
  function close(returnFocus = true) {
    if (panel.hidden) return;
    panel.hidden = true;
    chip.setAttribute("aria-expanded", "false");
    if (returnFocus) back.focus({ preventScroll: true });
  }
  chip.addEventListener("click", () => (panel.hidden ? open(chip) : close()));
  addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  panel.addEventListener("focusout", (e) => {
    if (e.relatedTarget && !panel.contains(e.relatedTarget)) close(false);
  });
  // Arrow keys move through the logo grid as laid out (columns read from the page); Home and End: first and last
  panel.querySelector(".team-grid").addEventListener("keydown", (e) => {
    const btns = options.map((o) => o.btn);
    const i = btns.indexOf(document.activeElement);
    if (i < 0 || e.altKey || e.ctrlKey || e.metaKey) return;
    const cols = btns.filter((b) => b.offsetTop === btns[0].offsetTop).length;
    const to = { ArrowRight: i + 1, ArrowLeft: i - 1, ArrowDown: i + cols, ArrowUp: i - cols, Home: 0, End: btns.length - 1 }[e.key];
    if (to == null) return;
    e.preventDefault();
    btns[Math.max(0, Math.min(btns.length - 1, to))].focus();
  });
  addEventListener("pointerdown", (e) => {
    if (!panel.hidden && !panel.contains(e.target) && !chip.contains(e.target) && !back.contains(e.target)) close();
  });

  function paint() {
    const row = teams.find((d) => d.team_id === current);
    const logo = row && data.logo(row);
    chipLogo.hidden = !logo;
    if (logo) chipLogo.src = logo;
    chipText.textContent = row ? row.team : "Your team";
    chip.classList.toggle("set", !!row);
    chip.setAttribute("aria-label", row ? `Your team: ${row.team_name}. Change it` : "Pick your team");
    options.forEach((o) => o.btn.setAttribute("aria-pressed", String(o.d.team_id === current)));
  }
  onTeam(paint);
  paint();
}
