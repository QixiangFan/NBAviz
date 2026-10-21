// A player cut out of a photo (web/assets/players/, made by make_cutouts.swift), standing in a glow of
// the team's colors and fading into the floor. Echoes are flat copies of the same outline in the
// three-point orange, trailing behind the player like a long exposure.
import { teamColors } from "../media.js";
import { h } from "../viz/steps.js";

/**
 * cutout(row, { echoes, caption }) → <figure class="cutout">. row is a line of cutouts.csv (slug, team_id,
 * team_name, ...); caption is the content of a <figcaption>, or null. The figure takes the photo's aspect
 * ratio once it loads, and removes itself if the file is missing.
 */
export function cutout(row, { echoes = 0, caption = null } = {}) {
  const src = `assets/players/${row.slug}.png`;
  const colors = teamColors(row);
  const fig = h("figure", { class: "cutout" });
  fig.style.setProperty("--team", colors.tint);
  fig.style.setProperty("--team-a", colors.primary);
  fig.style.setProperty("--team-b", colors.secondary);
  const art = h("div", { class: "cutout-art" }, h("div", { class: "cutout-glow" }));
  for (let i = 1; i <= echoes; i++) {
    const echo = h("div", { class: "cutout-echo" });
    echo.style.setProperty("--i", i);
    echo.style.webkitMaskImage = echo.style.maskImage = `url("${src}")`;
    art.append(echo);
  }
  // The photo fades into the floor through a mask; its rim light sits on a wrapper, so the mask can't clip it
  const img = h("img", { class: "cutout-img", src, alt: "", decoding: "async" });
  img.addEventListener("load", () => { fig.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`; });
  img.addEventListener("error", () => fig.remove());
  art.append(h("div", { class: "cutout-body" }, img));
  fig.append(art);
  if (caption) fig.append(h("figcaption", null, caption));
  return fig;
}
