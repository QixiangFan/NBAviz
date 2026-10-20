// Small, plain-HTML controls shared by every chapter.

/** Pill group of buttons. options: [{ value, label }]. Returns { set(value) }. */
export function segmented(container, options, value, onChange, ariaLabel) {
  const group = d3.select(container).classed("seg", true).attr("role", "group").attr("aria-label", ariaLabel);
  const buttons = group.selectAll("button").data(options).join("button")
    .attr("type", "button")
    .text((d) => d.label)
    .on("click", (_, d) => { set(d.value); onChange(d.value); });
  function set(v) { buttons.attr("aria-pressed", (d) => String(d.value === v)); }
  set(value);
  return { set };
}

/** Labeled range slider over a list of values. Returns { set(value), input }. */
export function slider(container, label, values, value, format, onInput) {
  const wrap = d3.select(container).append("label").attr("class", "control");
  wrap.append("span").text(label);
  const input = wrap.append("input").attr("type", "range")
    .attr("min", 0).attr("max", values.length - 1).attr("step", 1).attr("aria-label", label);
  const out = wrap.append("output");
  input.on("input", () => {
    const v = values[+input.property("value")];
    out.text(format(v));
    onInput(v);
  });
  function set(v) {
    const i = Math.max(0, values.indexOf(v));
    input.property("value", i);
    out.text(format(values[i]));
  }
  set(value);
  return { set, input };
}
