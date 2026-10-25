// 4th quarter (sketches ZD2 / QF4 / YZ1): two player cards and a radar duel between them. Each axis is a
// percentile within the season (players with 500+ minutes), so players from any era can be compared.
// Cards tilt toward the pointer and flip to show the numbers behind the radar. DRAFT.
import { season as fmtSeason } from "../data.js";
import { dur, instant } from "../motion.js";
import { headshotUrl } from "../media.js";
import { showTip, moveTip, hideTip } from "../ui/tooltip.js";
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

  // Cards: tilt wrapper > flip wrapper > front/back faces
  const cards = SLOTS.map((slot, i) => {
    const article = document.getElementById(slot.el);
    article.style.setProperty("--accent", slot.color);
    const photo = h("img", { class: "card-photo", alt: "", decoding: "async" });
    photo.addEventListener("load", () => photo.classList.add("loaded"));
    const logo = h("img", { class: "logo-chip", alt: "" });
    logo.addEventListener("error", () => { logo.hidden = true; });
    const name = h("h3", { class: "card-name" });
    const team = h("span");
    const big = h("span", { class: "led" });
    const stats = h("div", { class: "card-stats" });
    const input = h("input", { type: "search", list: `${slot.el}-list`, placeholder: "Search a player", "aria-label": `Player ${i + 1}` });
    const list = h("datalist", { id: `${slot.el}-list` });
    const flip = h("button", { class: "btn", type: "button" }, "Flip");
    const table = h("table");
    const front = h("div", { class: "card-face card-front" }, photo, h("p", { class: "card-team" }, logo, team), name, h("div", { class: "card-big" }, big, h("span", null, "points / game")), stats,
      h("div", { class: "card-actions" }, input, flip));
    const back = h("div", { class: "card-face card-back" }, h("p", { class: "card-team" }, "Percentile in the season (0–100)"), table);
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
    return { article, photo, logo, name, team, big, stats, input, list, table, faces: [front, back] };
  });

  function fillLists() {
    cards.forEach((c) => {
      d3.select(c.list).selectAll("option").data(roster(), (p) => p.player_id).join("option").attr("value", (p) => p.player_name);
    });
  }

  // Radar duel
  const fig = d3.select("#q4-radar");
  const svg = fig.append("svg");
  let size = 0;
  const angle = (i) => (Math.PI * 2 * i) / AXES.length - Math.PI / 2;

  function drawFrame() {
    size = Math.min(fig.node().clientWidth, 520);
    const r = size / 2 - 62;
    svg.attr("viewBox", `0 0 ${size} ${size}`).selectAll("*").remove();
    const g = svg.append("g").attr("class", "frame").attr("transform", `translate(${size / 2},${size / 2})`);
    for (const v of [0.25, 0.5, 0.75, 1]) {
      g.append("path").attr("class", "ring").attr("d", d3.line()(AXES.map((_, i) => [r * v * Math.cos(angle(i)), r * v * Math.sin(angle(i))])) + "Z");
    }
    AXES.forEach((a, i) => {
      g.append("line").attr("class", "spoke").attr("x2", r * Math.cos(angle(i))).attr("y2", r * Math.sin(angle(i)));
      const lx = (r + 30) * Math.cos(angle(i));
      g.append("text").attr("class", "axis-name").attr("x", lx).attr("y", (r + 26) * Math.sin(angle(i))).attr("dy", "0.35em")
        .attr("text-anchor", Math.abs(lx) < 5 ? "middle" : lx > 0 ? "start" : "end").text(a.label);
    });
    g.append("text").attr("class", "axis").attr("x", 4).attr("y", -r * 0.5).attr("dy", "-0.3em").text("50");
    g.append("text").attr("class", "axis").attr("x", 4).attr("y", -r).attr("dy", "-0.3em").text("100");
    svg.append("g").attr("class", "shapes").attr("transform", `translate(${size / 2},${size / 2})`);
    return r;
  }
  let radius = drawFrame();

  function points(p) {
    return AXES.map((a, i) => {
      const v = (p[`${a.key}_pctl`] || 0) / 100;
      return [radius * v * Math.cos(angle(i)), radius * v * Math.sin(angle(i))];
    });
  }

  function update() {
    picked.forEach((p, i) => {
      const c = cards[i];
      c.name.textContent = p.player_name;
      c.team.textContent = `${p.team} · ${fmtSeason(season)} · ${p.gp} games`;
      const src = headshotUrl(p.player_id);
      if (c.photo.getAttribute("src") !== src) {
        c.photo.classList.remove("loaded");
        c.photo.src = src;
      }
      const logo = data.logo(data.teamBySeason.get(season)?.get(p.team));
      c.logo.hidden = !logo;
      if (logo) c.logo.src = logo;
      c.big.textContent = p.pts_pg.toFixed(1);
      c.faces.forEach((f) => f.setAttribute("data-num", Math.round(p.pts_pg)));
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
    });
    const shapes = svg.select("g.shapes");
    const t = d3.transition().duration(dur(0.9) * 1000).ease(d3.easeCubicInOut);
    const line = (pts) => d3.line()(pts) + "Z";
    shapes.selectAll("path.shape").data(picked.map((p, i) => ({ p, slot: SLOTS[i] }))).join(
      (enter) => enter.append("path").attr("class", "shape").attr("d", (d) => line(points(d.p).map(() => [0, 0]))),
    ).style("fill", (d) => d.slot.color).style("fill-opacity", 0.14).style("stroke", (d) => d.slot.color)
      .transition(t).attrTween("d", function (d) {
        const from = this.__pts || points(d.p).map(() => [0, 0]);
        const to = points(d.p);
        this.__pts = to;
        const interp = d3.interpolateArray(from, to);
        return (tt) => line(interp(tt));
      });
    const dots = picked.flatMap((p, i) => points(p).map((pt, j) => ({ pt, p, a: AXES[j], color: SLOTS[i].color, k: `${i}-${j}` })));
    shapes.selectAll("circle").data(dots, (d) => d.k).join((e) => e.append("circle").attr("r", 4.5))
      .style("fill", (d) => d.color).style("stroke", "var(--bg)").style("stroke-width", 2)
      .on("pointerenter", (event, d) => showTip(event, {
        title: `${d.p.player_name} · ${fmtSeason(season)}`,
        rows: [{ value: `${d.p[`${d.a.key}_pctl`]}th`, label: `percentile · ${d.a.label.toLowerCase()}`, color: d.color },
          { value: d.a.fmt(d.p[d.a.raw]) }],
      }))
      .on("pointermove", moveTip).on("pointerleave", hideTip)
      .transition(t).attr("cx", (d) => d.pt[0]).attr("cy", (d) => d.pt[1]);
  }

  fillLists();
  update();
  new ResizeObserver(() => {
    const w = Math.min(fig.node().clientWidth, 520);
    if (Math.abs(w - size) < 2) return;
    radius = drawFrame();
    svg.selectAll("path.shape").each(function () { this.__pts = null; });
    update();
  }).observe(fig.node());

  // MVP hall placeholder: ghost cards for the most recent seasons
  d3.select("#mvp-row").selectAll("div").data(d3.range(8).map((i) => seasons[seasons.length - 1 - i])).join("div")
    .attr("class", "mvp-ghost").each(function (s) {
      this.append(h("b", null, "?"), h("span", null, `MVP · ${fmtSeason(s)}`));
    });
}

/** Halftime placeholder: empty radar glyphs, one per era. */
export function initHalftime() {
  const eras = ["1979–2000", "2000–2012", "2012–2020", "2020–2026"];
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
