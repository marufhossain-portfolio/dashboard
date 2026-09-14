/* =========================================================
   ALEL Production — Live BI Dashboard (v2)
   ========================================================= */
(function () {
  "use strict";

  const SHEET_ID = "1HeKJ0XueH0WeAxLrJpNaNz_pvPuxRDElQmHcPd7QfOQ";
  const REFRESH_MS = 30000;
  const PALETTE = ["#22d3ee", "#6366f1", "#a855f7", "#34d399", "#f59e0b", "#ef4444", "#14b8a6", "#eab308", "#f472b6", "#38bdf8", "#fb923c", "#4ade80", "#c084fc", "#2dd4bf", "#facc15", "#f87171"];
  const $ = (s) => document.querySelector(s);

  /* ---------------- CSV ---------------- */
  function parseCSV(text) {
    const rows = []; let row = [], field = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c !== "\r") field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
  }
  const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  function toDate(v) {
    if (v == null || v === "") return null;
    const s = String(v).trim();
    let m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (m) return new Date(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    if (/^\d+(\.\d+)?$/.test(s)) { const n = +s; if (n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + n * 86400000); }
    const d = new Date(s); return isNaN(d) ? null : d;
  }
  const num = (v) => { const n = parseFloat(String(v == null ? "" : v).replace(/[%,]/g, "")); return isNaN(n) ? 0 : n; };
  const dstr = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "");

  /* ---------------- Load ---------------- */
  async function fetchSheet(name) {
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(name)}&_=${Date.now()}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    return parseCSV(await res.text());
  }
  function rowsToObjects(rows) {
    const header = (rows[0] || []).map((h) => String(h).trim());
    return rows.slice(1).filter((r) => r.some((c) => c !== "")).map((r) => { const o = {}; header.forEach((h, i) => { if (h) o[h] = r[i]; }); return o; });
  }

  const state = { prod: [], def: [], sig: "", loading: false, firstLoad: true,
    filters: { from: "", to: "", pg: "", section: "", line: "", item: "" },
    cross: { dim: "", value: "" } };

  async function loadData() {
    if (state.loading) return;
    state.loading = true;
    setLive(true, "Updating…");
    try {
      const [p, d] = await Promise.all([fetchSheet("Production_Data"), fetchSheet("Defect_Data")]);
      const sig = `${p.length}|${d.length}|${p[p.length - 1] ? p[p.length - 1].join("~") : ""}|${d[d.length - 1] ? d[d.length - 1].join("~") : ""}`;
      const changed = sig !== state.sig;
      if (changed) {
        state.prod = normalizeProd(rowsToObjects(p));
        state.def = normalizeDef(rowsToObjects(d));
        state.sig = sig;
      }
      const now = new Date();
      setLive(false, `Live · ${now.toLocaleTimeString()}`);
      $("#lastUpdated").textContent = `Last updated ${now.toLocaleString()}`;
      if (changed) { if (state.firstLoad) initSlicers(); render(); if (!state.firstLoad) toast("New data loaded ✓"); }
      state.firstLoad = false;
      $("#overlay").classList.add("hide");
    } catch (e) {
      setLive(false, "Offline — retrying…");
      $("#loadMsg").textContent = "Could not reach the sheet. Retrying…";
    } finally { state.loading = false; $("#refreshBtn").classList.remove("spin"); }
  }

  function normalizeProd(o) {
    return o.map((r) => ({ date: toDate(r["Date"]), itemCode: String(r["Item Code"] || ""), item: String(r["Item Name"] || ""),
      line: String(r["Line Name"] || ""), manpower: num(r["Manpower"]), production: num(r["Production"]),
      productivity: num(r["Productivity"]), target: num(r["Target Productivity"]), achievement: num(r["Achievement %"]),
      pg: String(r["PG"] || ""), section: String(r["Section"] || ""), opMin: num(r["Operating Minutes"]) })).filter((r) => r.date);
  }
  function normalizeDef(o) {
    return o.map((r) => ({ date: toDate(r["Date"]), itemCode: String(r["Item Code"] || ""), item: String(r["Item"] || ""),
      line: String(r["Line"] || ""), pg: String(r["PG"] || ""), problem: String(r["Problem Type"] || ""), qty: num(r["Defective Qty"]) })).filter((r) => r.date || r.problem);
  }

  /* ---------------- Relationship (defect <-> production) ---------------- */
  function defMatches(r, ignoreDim) {
    const f = state.filters, c = state.cross;
    if (f.from && r.date && dstr(r.date) < f.from) return false;
    if (f.to && r.date && dstr(r.date) > f.to) return false;
    if (f.pg && r.pg !== f.pg) return false;
    if (f.line && r.line !== f.line) return false;
    if (f.item && r.item !== f.item) return false;
    if (c.dim && c.dim !== ignoreDim) {
      if (c.dim === "pg" && r.pg !== c.value) return false;
      if (c.dim === "line" && r.line !== c.value) return false;
      if (c.dim === "item" && r.item !== c.value) return false;
      if (c.dim === "defectType" && r.problem !== c.value) return false;
      if (c.dim === "date" && r.date && dstr(r.date) !== c.value) return false;
    }
    return true;
  }
  // item codes/lines affected by the active defect-type selection
  function defectAffectedItems() {
    const c = state.cross;
    if (c.dim !== "defectType") return null;
    const items = new Set(), lines = new Set();
    state.def.forEach((r) => {
      if (r.problem !== c.value) return;
      if (!defMatches(r, "defectType")) return;
      if (r.itemCode) items.add(r.itemCode);
      if (r.item) items.add(r.item);
      if (r.line) lines.add(r.line);
    });
    return { items, lines };
  }
  function prodMatches(r, ignoreDim, aff) {
    const f = state.filters, c = state.cross;
    if (f.from && dstr(r.date) < f.from) return false;
    if (f.to && dstr(r.date) > f.to) return false;
    if (f.pg && r.pg !== f.pg) return false;
    if (f.section && r.section !== f.section) return false;
    if (f.line && r.line !== f.line) return false;
    if (f.item && r.item !== f.item) return false;
    if (c.dim && c.dim !== ignoreDim) {
      if (c.dim === "pg" && r.pg !== c.value) return false;
      if (c.dim === "section" && r.section !== c.value) return false;
      if (c.dim === "line" && r.line !== c.value) return false;
      if (c.dim === "item" && r.item !== c.value) return false;
      if (c.dim === "date" && dstr(r.date) !== c.value) return false;
      if (c.dim === "defectType" && aff) { if (!(aff.items.has(r.itemCode) || aff.items.has(r.item))) return false; }
    }
    return true;
  }
  const filteredProd = (ignoreDim) => { const aff = defectAffectedItems(); return state.prod.filter((r) => prodMatches(r, ignoreDim, aff)); };
  const filteredDef = (ignoreDim) => state.def.filter((r) => defMatches(r, ignoreDim));

  /* ---------------- Aggregation ---------------- */
  const sum = (a, f) => a.reduce((x, r) => x + f(r), 0);
  const avg = (a, f) => (a.length ? sum(a, f) / a.length : 0);
  function groupSum(rows, key, val) { const m = new Map(); rows.forEach((r) => { const k = key(r) || "(blank)"; m.set(k, (m.get(k) || 0) + val(r)); }); return [...m.entries()].map(([k, v]) => ({ k, v })); }
  function groupAvg(rows, key, val) { const s = new Map(), c = new Map(); rows.forEach((r) => { const k = key(r) || "(blank)"; s.set(k, (s.get(k) || 0) + val(r)); c.set(k, (c.get(k) || 0) + 1); }); return [...s.entries()].map(([k, v]) => ({ k, v: v / c.get(k) })); }
  const sortByV = (a) => a.sort((x, y) => y.v - x.v);
  const nf = (n, d = 0) => Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  /* ---------------- KPI ---------------- */
  const ICON = {
    prod: '<path d="M3 13h4v8H3zm7-6h4v14h-4zm7 3h4v11h-4z"/>',
    ach: '<path d="M12 2 3 7v6c0 5 3.8 9.3 9 10 5.2-.7 9-5 9-10V7l-9-5zm-1 13-3-3 1.4-1.4L11 12.2l4.6-4.6L17 9l-6 6z"/>',
    prodv: '<path d="M13 2 3 14h7l-1 8 10-12h-7z"/>',
    mp: '<path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-8 1a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.7 0-6 1.3-6 4v3h8v-3c0-1 .4-1.9 1.1-2.6A8.5 8.5 0 0 0 8 14z"/>',
    def: '<path d="M12 2 1 21h22L12 2zm1 15h-2v-2h2v2zm0-4h-2V9h2v4z"/>',
    rate: '<path d="M4 20h16v2H4zM6 10h3v8H6zm5-6h3v14h-3zm5 4h3v10h-3z"/>',
    hours: '<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 11h5v-2h-3V7h-2z"/>',
    lines: '<path d="M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z"/>',
  };
  function renderKpis(p, d) {
    const prod = sum(p, (r) => r.production), ach = avg(p, (r) => r.achievement), prodv = avg(p, (r) => r.productivity);
    const target = avg(p, (r) => r.target), mp = avg(p, (r) => r.manpower), defects = sum(d, (r) => r.qty);
    const rate = prod > 0 ? (defects / prod) * 100 : 0, hours = sum(p, (r) => r.opMin) / 60;
    const cards = [
      ["Total Production", nf(prod), `${nf(p.length)} entries`, "prod", "#22d3ee", "#0ea5e9"],
      ["Avg Achievement", nf(ach, 1) + "%", `vs target`, "ach", "#34d399", "#10b981"],
      ["Avg Productivity", nf(prodv, 2), `target ${nf(target, 1)}`, "prodv", "#a855f7", "#6366f1"],
      ["Avg Manpower", nf(mp, 1), `per entry`, "mp", "#14b8a6", "#0d9488"],
      ["Total Defects", nf(defects), `${nf(d.length)} logs`, "def", "#ef4444", "#f97316"],
      ["Defect Rate", nf(rate, 2) + "%", `of production`, "rate", "#f59e0b", "#ef4444"],
      ["Operating Hours", nf(hours, 1), `from minutes`, "hours", "#38bdf8", "#6366f1"],
      ["Active Lines", nf(new Set(p.map((r) => r.line)).size), `${nf(new Set(p.map((r) => r.item)).size)} items`, "lines", "#f472b6", "#a855f7"],
    ];
    $("#kpis").innerHTML = cards.map(([lab, val, sub, ic, c1, c2]) =>
      `<div class="kpi" style="--k1:${c1};--k2:${c2}">
         <div class="kpi-top"><span class="kpi-ic"><svg viewBox="0 0 24 24" fill="currentColor">${ICON[ic]}</svg></span><span class="lab">${lab}</span></div>
         <div class="val">${val}</div><div class="sub">${sub}</div>
       </div>`).join("");
  }

  /* ---------------- Charts ---------------- */
  const charts = {};
  const tc = () => { const cs = getComputedStyle(document.documentElement); return { text: cs.getPropertyValue("--muted").trim(), grid: cs.getPropertyValue("--border").trim() }; };
  function grad(ctx, c1, c2, horiz) {
    const chart = ctx.chart, area = chart.chartArea;
    if (!area) return c1;
    const g = horiz ? chart.ctx.createLinearGradient(area.left, 0, area.right, 0) : chart.ctx.createLinearGradient(0, area.bottom, 0, area.top);
    g.addColorStop(0, c1); g.addColorStop(1, c2); return g;
  }
  const gradFn = (c1, c2, horiz) => (ctx) => grad(ctx, c1, c2, horiz);
  function baseOpts() {
    const t = tc();
    return {
      responsive: true, maintainAspectRatio: false, animation: { duration: 700 },
      plugins: { legend: { labels: { color: t.text, boxWidth: 12, font: { size: 11 }, usePointStyle: true } }, tooltip: { backgroundColor: "rgba(8,12,22,.95)", borderColor: t.grid, borderWidth: 1, padding: 10, titleColor: "#fff" } },
      scales: { x: { ticks: { color: t.text, font: { size: 10.5 }, maxRotation: 40, autoSkip: true }, grid: { color: t.grid, drawBorder: false } }, y: { ticks: { color: t.text, font: { size: 10.5 } }, grid: { color: t.grid, drawBorder: false }, beginAtZero: true } },
    };
  }
  function pieOpts() { const t = tc(); return { responsive: true, maintainAspectRatio: false, animation: { duration: 700 }, cutout: "58%", plugins: { legend: { position: "right", labels: { color: t.text, boxWidth: 12, font: { size: 11 }, usePointStyle: true } }, tooltip: { backgroundColor: "rgba(8,12,22,.95)", padding: 10 } } }; }
  function mk(id, type, data, options, onClick) {
    const ctx = $("#" + id); if (!ctx) return;
    if (charts[id]) charts[id].destroy();
    const cfg = { type, data, options };
    if (onClick) cfg.options.onClick = onClick;
    charts[id] = new Chart(ctx, cfg);
  }
  function toggleCross(dim, value) {
    if (state.cross.dim === dim && state.cross.value === value) state.cross = { dim: "", value: "" };
    else state.cross = { dim, value };
    render();
  }
  const clickBar = (dim) => (e, els, chart) => { if (els.length && chart) toggleCross(dim, String(chart.data.labels[els[0].index])); };
  const clickPie = (dim) => (e, els, chart) => { if (els.length && chart) toggleCross(dim, String(chart.data.labels[els[0].index])); };

  function renderCharts(p, d) {
    // ---- Production trend ----
    const byDate = groupSum(p, (r) => dstr(r.date), (r) => r.production).sort((a, b) => (a.k < b.k ? -1 : 1));
    const pd = { labels: byDate.map((x) => x.k), datasets: [{ label: "Production", data: byDate.map((x) => x.v), borderColor: "#22d3ee", backgroundColor: (c) => grad(c, "rgba(34,211,238,.05)", "rgba(34,211,238,.45)"), fill: true, tension: .35, pointRadius: 2, pointBackgroundColor: "#22d3ee", borderWidth: 2 }] };
    if (charts.cProdDate) { charts.cProdDate.data = pd; charts.cProdDate.update(); } else mk("cProdDate", "line", pd, baseOpts(), clickBar("date"));

    // ---- Achievement by PG ----
    const achPg = sortByV(groupAvg(p, (r) => r.pg, (r) => r.achievement));
    const ap = { labels: achPg.map((x) => x.k), datasets: [{ label: "Avg Achv %", data: achPg.map((x) => +x.v.toFixed(1)), backgroundColor: gradFn("#34d399", "#059669"), borderRadius: 7, maxBarThickness: 40 }] };
    if (charts.cAchPg) { charts.cAchPg.data = ap; charts.cAchPg.update(); } else mk("cAchPg", "bar", ap, baseOpts(), clickBar("pg"));

    // ---- Production by Section (doughnut) ----
    const sec = sortByV(groupSum(p, (r) => r.section, (r) => r.production));
    const sd = { labels: sec.map((x) => x.k), datasets: [{ data: sec.map((x) => x.v), backgroundColor: sec.map((_, i) => PALETTE[i % PALETTE.length]), borderWidth: 2, borderColor: "rgba(0,0,0,.25)", hoverOffset: 8 }] };
    if (charts.cSection) { charts.cSection.data = sd; charts.cSection.update(); } else mk("cSection", "doughnut", sd, pieOpts(), clickPie("section"));

    // ---- Production vs Target by PG ----
    const pv = groupAvg(p, (r) => r.pg, (r) => r.productivity).sort((a, b) => a.k.localeCompare(b.k));
    const tmap = Object.fromEntries(groupAvg(p, (r) => r.pg, (r) => r.target).map((x) => [x.k, x.v]));
    const pvdata = { labels: pv.map((x) => x.k), datasets: [
      { label: "Productivity", data: pv.map((x) => +x.v.toFixed(2)), backgroundColor: gradFn("#a855f7", "#6366f1"), borderRadius: 6, maxBarThickness: 26 },
      { label: "Target", data: pv.map((x) => +(tmap[x.k] || 0).toFixed(2)), backgroundColor: gradFn("#fbbf24", "#f59e0b"), borderRadius: 6, maxBarThickness: 26 } ] };
    if (charts.cProdVsTarget) { charts.cProdVsTarget.data = pvdata; charts.cProdVsTarget.update(); } else mk("cProdVsTarget", "bar", pvdata, baseOpts(), clickBar("pg"));

    // ---- Production by Line ----
    const ln = sortByV(groupSum(p, (r) => r.line, (r) => r.production)).slice(0, 12);
    const ldata = { labels: ln.map((x) => x.k), datasets: [{ label: "Production", data: ln.map((x) => x.v), backgroundColor: gradFn("#22d3ee", "#2563eb"), borderRadius: 6, maxBarThickness: 34 }] };
    if (charts.cLine) { charts.cLine.data = ldata; charts.cLine.update(); } else mk("cLine", "bar", ldata, baseOpts(), clickBar("line"));

    // ---- Defects by Problem Type (self-excluded so all bars remain) ----
    const dTypeRows = filteredDef("defectType");
    const dt = sortByV(groupSum(dTypeRows, (r) => r.problem, (r) => r.qty)).slice(0, 10);
    const sel = state.cross.dim === "defectType" ? state.cross.value : "";
    const dtColors = dt.map((x, i) => (sel ? (x.k === sel ? gradFn("#ef4444", "#b91c1c", true) : "rgba(239,68,68,.28)") : gradFn("#f97316", "#ef4444", true)));
    const dtd = { labels: dt.map((x) => x.k), datasets: [{ label: "Defective Qty", data: dt.map((x) => x.v), backgroundColor: dtColors, borderRadius: 6, maxBarThickness: 26 }] };
    const dto = baseOpts(); dto.indexAxis = "y";
    if (charts.cDefectType) { charts.cDefectType.data = dtd; charts.cDefectType.update(); } else mk("cDefectType", "bar", dtd, dto, clickBar("defectType"));

    // ---- Defect share by PG ----
    const dpg = sortByV(groupSum(d, (r) => r.pg, (r) => r.qty));
    const dpgd = { labels: dpg.map((x) => x.k), datasets: [{ data: dpg.map((x) => x.v), backgroundColor: dpg.map((_, i) => PALETTE[(i + 3) % PALETTE.length]), borderWidth: 2, borderColor: "rgba(0,0,0,.25)", hoverOffset: 8 }] };
    if (charts.cDefectPg) { charts.cDefectPg.data = dpgd; charts.cDefectPg.update(); } else mk("cDefectPg", "doughnut", dpgd, pieOpts(), clickPie("pg"));

    // ---- Defect trend ----
    const dd = groupSum(d, (r) => dstr(r.date), (r) => r.qty).sort((a, b) => (a.k < b.k ? -1 : 1));
    const ddd = { labels: dd.map((x) => x.k), datasets: [{ label: "Defects", data: dd.map((x) => x.v), borderColor: "#f43f5e", backgroundColor: (c) => grad(c, "rgba(244,63,94,.05)", "rgba(244,63,94,.42)"), fill: true, tension: .35, pointRadius: 2, pointBackgroundColor: "#f43f5e", borderWidth: 2 }] };
    if (charts.cDefectDate) { charts.cDefectDate.data = ddd; charts.cDefectDate.update(); } else mk("cDefectDate", "line", ddd, baseOpts(), clickBar("date"));
  }

  /* ---------------- Table ---------------- */
  function renderTable(p, d) {
    const map = new Map();
    p.forEach((r) => { const k = r.item || r.itemCode; if (!map.has(k)) map.set(k, { item: k, pg: r.pg, prod: 0, ach: 0, n: 0, mp: 0 }); const o = map.get(k); o.prod += r.production; o.ach += r.achievement; o.mp += r.manpower; o.n++; });
    const dmap = new Map(); d.forEach((r) => { const k = r.item || r.itemCode; dmap.set(k, (dmap.get(k) || 0) + r.qty); });
    const rows = [...map.values()].map((o) => ({ ...o, ach: o.n ? o.ach / o.n : 0, mp: o.n ? o.mp / o.n : 0, def: dmap.get(o.item) || 0 })).sort((a, b) => b.prod - a.prod).slice(0, 15);
    $("#tblItems").innerHTML = rows.map((r, i) => `<tr data-item="${r.item.replace(/"/g, "&quot;")}"><td><span class="rank">${i + 1}</span></td><td>${r.item}</td><td>${r.pg}</td><td class="num">${nf(r.prod)}</td><td class="num">${nf(r.ach, 1)}%</td><td class="num">${nf(r.mp, 1)}</td><td class="num">${nf(r.def)}</td></tr>`).join("");
    document.querySelectorAll("#tblItems tr").forEach((tr) => tr.addEventListener("click", () => toggleCross("item", tr.dataset.item)));
  }

  function render() {
    const p = filteredProd(), d = filteredDef();
    renderKpis(p, d); renderCharts(p, d); renderTable(p, d); renderChips();
  }

  /* ---------------- Slicers ---------------- */
  function fillSelect(sel, values) { const el = $(sel); const cur = el.value; el.innerHTML = `<option value="">All</option>` + values.map((v) => `<option value="${String(v).replace(/"/g, "&quot;")}">${v}</option>`).join(""); if (values.includes(cur)) el.value = cur; }
  function initSlicers() {
    const uniq = (f) => [...new Set(state.prod.map(f).filter(Boolean))].sort();
    fillSelect("#fPg", uniq((r) => r.pg)); fillSelect("#fSection", uniq((r) => r.section)); fillSelect("#fLine", uniq((r) => r.line)); fillSelect("#fItem", uniq((r) => r.item));
    const dates = state.prod.map((r) => dstr(r.date)).filter(Boolean).sort();
    if (dates.length) { const from = $("#fFrom"), to = $("#fTo"); from.min = to.min = dates[0]; from.max = to.max = dates[dates.length - 1]; from.value = dates[0]; to.value = dates[dates.length - 1]; state.filters.from = dates[0]; state.filters.to = dates[dates.length - 1]; }
    ["#fFrom", "#fTo", "#fPg", "#fSection", "#fLine", "#fItem"].forEach((id) => $(id).addEventListener("change", () => {
      state.filters.from = $("#fFrom").value; state.filters.to = $("#fTo").value; state.filters.pg = $("#fPg").value;
      state.filters.section = $("#fSection").value; state.filters.line = $("#fLine").value; state.filters.item = $("#fItem").value; render();
    }));
  }
  function renderChips() {
    const chips = [], c = state.cross, f = state.filters;
    if (c.dim) chips.push({ label: `${c.dim === "defectType" ? "defect" : c.dim}: ${c.value}`, clear: () => (state.cross = { dim: "", value: "" }) });
    if (f.pg) chips.push({ label: `PG: ${f.pg}`, clear: () => { state.filters.pg = ""; $("#fPg").value = ""; } });
    if (f.section) chips.push({ label: `Section: ${f.section}`, clear: () => { state.filters.section = ""; $("#fSection").value = ""; } });
    if (f.line) chips.push({ label: `Line: ${f.line}`, clear: () => { state.filters.line = ""; $("#fLine").value = ""; } });
    if (f.item) chips.push({ label: `Item: ${f.item}`, clear: () => { state.filters.item = ""; $("#fItem").value = ""; } });
    $("#chips").innerHTML = chips.length
      ? chips.map((ch, i) => `<span class="chip">${ch.label}<button data-i="${i}">✕</button></span>`).join("") + `<button class="clear-btn" id="clearAll">Clear all</button>`
      : `<span style="color:var(--muted);font-size:12px">Click any chart bar / slice / table row to cross-filter — every visual updates together</span>`;
    document.querySelectorAll("#chips .chip button").forEach((b) => b.addEventListener("click", () => { chips[+b.dataset.i].clear(); render(); }));
    const ca = $("#clearAll"); if (ca) ca.addEventListener("click", () => { state.cross = { dim: "", value: "" }; state.filters = { ...state.filters, pg: "", section: "", line: "", item: "" }; ["#fPg", "#fSection", "#fLine", "#fItem"].forEach((s) => ($(s).value = "")); render(); });
  }

  /* ---------------- Live / toast / theme ---------------- */
  function setLive(updating, text) { $("#livePill").classList.toggle("updating", updating); $("#liveText").textContent = text; }
  let toastT; function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600); }

  const root = document.documentElement;
  root.setAttribute("data-theme", localStorage.getItem("alel-dash-theme") || "dark");
  $("#themeBtn").addEventListener("click", () => { const next = root.getAttribute("data-theme") === "light" ? "dark" : "light"; root.setAttribute("data-theme", next); localStorage.setItem("alel-dash-theme", next); Object.values(charts).forEach((c) => c.destroy()); Object.keys(charts).forEach((k) => delete charts[k]); render(); });
  $("#refreshBtn").addEventListener("click", () => { $("#refreshBtn").classList.add("spin"); loadData(); });

  /* ---------------- PWA ---------------- */
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  let deferred = null; const installBtn = $("#installBtn");
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; installBtn.classList.add("show"); });
  installBtn.addEventListener("click", () => { if (deferred) { deferred.prompt(); deferred.userChoice.then(() => { deferred = null; installBtn.classList.remove("show"); }); return; } alert("To install:\n\n• Windows (Edge/Chrome): menu ⋮ → Apps → Install this site as an app\n• iPhone/iPad (Safari): Share ⬆ → Add to Home Screen\n• Android (Chrome): ⋮ → Install app"); });
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone) installBtn.classList.add("show");

  /* ---------------- Boot ---------------- */
  loadData();
  setInterval(() => { if (!document.hidden) loadData(); }, REFRESH_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadData(); });
})();
