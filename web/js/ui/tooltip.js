// One shared tooltip. Values lead, labels follow. Content is built with textContent only,
// because labels come from data files.

const tip = document.createElement("div");
tip.className = "tooltip";
tip.setAttribute("role", "status");
document.body.appendChild(tip);

/** spec = { title, logo?, accent?, rows: [{ value, label, color? }], note? }; accent: a team color for the edge */
export function showTip(event, spec) {
  tip.replaceChildren();
  tip.style.setProperty("--tt-accent", spec.accent || "");
  if (spec.title) {
    const title = tip.appendChild(node("div", "tt-title", spec.title));
    if (spec.logo) {
      const img = node("img", "logo-chip");
      img.alt = "";
      img.src = spec.logo;
      title.prepend(img);
    }
  }
  for (const row of spec.rows || []) {
    const line = node("div", "tt-row");
    if (row.color) {
      const key = node("i", "tt-key");
      key.style.borderColor = row.color;
      line.appendChild(key);
    }
    line.appendChild(node("strong", null, row.value));
    if (row.label) line.appendChild(node("span", null, row.label));
    tip.appendChild(line);
  }
  if (spec.note) tip.appendChild(node("div", "tt-note", spec.note));
  tip.classList.add("visible");
  moveTip(event);
}

export function moveTip(event) {
  const pad = 16;
  const r = tip.getBoundingClientRect();
  let x = event.clientX + pad;
  let y = event.clientY + pad;
  if (x + r.width > window.innerWidth - 8) x = event.clientX - r.width - pad;
  if (y + r.height > window.innerHeight - 8) y = event.clientY - r.height - pad;
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}

export function hideTip() {
  tip.classList.remove("visible");
}

function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}
