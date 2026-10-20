// Canvas particle field: thousands of dots, each tweening between layouts on its own delay.
// One GSAP tween drives a whole morph; drawing is batched per style, and additive blending
// makes dense spots (the rim, the arc) glow.

export class ParticleField {
  constructor(canvas, n) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.n = n;
    const f = () => new Float32Array(n);
    this.x = f(); this.y = f(); this.fx = f(); this.fy = f(); this.tx = f(); this.ty = f(); this.delay = f();
    this.style = new Uint8Array(n); this.fromStyle = new Uint8Array(n); this.toStyle = new Uint8Array(n);
    this.styles = [];        // [{ color, alpha, size }]
    this.t = 1;
    this.spread = 0;
    this.ease = (t) => t;
    this.tween = null;
    this.w = 0;
    this.h = 0;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
  }

  setStyles(styles) { this.styles = styles; }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.draw();
  }

  /** Jump straight to a layout. */
  place(xs, ys, styles) {
    this.tween?.kill();
    this.x.set(xs); this.y.set(ys); this.tx.set(xs); this.ty.set(ys);
    this.style.set(styles); this.toStyle.set(styles);
    this.t = 1;
    this.draw();
  }

  /**
   * Tween every particle to (xs, ys) and swap its style halfway. spread (0-0.9) staggers the
   * particles across the duration, by `delays` (0-1 each) or at random.
   */
  morph(xs, ys, styles, { duration = 1.6, spread = 0.5, ease = "power3.inOut", delays = null, from = null } = {}) {
    if (!duration) { this.place(xs, ys, styles); return Promise.resolve(); }
    this.tween?.kill();
    this.fx.set(from ? from.x : this.x); this.fy.set(from ? from.y : this.y);
    this.fromStyle.set(this.style); this.tx.set(xs); this.ty.set(ys); this.toStyle.set(styles);
    if (delays) this.delay.set(delays);
    else for (let i = 0; i < this.n; i++) this.delay[i] = Math.random();
    this.spread = spread;
    this.ease = gsap.parseEase(ease);
    this.t = 0;
    return new Promise((done) => {
      this.tween = gsap.to(this, {
        t: 1, duration, ease: "none", onUpdate: () => this.step(), onComplete: () => { this.step(); done(); },
      });
    });
  }

  step() {
    const win = 1 - this.spread;
    for (let i = 0; i < this.n; i++) {
      const local = Math.min(1, Math.max(0, (this.t - this.delay[i] * this.spread) / win));
      const e = this.ease(local);
      this.x[i] = this.fx[i] + (this.tx[i] - this.fx[i]) * e;
      this.y[i] = this.fy[i] + (this.ty[i] - this.fy[i]) * e;
      this.style[i] = local < 0.5 ? this.fromStyle[i] : this.toStyle[i];
    }
    this.draw();
  }

  draw() {
    const { ctx, dpr, n } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.globalCompositeOperation = "lighter";
    this.styles.forEach((s, si) => {
      if (!s.alpha) return;
      ctx.globalAlpha = s.alpha;
      ctx.fillStyle = s.color;
      const r = s.size;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (this.style[i] === si) ctx.rect(this.x[i] - r / 2, this.y[i] - r / 2, r, r);
      }
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
}
