// 4th quarter (sketches ZD2 / QF4 / YZ1): two player cards and a radar duel between them (radar.js). Each
// axis is a percentile within the player's own season (players with 500+ minutes), so each card can come
// from a different season and players from any two eras can be compared. Above each card: its season and a
// search; above the radar: famous matchups across eras and a random one. Cards are dressed in the team's
// colors and logo, tilt toward the pointer, and flip to the back of the player's jersey and the numbers
// behind the radar. A new player is dealt in: the card turns edge-on and back, the name scrambles into place
// and the points count to the new value. The MVP hall deals its MVPs into the left card (load()).
import { season as fmtSeason } from "../data.js";
import { countTo, instant, scramble } from "../motion.js";
import { headshotUrl, teamColors } from "../media.js";
import { jersey } from "../ui/jersey.js";
import { getTeam, onTeam } from "../ui/team.js";
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
// Matchups across eras: [label, [player, season], [player, season]]. A pair missing from the data is left out.
const PRESETS = [
  ["Shaq vs. Hakeem", ["Shaquille O'Neal", 1999], ["Hakeem Olajuwon", 1996]],
  ["MJ vs. LeBron", ["Michael Jordan", 1997], ["LeBron James", 2012]],
  ["Iverson vs. Harden", ["Allen Iverson", 2000], ["James Harden", 2018]],
  ["Allen vs. Curry", ["Ray Allen", 2005], ["Stephen Curry", 2015]],
];
const surname = (name) => name.split(" ").slice(1).join(" ") || name;   // what goes on the back of the jersey
const ordinal = (k) => `${k}${Math.floor(k / 10) % 10 === 1 ? "th" : ["th", "st", "nd", "rd"][k % 10] || "th"}`;

export function initPlayers(data) {
  const bySeason = d3.group(data.players, (p) => p.season);
  const seasons = [...bySeason.keys()].sort(d3.ascending);
  const latest = seasons[seasons.length - 1];
  // A season's players, best scorer first
  const roster = (s) => (bySeason.get(s) || []).slice().sort((a, c) => c.pts_pg - a.pts_pg);
  const find = (name, s) => roster(s).find((p) => p.player_name === name);
  const teamOf = (p) => data.teamBySeason.get(p.season)?.get(p.team);
  // The reader's team's best scorer in the latest season (ui/team.js)
  const fanStar = (id) => (id == null ? null : roster(latest).find((p) => teamOf(p)?.team_id === id));
  let picked = SLOTS.map((s, i) => find(s.fallback, latest) || roster(latest)[i]);   // one player-season per card
  let touched = false;   // once the reader picks someone, picking a team no longer changes the cards
  const star = fanStar(getTeam());
  if (star && star !== picked[1]) picked[0] = star;

  // Matchups: famous pairs across eras, and a random one from any two seasons
  const presets = PRESETS.map(([label, ...pair]) => ({ label, pair: pair.map(([name, s]) => find(name, s)) }))
    .filter((m) => m.pair.every(Boolean));
  const presetBox = d3.select("#q4-presets").attr("role", "group").attr("aria-label", "Matchups");
  const chips = presetBox.selectAll("button.chip").data(presets).join("button").attr("class", "chip").attr("type", "button")
    .text((m) => m.label).on("click", (_, m) => choose(m.pair));
  presetBox.append("button").attr("class", "btn").attr("type", "button").text("Random matchup").on("click", () => {
    const draw = () => {   // a season, then one of its 40 best scorers
      const top = roster(seasons[Math.floor(Math.random() * seasons.length)]).slice(0, 40);
      return top[Math.floor(Math.random() * top.length)];
    };
    const a = draw();
    let c = draw();
    while (c === a) c = draw();
    choose([a, c]);
  });
  function choose(pair) {
    picked = pair.slice();
    touched = true;
    update();
  }

  // Cards: tilt wrapper > flip wrapper > front/back faces. The slot color (orange/blue) stays on the edge,
  // the points and the radar shape; the team's colors and logo dress the rest. Above each card: its season
  // and a search among that season's players.
  const cards = SLOTS.map((slot, i) => {
    const article = document.getElementById(slot.el);
    article.style.setProperty("--accent", slot.color);
    const seasonSel = h("select", { "aria-label": `Season of player ${i + 1}` },
      seasons.slice().reverse().map((s) => h("option", { value: s }, fmtSeason(s))));
    const input = h("input", { type: "search", list: `${slot.el}-list`, placeholder: "Search a player", "aria-label": `Player ${i + 1}` });
    const list = h("datalist", { id: `${slot.el}-list` });
    article.before(h("div", { class: "slot-controls" }, h("label", { class: "control" }, h("span", null, "Season"), seasonSel), input, list));
    seasonSel.addEventListener("change", () => {
      // The same player if still qualified that season, else that season's best scorer
      const s = +seasonSel.value;
      picked[i] = roster(s).find((p) => p.player_id === picked[i].player_id) || roster(s).find((p) => p !== picked[1 - i]);
      touched = true;
      update();
    });
    input.addEventListener("change", () => {
      const found = roster(picked[i].season).find((p) => p.player_name.toLowerCase() === input.value.trim().toLowerCase());
      if (found) { picked[i] = found; touched = true; update(); }
    });

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
    const flip = h("button", { class: "btn", type: "button" }, "Flip");
    const table = h("table");
    const front = h("div", { class: "card-face card-front" }, mark, photo, h("p", { class: "card-team" }, logo, team), name, h("div", { class: "card-big" }, big, h("span", null, "points / game")), stats,
      h("div", { class: "card-actions" }, flip));
    const back = h("div", { class: "card-face card-back" }, kit, h("p", { class: "card-team" }, "Percentile in the season (0–100)"), table);
    const inner = h("div", { class: "card-inner" }, front, back);
    const tilt = h("div", { class: "card-tilt" }, inner);
    article.append(tilt);
    flip.addEventListener("click", () => article.classList.toggle("flipped"));
    back.addEventListener("click", () => article.classList.toggle("flipped"));
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
    return { article, tilt, photo, logo, mark, name, team, big, stats, seasonSel, input, list, table, kit, front, listSeason: null, shown: null, pts: 0, deal: null };
  });

  // Radar duel, under a VS badge. Hovering an axis compares the two players on it.
  const fig = document.getElementById("q4-radar");
  fig.append(h("div", { class: "vs", "aria-hidden": "true" }, "VS"));
  const radar = radarDuel(fig, {
    axes: AXES,
    colors: SLOTS.map((s) => s.color),
    describe: (j) => {
      const a = AXES[j];
      return {
        title: a.label,
        rows: picked.map((p, i) => ({ value: ordinal(p[`${a.key}_pctl`] ?? 0), label: `${p.player_name}, ${fmtSeason(p.season)} · ${a.fmt(p[a.raw])}`, color: SLOTS[i].color })),
        note: "Percentile within each player’s own season, among players with 500+ minutes and 20+ games",
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
      c.seasonSel.value = p.season;
      if (c.listSeason !== p.season) {   // the search offers that season's players
        c.listSeason = p.season;
        d3.select(c.list).selectAll("option").data(roster(p.season), (r) => r.player_id).join("option").attr("value", (r) => r.player_name);
      }
      c.deal?.kill();
      if (!live || instant) { fill(c, p, false); return; }
      c.deal = gsap.timeline({ delay: 0.08 * k++ })
        .to(c.tilt, { scaleX: 0, duration: 0.18, ease: "power2.in" })
        .call(() => fill(c, p, true))
        .to(c.tilt, { scaleX: 1, duration: 0.45, ease: "back.out(2)" });
    });
    chips.attr("aria-pressed", (m) => String(m.pair[0] === picked[0] && m.pair[1] === picked[1]));
    radar.set(picked.map((p) => AXES.map((a) => (p[`${a.key}_pctl`] || 0) / 100)), { animate: live });
  }

  function fill(c, p, animate) {
    if (animate) scramble(c.name, p.player_name, { duration: 0.7 });
    else c.name.textContent = p.player_name;
    c.team.textContent = [p.jersey && `#${p.jersey}`, p.position, p.team, fmtSeason(p.season), `${p.gp} games`].filter(Boolean).join(" · ");
    const src = headshotUrl(p.player_id);
    if (c.photo.getAttribute("src") !== src) {
      c.photo.classList.remove("loaded");
      c.photo.src = src;
    }
    const row = teamOf(p);
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

  update();
  if (!instant) ScrollTrigger.create({ trigger: fig, start: "top 75%", once: true, onEnter: reveal });

  // Picking a team before touching the duel puts its best scorer in the left card
  onTeam((id) => {
    const p = fanStar(id);
    if (touched || !p || p === picked[1]) return;
    picked[0] = p;
    update();
  });

  return {
    /** Deal a player-season into the left card (the MVP hall). The right card stays unless it is the same. */
    load(season, playerId) {
      const p = roster(season).find((r) => r.player_id === playerId);
      if (!p) return;
      picked[0] = p;
      if (picked[1] === p) picked[1] = roster(season).find((r) => r !== p);
      touched = true;
      update();
    },
  };
}
