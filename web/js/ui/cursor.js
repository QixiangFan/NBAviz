// Desktop pointer only: buttons lean toward the mouse (magnetic). Touch screens, screenshots (?shot=)
// and reduced motion keep them still.
import { instant } from "../motion.js";

export function initCursor() {
  if (instant || !window.matchMedia("(pointer: fine)").matches) return;
  for (const btn of document.querySelectorAll(".btn")) {
    btn.addEventListener("pointermove", (e) => {
      const r = btn.getBoundingClientRect();
      gsap.to(btn, {
        x: (e.clientX - r.left - r.width / 2) * 0.3, y: (e.clientY - r.top - r.height / 2) * 0.4,
        duration: 0.4, ease: "power3.out", overwrite: "auto",
      });
    });
    btn.addEventListener("pointerleave", () => {
      gsap.to(btn, { x: 0, y: 0, duration: 0.8, ease: "elastic.out(1, 0.4)", overwrite: "auto" });
    });
  }
}
