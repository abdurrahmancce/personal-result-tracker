// chart.js — small dependency-free SVG line chart (2 series), themed through CSS variables.
// Spec: 2px lines, 8px markers with a 2px surface ring, hairline grid, legend, crosshair tooltip.
// All text goes through textContent / esc() — names are data, never trusted markup.

const NS = "http://www.w3.org/2000/svg";

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// "Spring-2024" -> "Sp ’24" so the x axis fits on a phone.
export function shortLabel(name) {
  const m = String(name).match(/(spring|summer|autumn|fall|winter)\D*(\d{4})/i);
  if (m) return m[1].slice(0, 2) + " ’" + m[2].slice(2);
  const s = String(name);
  return s.length > 9 ? s.slice(0, 8) + "…" : s;
}

/**
 * @param {HTMLElement} el   container (its width decides the chart width)
 * @param {{labels:string[], series:{name:string, values:number[], color:string}[], fmt?:(n:number)=>string}} cfg
 */
export function renderLineChart(el, cfg) {
  const { labels, series } = cfg;
  const fmt = cfg.fmt || ((n) => n.toFixed(3));
  el.innerHTML = "";
  if (!labels.length) {
    el.innerHTML = '<p class="empty">Add some courses to see your progress.</p>';
    return;
  }

  const W = Math.max(300, el.clientWidth || 600);
  const H = W < 480 ? 240 : 300;
  const m = { top: 14, right: 16, bottom: 34, left: 40 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;

  const all = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  const lo = Math.min(...all);
  const yMin = Math.max(0, Math.floor((lo - 0.25) * 2) / 2);
  const yMax = 4;
  const x = (i) => m.left + (labels.length === 1 ? iw / 2 : (i * iw) / (labels.length - 1));
  const y = (v) => m.top + ih - ((v - yMin) / (yMax - yMin)) * ih;

  // legend (always present for 2+ series)
  const legend = document.createElement("div");
  legend.className = "chart-legend";
  series.forEach((s) => {
    const sp = document.createElement("span");
    const key = document.createElement("i");
    key.style.borderTopColor = s.color;
    sp.append(key, document.createTextNode(s.name));
    legend.append(sp);
  });
  el.append(legend);

  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  const last = labels.length - 1;
  svg.setAttribute(
    "aria-label",
    "Line chart of semester GPA and CGPA. " +
      series.map((s) => `${s.name} ends at ${fmt(s.values[last])}`).join(", ") +
      ". A table view is available."
  );

  let g = "";
  // grid + y ticks
  for (let v = yMin; v <= yMax + 1e-9; v += 0.5) {
    g += `<line x1="${m.left}" x2="${W - m.right}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)" stroke-width="1"/>`;
    g += `<text x="${m.left - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${v.toFixed(1)}</text>`;
  }
  // x labels
  labels.forEach((l, i) => {
    g += `<text x="${x(i)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="var(--muted)">${esc(shortLabel(l))}</text>`;
  });
  // lines
  series.forEach((s) => {
    const pts = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    g += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  });
  // markers (r=4 with 2px surface ring)
  series.forEach((s) => {
    s.values.forEach((v, i) => {
      g += `<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${s.color}" stroke="var(--surface-1)" stroke-width="2"/>`;
    });
  });
  // end labels (selective: only the last point of each series)
  series.forEach((s, si) => {
    const v = s.values[last];
    const dy = si === 0 ? -10 : 17;
    const anchor = last === 0 ? "middle" : "end";
    g += `<text x="${x(last)}" y="${y(v) + dy}" text-anchor="${anchor}" font-size="12" font-weight="600" fill="var(--text)">${fmt(v)}</text>`;
  });
  svg.innerHTML = g;

  // crosshair + hit columns
  const cross = document.createElementNS(NS, "line");
  cross.setAttribute("y1", m.top);
  cross.setAttribute("y2", m.top + ih);
  cross.setAttribute("stroke", "var(--muted)");
  cross.setAttribute("stroke-width", "1");
  cross.setAttribute("opacity", "0");
  svg.append(cross);

  const tip = document.createElement("div");
  tip.className = "chart-tip";
  tip.hidden = true;

  const show = (i) => {
    cross.setAttribute("x1", x(i));
    cross.setAttribute("x2", x(i));
    cross.setAttribute("opacity", "0.6");
    tip.innerHTML = "";
    const name = document.createElement("div");
    name.className = "t-name";
    name.textContent = labels[i];
    tip.append(name);
    series.forEach((s) => {
      const row = document.createElement("div");
      row.className = "t-row";
      const key = document.createElement("i");
      key.style.borderTopColor = s.color;
      const label = document.createElement("span");
      label.textContent = s.name;
      const val = document.createElement("b");
      val.textContent = fmt(s.values[i]);
      row.append(key, label, val);
      tip.append(row);
    });
    tip.hidden = false;
    const tw = tip.offsetWidth;
    let left = x(i) + 12;
    if (left + tw > W) left = x(i) - tw - 12;
    tip.style.left = Math.max(0, left) + "px";
    tip.style.top = m.top + 6 + legend.offsetHeight + 10 + "px";
  };
  const hide = () => {
    cross.setAttribute("opacity", "0");
    tip.hidden = true;
  };

  const colW = labels.length === 1 ? iw : iw / (labels.length - 1);
  labels.forEach((l, i) => {
    const r = document.createElementNS(NS, "rect");
    r.setAttribute("x", x(i) - colW / 2);
    r.setAttribute("y", m.top);
    r.setAttribute("width", colW);
    r.setAttribute("height", ih);
    r.setAttribute("fill", "transparent");
    r.setAttribute("tabindex", "0");
    r.setAttribute("aria-label", `${l}: ` + series.map((s) => `${s.name} ${fmt(s.values[i])}`).join(", "));
    r.addEventListener("pointerenter", () => show(i));
    r.addEventListener("pointermove", () => show(i));
    r.addEventListener("pointerleave", hide);
    r.addEventListener("focus", () => show(i));
    r.addEventListener("blur", hide);
    svg.append(r);
  });

  el.append(svg, tip);
}

// Table view of the same numbers (so nothing depends on hover).
export function chartTableHTML(labels, series, fmt = (n) => n.toFixed(3)) {
  const head = series.map((s) => `<th>${esc(s.name)}</th>`).join("");
  const rows = labels
    .map(
      (l, i) =>
        `<tr><td class="left">${esc(l)}</td>${series.map((s) => `<td>${fmt(s.values[i])}</td>`).join("")}</tr>`
    )
    .join("");
  return `<table class="mini-table"><thead><tr><th class="left">Semester</th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}
