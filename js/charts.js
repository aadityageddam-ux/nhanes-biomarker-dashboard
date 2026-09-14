"use strict";
function renderProfileChart(container, rows, title, unit) {
  const ns = "http://www.w3.org/2000/svg",
    svg = document.createElementNS(ns, "svg");
  const narrow = container.clientWidth < 450,
    width = narrow ? 360 : 700;
  svg.setAttribute("viewBox", "0 0 " + width + " 385");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-labelledby", "plot-title plot-description");
  function add(tag, attrs, text) {
    const el = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs))
      el.setAttribute(key, String(value));
    if (text !== undefined) el.textContent = text;
    svg.append(el);
    return el;
  }
  add("title", { id: "plot-title" }, title);
  add(
    "desc",
    { id: "plot-description" },
    "Seven age-group means with horizontal 95% confidence intervals. Exact values and sample sizes follow in the table.",
  );
  const valid = rows.filter(
    (r) => Number.isFinite(r.ci_lower) && Number.isFinite(r.ci_upper),
  );
  if (!valid.length) {
    container.textContent = "No estimable intervals in this profile.";
    return;
  }
  const low = Math.min(...valid.map((r) => r.ci_lower)),
    high = Math.max(...valid.map((r) => r.ci_upper));
  const pad = Math.max((high - low) * 0.12, 0.05),
    min = low - pad,
    max = high + pad;
  const left = narrow ? 55 : 90,
    span = narrow ? 225 : 480,
    ticks = narrow ? 2 : 4;
  const x = (value) => left + ((value - min) / (max - min)) * span;
  for (let i = 0; i <= ticks; i++) {
    const v = min + ((max - min) * i) / ticks,
      px = x(v);
    add("line", { x1: px, x2: px, y1: 15, y2: 325, stroke: "#e0e7df" });
    add(
      "text",
      { x: px, y: 350, "text-anchor": "middle", "font-size": 13 },
      v.toFixed(1),
    );
  }
  add(
    "text",
    { x: left + span / 2, y: 377, "text-anchor": "middle", "font-size": 13 },
    unit,
  );
  AGE_GROUPS.forEach((age, i) => {
    const y = 35 + i * 45,
      r = rows.find((row) => row.age_group === age);
    add(
      "text",
      { x: left - 12, y: y + 5, "text-anchor": "end", "font-size": 15 },
      age,
    );
    if (!r || !Number.isFinite(r.mean)) return;
    if (Number.isFinite(r.ci_lower) && Number.isFinite(r.ci_upper)) {
      add("line", {
        x1: x(r.ci_lower),
        x2: x(r.ci_upper),
        y1: y,
        y2: y,
        stroke: "#176955",
        "stroke-width": 2.5,
      });
      [r.ci_lower, r.ci_upper].forEach((v) =>
        add("line", {
          x1: x(v),
          x2: x(v),
          y1: y - 6,
          y2: y + 6,
          stroke: "#176955",
          "stroke-width": 2,
        }),
      );
    }
    add("circle", { cx: x(r.mean), cy: y, r: 5.5, fill: "#176955" });
    add(
      "text",
      { x: narrow ? 295 : 600, y: y + 5, "font-size": 15 },
      number(r.mean),
    );
  });
  container.replaceChildren(svg);
}
