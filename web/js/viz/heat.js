// Shot density under the 2nd-quarter dots, from every attempt in the 1 ft grid rather than a sample.
// Each cell glows in its shot type's color on one scale for all seasons, so a zone that empties really
// fades. Changes tween cell by cell, and a CSS blur turns the 1 ft cells into a soft glow.
import { ZONES } from "../data.js";

const X0 = -25;          // grid origin in feet (cell corners, as in shot_grid.csv)
const Y0 = -5;
const GW = 50;
const GH = 48;
const CELLS = GW * GH;
const RGB = [[61, 143, 240], [236, 94, 34]];   // --two, --three
const MAX_ALPHA = 0.5;

/** Each zone's share of the season's attempts in every 1 ft cell (zone-major, CELLS per zone). */
export function shotDensity(cells) {
  const out = new Float32Array(ZONES.length * CELLS);
  const total = d3.sum(cells, (c) => c.fga);
  for (const c of cells) {
    const gx = c.x - X0;
    const gy = c.y - Y0;
    if (gx < 0 || gx >= GW || gy < 0 || gy >= GH) continue;
    out[ZONES.indexOf(c.zone) * CELLS + gy * GW + gx] += c.fga / total;
  }
  return out;
}

/** The share of attempts per cell (all zones together) at the given quantile, over every season. */
export function densityQuantile(densities, q) {
  const totals = [];
  for (const d of densities) {
    for (let i = 0; i < CELLS; i++) {
      let all = 0;
      for (let z = 0; z < ZONES.length; z++) all += d[z * CELLS + i];
      if (all > 0) totals.push(all);
    }
  }
  return d3.quantile(totals, q);
}

export class HeatField {
  /** top: the share of attempts in one cell that glows fully (sqrt scale below it). */
  constructor(canvas, top) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.top = top;
    this.grid = Object.assign(document.createElement("canvas"), { width: GW, height: GH });
    this.gctx = this.grid.getContext("2d");
    this.img = this.gctx.createImageData(GW, GH);
    this.now = new Float32Array(ZONES.length * CELLS);
    this.from = new Float32Array(this.now.length);
    this.to = new Float32Array(this.now.length);
    this.tween = null;
    this.court = null;
  }

  resize(court) {
    this.court = court;
    this.canvas.width = Math.round(court.w);
    this.canvas.height = Math.round(court.h);
    this.canvas.style.width = `${court.w}px`;
    this.canvas.style.height = `${court.h}px`;
    this.canvas.style.filter = `blur(${(court.k * 0.3).toFixed(1)}px)`;
    this.draw();
  }

  /** Tween to a shotDensity, keeping only the zones (by index) that pass keep. */
  show(density, { keep = () => true, duration = 0 } = {}) {
    this.tween?.kill();
    this.from.set(this.now);
    this.to.set(density);
    ZONES.forEach((_, z) => { if (!keep(z)) this.to.fill(0, z * CELLS, (z + 1) * CELLS); });
    if (!duration) {
      this.now.set(this.to);
      this.draw();
      return;
    }
    const state = { t: 0 };
    this.tween = gsap.to(state, {
      t: 1, duration, ease: "power2.inOut", onUpdate: () => {
        for (let i = 0; i < this.now.length; i++) this.now[i] = this.from[i] + (this.to[i] - this.from[i]) * state.t;
        this.draw();
      },
    });
  }

  draw() {
    const s = this.court;
    if (!s) return;
    const px = this.img.data;
    for (let i = 0; i < CELLS; i++) {
      let two = 0;
      let three = 0;
      for (let z = 0; z < ZONES.length; z++) {
        if (z >= 3) three += this.now[z * CELLS + i]; else two += this.now[z * CELLS + i];
      }
      const all = two + three;
      const f = all > 0 ? three / all : 0;
      for (let ch = 0; ch < 3; ch++) px[i * 4 + ch] = RGB[0][ch] + (RGB[1][ch] - RGB[0][ch]) * f;
      px[i * 4 + 3] = 255 * MAX_ALPHA * Math.sqrt(Math.min(1, all / this.top));
    }
    this.gctx.putImageData(this.img, 0, 0);
    const { ctx } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(s.ox, s.oy, s.width, s.height);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.grid, s.x(X0), s.y(Y0), GW * s.k, GH * s.k);
    ctx.restore();
  }
}
