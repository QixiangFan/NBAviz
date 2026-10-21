// FINAL BUZZER: the closing scoreboard. One panel per stat: how closely it tracked winning in the
// latest season (r with win %). Digits count up, the meters fill and the backboard light goes red when
// the board scrolls into view. Below it, the team's starting five on jerseys.
import { season as fmtSeason } from "../data.js";
import { countTo, instant } from "../motion.js";
import { jersey } from "../ui/jersey.js";
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
  panels.append("span").attr("class", "led dots").style("color", (m) => m.color).style("text-shadow", (m) => `0 0 30px ${m.color}`).text("0.00");
  panels.append("div").attr("class", "meter").append("span").style("background", (m) => m.color);
  panels.append("small").text((m) => NOTES[m.key]);

  const run = () => {
    document.getElementById("final-board").classList.add("buzzer");
    panels.each(function (m, i) {
      const value = r(m.key);
      countTo(this.querySelector(".led"), 0, value, { decimals: 2, duration: 1.8, delay: i * 0.25 });
      gsap.to(this.querySelector(".meter span"), { scaleX: Math.max(0, value), duration: instant ? 0 : 1.8, delay: instant ? 0 : i * 0.25, ease: "power3.out" });
    });
  };
  if (instant) run();
  else ScrollTrigger.create({ trigger: "#final-board", start: "top 80%", once: true, onEnter: run });
  initLineup();
}

/** Starting five: each name on a jersey in the site's colors, popping up one by one on first view. */
function initLineup() {
  const items = [...document.querySelectorAll("#lineup li")];
  const shirts = items.map((li) => {
    const number = String(Number(li.querySelector("span").textContent));   // "01" on the list, 1 on the back
    const shirt = jersey({ primary: "#ec5e22", secondary: "#0b0d12", ink: "#f2eee6", number, name: li.dataset.name });
    li.prepend(shirt);
    return shirt;
  });
  if (instant) return;
  gsap.from(shirts, {
    y: 46, rotate: -5, opacity: 0, duration: 0.9, stagger: 0.1, ease: "back.out(1.6)",
    clearProps: "transform,opacity",   // hand the jerseys back to the CSS hover lift
    scrollTrigger: { trigger: "#lineup", start: "top 85%", once: true },
  });
}
