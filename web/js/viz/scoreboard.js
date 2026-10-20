// FINAL BUZZER: the closing scoreboard. One panel per stat: how closely it tracked winning in the
// latest season (r with win %). Digits count up and the meters fill when the board scrolls into view.
import { season as fmtSeason } from "../data.js";
import { countTo, instant } from "../motion.js";
import { METRICS } from "./teams.js";

const NOTES = {
  fg3a_rate: "Taking threes: how many of a team’s shots were threes",
  fg3_pct: "Making threes: 3-point percentage",
  efg: "Making every shot, threes counted 1.5×",
};

export function initScoreboard(data) {
  const last = data.lastSeason;
  const r = (metric) => data.corr.find((d) => d.first_season === last && d.last_season === last && d.metric === metric).r;
  document.getElementById("final-sub").textContent = `How closely each stat tracked winning in ${fmtSeason(last)} (correlation with win %)`;
  const panels = d3.select("#final-board").selectAll("div").data(METRICS).join("div").attr("class", "final-panel");
  panels.append("span").attr("class", "lbl").each(function (m) {
    const dot = document.createElement("i");
    dot.className = "key";
    dot.style.background = m.color;
    this.append(dot, `${m.label} · ${m.name}`);
  });
  panels.append("span").attr("class", "led").style("color", (m) => m.color).style("text-shadow", (m) => `0 0 30px ${m.color}`).text("0.00");
  panels.append("div").attr("class", "meter").append("span").style("background", (m) => m.color);
  panels.append("small").text((m) => NOTES[m.key]);

  const run = () => panels.each(function (m, i) {
    const value = r(m.key);
    countTo(this.querySelector(".led"), 0, value, { decimals: 2, duration: 1.8, delay: i * 0.25 });
    gsap.to(this.querySelector(".meter span"), { scaleX: Math.max(0, value), duration: instant ? 0 : 1.8, delay: instant ? 0 : i * 0.25, ease: "power3.out" });
  });
  if (instant) run();
  else ScrollTrigger.create({ trigger: "#final-board", start: "top 80%", once: true, onEnter: run });
}
