// 4th quarter (sketches ZD2 / QF4 / YZ1): two player cards and a radar duel between them (radar.js). Each
// axis is a percentile within the season (players with 500+ minutes), so players from any era can be
// compared. Cards are dressed in the team's colors and logo, tilt toward the pointer, and flip to the back
// of the player's jersey and the numbers behind the radar. A new player is dealt in: the card turns edge-on
// and back, the name scrambles into place and the points count to the new value. DRAFT.
import { season as fmtSeason } from "../data.js";
import { countTo, instant, scramble } from "../motion.js";
import { headshotUrl, teamColors } from "../media.js";
import { jersey } from "../ui/jersey.js";
import { radarDuel } from "./radar.js";
import { h } from "./steps.js";

const AXES = [
  { key: "scoring", label: "Scoring", raw: "pts_pg", fmt: (v) => `${v.toFixed(1)} pts` },
  { key: "threes", label: "Threes", raw: "fg3m_pg", fmt: (v) => `${v.toFixed(1)} 3PM` },
  { key: "playmaking", label: "Playmaking", raw: "ast_pg", fmt: (v) => `${v.toFixed(1)} ast` },
  { key: "rebounding", label: "Boards", raw: "reb_pg", fmt: (v) => `${v.toFixed(1)} reb` },
  { key: "defense", label: "Defense", raw: "stocks_pg", fmt: (v) => `${v.toFixed(1)} stl+blk` },
  { key: "efficiency", label: "Efficiency", raw: "ts_pct", fmt: (v) => `${(v * 100).toFixed(1)}% TS` },
];
const SLOTS = [
  { el: "card-a", color: "#ec5e22", fallback: "Stephen Curry" },
  { el: "card-b", color: "#3d8ff0", fallback: "Nikola Jokić" },
];
const surname = (name) => name.split(" ").slice(1).join(" ") || name;   // what goes on the back of the jersey
const ordinal = (k) => `${k}${Math.floor(k / 10) % 10 === 1 ? "th" : ["th", "st", "nd", "rd"][k % 10] || "th"}`;

export function initPlayers(data) {
  const bySeason = d3.group(data.players, (p) => p.season);
  const seasons = [...bySeason.keys()].sort(d3.ascending);
  let season = seasons[seasons.length - 1];
  const roster = () => (bySeason.get(season) || []).slice().sort((a, c) => c.pts_pg - a.pts_pg);
  let picked = SLOTS.map((s, i) => roster().find((p) => p.player_name === s.fallback) || roster()[i]);

  // Season picker + random matchup
  const ctl = d3.select("#q4-controls");
  const label = ctl.append("label").attr("class", "control");
  label.append("span").text("Season");
  const seasonSel = label.append("select").on("change", function () {
    season = +this.value;
    picked = picked.map((p, i) => roster().find((r) => r.player_id === p.player_id) || roster()[i]);
    fillLists();
    update();
  });
  seasonSel.selectAll("option").data(seasons.slice().reverse()).join("option").attr("value", (s) => s).text(fmtSeason);
  seasonSel.property("value", season);
  ctl.append("button").attr("class", "btn").attr("type", "button").text("Random matchup").on("click", () => {
    const top = roster().slice(0, 60);
    const a = top[Math.floor(Math.random() * top.length)];
    let c = a;
    while (c === a) c = top[Math.floor(Math.random() * top.length)];
    picked = [a, c];
    update();
  });

  // Cards: tilt wrapper > flip wrapper > front/back faces. The slot color (orange/blue) stays on the edge,
  // the points and the radar shape; the team's colors and logo dress the rest.
  const cards = SLOTS.map((slot, i) => {
    const article = document.getElementById(slot.el);
    article.style.setProperty("--accent", slot.color);
    const photo = h("img", { class: "card-photo", alt: "", decoding: "async" });
    photo.addEventListener("load", () => photo.classList.add("loaded"));
    const logo = h("img", { class: "logo-chip", alt: "" });
    logo.addEventListener("error", () => { logo.hidden = true; });
    const mark = h("img", { class: "card-mark", alt: "", decoding: "async" });   // big logo watermark
    mark.addEventListener("error", () => { mark.hidden = true; });
    const kit = h("div", { class: "card-kit" });   // back of the jersey
    const name = h("h3", { class: "card-name" });
    const team = h("span");
    const big = h("span", { class: "led" });
    const stats = h("div", { class: "card-stats" });
    const input = h("input", { type: "search", list: `${slot.el}-list`, placeholder: "Search a player", "aria-label": `Player ${i + 1}` });
    const list = h("datalist", { id: `${slot.el}-list` });
    const flip = h("button", { class: "btn", type: "button" }, "Flip");
    const table = h("table");
    const front = h("div", { class: "card-face card-front" }, mark, photo, h("p", { class: "card-team" }, logo, team), name, h("div", { class: "card-big" }, big, h("span", null, "points / game")), stats,
      h("div", { class: "card-actions" }, input, flip));
    const back = h("div", { class: "card-face card-back" }, kit, h("p", { class: "card-team" }, "Percentile in the season (0–100)"), table);
    const inner = h("div", { class: "card-inner" }, front, back);
    const tilt = h("div", { class: "card-tilt" }, inner);
    article.append(tilt, list);
    flip.addEventListener("click", () => article.classList.toggle("flipped"));
    back.addEventListener("click", () => article.classList.toggle("flipped"));
    input.addEventListener("change", () => {
      const found = roster().find((p) => p.player_name.toLowerCase() === input.value.trim().toLowerCase());
      if (found) { picked[i] = found; update(); }
    });
    if (!instant) {
      const rx = gsap.quickTo(tilt, "rotateX", { duration: 0.6, ease: "power3" });
      const ry = gsap.quickTo(tilt, "rotateY", { duration: 0.6, ease: "power3" });
      article.addEventListener("pointermove", (e) => {
        const r = article.getBoundingClientRect();
        rx(((e.clientY - r.top) / r.height - 0.5) * -10);
        ry(((e.clientX - r.left) / r.width - 0.5) * 12);
      });
      article.addEventListener("pointerleave", () => { rx(0); ry(0); });
    }
    return { article, tilt, photo, logo, mark, name, team, big, stats, input, list, table, kit, front, shown: null, pts: 0, deal: null };
  });

  function fillLists() {
    cards.forEach((c) => {
      d3.select(c.list).selectAll("option").data(roster(), (p) => p.player_id).join("option").attr("value", (p) => p.player_name);
    });
  }

  // Radar duel, under a VS badge. Hovering an axis compares the two players on it.
  const fig = document.getElementById("q4-radar");
  fig.append(h("div", { class: "vs", "aria-hidden": "true" }, "VS"));
  const radar = radarDuel(fig, {
    axes: AXES,
    colors: SLOTS.map((s) => s.color),
    describe: (j) => {
      const a = AXES[j];
      return {
        title: `${a.label} · ${fmtSeason(season)}`,
        rows: picked.map((p, i) => ({ value: ordinal(p[`${a.key}_pctl`] ?? 0), label: `${p.player_name} · ${a.fmt(p[a.raw])}`, color: SLOTS[i].color })),
        note: "Percentile among the season’s players with 500+ minutes and 20+ games",
      };
    },
  });

  // Nothing moves until the radar first scrolls into view: then it sweeps in and the points count up.
  // After that, every new player is dealt in.
  let live = false;
  function reveal() {
    live = true;
    radar.intro();
    cards.forEach((c) => countTo(c.big, 0, c.pts, { decimals: 1, duration: 1.6, delay: 0.5 }));
  }

  function update() {
    let k = 0;
    picked.forEach((p, i) => {
      const c = cards[i];
      if (c.shown === p) return;
      c.shown = p;
      c.deal?.kill();
      if (!live || instant) { fill(c, p, false); return; }
      c.deal = gsap.timeline({ delay: 0.08 * k++ })
        .to(c.tilt, { scaleX: 0, duration: 0.18, ease: "power2.in" })
        .call(() => fill(c, p, true))
        .to(c.tilt, { scaleX: 1, duration: 0.45, ease: "back.out(2)" });
    });
    radar.set(picked.map((p) => AXES.map((a) => (p[`${a.key}_pctl`] || 0) / 100)), { animate: live });
  }

  function fill(c, p, animate) {
    if (animate) scramble(c.name, p.player_name, { duration: 0.7 });
    else c.name.textContent = p.player_name;
    c.team.textContent = [p.jersey && `#${p.jersey}`, p.position, p.team, fmtSeason(season), `${p.gp} games`].filter(Boolean).join(" · ");
    const src = headshotUrl(p.player_id);
    if (c.photo.getAttribute("src") !== src) {
      c.photo.classList.remove("loaded");
      c.photo.src = src;
    }
    const row = data.teamBySeason.get(season)?.get(p.team);
    const colors = teamColors(row);
    c.article.style.setProperty("--team", colors.tint);
    c.article.style.setProperty("--team-a", colors.primary);
    c.article.style.setProperty("--team-b", colors.secondary);
    const logo = data.logo(row);
    for (const img of [c.logo, c.mark]) {
      img.hidden = !logo;
      if (logo) img.src = logo;
    }
    if (animate) countTo(c.big, c.pts, p.pts_pg, { decimals: 1, duration: 0.9 });
    else c.big.textContent = (live || instant ? p.pts_pg : 0).toFixed(1);   // before the reveal the LED waits at zero
    c.pts = p.pts_pg;
    c.front.setAttribute("data-num", p.jersey ?? "");   // the jersey number, outlined behind the stats
    c.kit.replaceChildren(jersey({
      ...colors, number: p.jersey ?? "", name: surname(p.player_name),
      label: `${p.player_name}’s jersey${p.jersey ? `, number ${p.jersey}` : ""}`,
    }));
    c.input.value = "";
    d3.select(c.stats).selectAll("div").data([[p.fg3m_pg.toFixed(1), "3PM / game"], [p.ast_pg.toFixed(1), "AST / game"],
      [p.reb_pg.toFixed(1), "REB / game"], [`${(p.ts_pct * 100).toFixed(1)}%`, "True shooting"]])
      .join((e) => { const d = e.append("div"); d.append("b"); d.append("small"); return d; })
      .call((d) => { d.select("b").text((x) => x[0]); d.select("small").text((x) => x[1]); });
    d3.select(c.table).selectAll("tr").data(AXES).join((e) => { const tr = e.append("tr"); tr.append("td"); tr.append("td"); return tr; })
      .call((tr) => {
        tr.select("td:first-child").text((a) => a.label);
        tr.select("td:last-child").text((a) => `${a.fmt(p[a.raw])} · ${p[`${a.key}_pctl`]}`);
      });
  }

  fillLists();
  update();
  if (!instant) ScrollTrigger.create({ trigger: fig, start: "top 75%", once: true, onEnter: reveal });

  // MVP hall placeholder: ghost cards for the most recent seasons
  d3.select("#mvp-row").selectAll("div").data(d3.range(8).map((i) => seasons[seasons.length - 1 - i])).join("div")
    .attr("class", "mvp-ghost").each(function (s) {
      this.append(h("b", null, "?"), h("span", null, `MVP · ${fmtSeason(s)}`));
    });
}

/** Halftime placeholder: empty radar glyphs, one per era. */
export function initHalftime() {
  const eras = ["1985–2000", "2000–2012", "2012–2020", "2020–2026"];
  d3.select("#half-glyphs").selectAll("svg").data(eras).join("svg").attr("viewBox", "0 0 160 170").each(function (era) {
    const g = d3.select(this).append("g").attr("transform", "translate(80,78)");
    for (const v of [0.4, 0.7, 1]) {
      g.append("path").attr("d", d3.line()(d3.range(6).map((i) => {
        const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
        return [60 * v * Math.cos(a), 60 * v * Math.sin(a)];
      })) + "Z").style("fill", "none").style("stroke", "rgba(242,238,230,0.16)").style("stroke-dasharray", v === 1 ? null : "2 4");
    }
    d3.select(this).append("text").attr("x", 80).attr("y", 164).text(era);
  });
}
