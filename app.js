/* =========================================================
   ALEL Production — Live BI Dashboard
   ========================================================= */
(function () {
  "use strict";

  const SHEET_ID = "1HeKJ0XueH0WeAxLrJpNaNz_pvPuxRDElQmHcPd7QfOQ";
  const REFRESH_MS = 30000; // poll every 30s
  const PALETTE = ["#22d3ee", "#6366f1", "#a855f7", "#34d399", "#f59e0b", "#ef4444", "#14b8a6", "#eab308", "#f472b6", "#38bdf8", "#fb923c", "#4ade80"];
  const $ = (s) => document.querySelector(s);

  /* ---------------- CSV ---------------- */
  function parseCSV(text) {
    const rows = [];
    let row = [], field = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
        else field += c;
      } else if (c === '"') q = true;
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
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = +s;
      if (n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    }
    const d = new Date(s);
    return isNaN(d) ? null : d;
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
    return rows.slice(1).filter((r) => r.some((c) => c !== "")).map((r) => {
      const o = {};
      header.forEach((h, i) => { if (h) o[h] = r[i]; });
      return o;
    });
  }

  const state = {
    prod: [], def: [], sig: "", loading: false, firstLoad: true,
    filters: { from: "", to: "", pg: "", section: "", line: "", item: "" },
    cross: { dim: "", value: "" },
  };

  async function loadData(manual) {
    if (state.loading) return;
    state.loading = true;
    setLive("updating", "Updating…");
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
      setLive("live", `Live · updated ${now.toLocaleTimeString()}`);
      $("#lastUpdated").textContent = `Last updated ${now.toLocaleString()}`;
      if (changed) {
        if (state.firstLoad) initSlicers();
        render();
        if (!state.firstLoad) toast("New data loaded ✓");
      }
      state.firstLoad = false;
      $("#overlay").classList.add("hide");
    } catch (e) {
      setLive("", "Offline — retrying…");
      $("#loadMsg").textContent = "Could not reach the sheet. Retrying…";
      if (!state.firstLoad) toast("Update failed — retrying");
    } finally {
      state.loading = false;
      const btn = $("#refreshBtn");
      btn.classList.remove("spin");
    }
  }

  function normalizeProd(objs) {
    return objs.map((o) => ({
      date: toDate(o["Date"]), itemCode: String(o["Item Code"] || ""), item: String(o["Item Name"] || ""),
      line: String(o["Line Name"] || ""), time: String(o["Time"] || ""), manpower: num(o["Manpower"]),
      production: num(o["Production"]), productivity: num(o["Productivity"]), target: num(o["Target Productivity"]),
      achievement: num(o["Achievement %"]), pg: String(o["PG"] || ""), section: String(o["Section"] || ""),
      user: String(o["User Mail"] || ""), opMin: num(o["Operating Minutes"]),
    })).filter((r) => r.date);
  }
  function normalizeDef(objs) {
    return objs.map((o) => ({
      date: toDate(o["Date"]), time: String(o["Time Slot"] || ""), itemCode: String(o["Item Code"] || ""),
      item: String(o["Item"] || ""), line: String(o["Line"] || ""), pg: String(o["PG"] || ""),
      problem: String(o["Problem Type"] || ""), qty: num(o["Defective Qty"]), user: String(o["User Mail"] || ""),
    })).filter((r) => r.date || r.problem);
  }

  /* ---------------- Filters ---------------- */
  function filteredProd() {
    const f = state.filters, c = state.cross;
    return state.prod.filter((r) => {
      if (f.from && dstr(r.date) < f.from) return false;
      if (f.to && dstr(r.date) > f.to) return false;
      if (f.pg && r.pg !== f.pg) return false;
      if (f.section && r.section !== f.section) return false;
      if (f.line && r.line !== f.line) return false;
      if (f.item && r.item !== f.item) return false;
      if (c.dim === "pg" && r.pg !== c.value) return false;
      if (c.dim === "section" && r.section !== c.value) return false;
      if (c.dim === "line" && r.line !== c.value) return false;
      if (c.dim === "item" && r.item !== c.value) return false;
      if (c.dim === "date" && dstr(r.date) !== c.value) return false;
      return true;
    });
  }
  function filteredDef() {
    const f = state.filters, c = state.cross;
    return state.def.filter((r) => {
      if (f.from && r.date && dstr(r.date) < f.from) return false;
      if (f.to && r.date && dstr(r.date) > f.to) return false;
      if (f.pg && r.pg !== f.pg) return false;
      if (f.line && r.line !== f.line) return false;
      if (f.item && r.item !== f.item) return false;
      if (c.dim === "pg" && r.pg !== c.value) return false;
      if (c.dim === "line" && r.line !== c.value) return false;
      if (c.dim === "item" && r.item !== c.value) return false;
      if (c.dim === "defectType" && r.problem !== c.value) return false;
      if (c.dim === "date" && r.date && dstr(r.date) !== c.value) return false;
      return true;
    });
  }

  /* ---------------- Aggregation ---------------- */
  const sum = (arr, f) => arr.reduce((a, r) => a + f(r), 0);
  const avg = (arr, f) => (arr.length ? sum(arr, f) / arr.length : 0);
  function groupSum(rows, key, val) {
    const m = new Map();
    rows.forEach((r) => { const k = key(r) || "(blank)"; m.set(k, (m.get(k) || 0) + val(r)); });
    return [...m.entries()].map(([k, v]) => ({ k, v }));
  }
  function groupAvg(rows, key, val) {
    const s = new Map(), c = new Map();
    rows.forEach((r) => { const k = key(r) || "(blank)"; s.set(k, (s.get(k) || 0) + val(r)); c.set(k, (c.get(k) || 0) + 1); });
    return [...s.entries()].map(([k, v]) => ({ k, v: v / c.get(k) }));
  }
  const sortByV = (a) => a.sort((x, y) => y.v - x.v);
  const nf = (n, d = 0) => Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

  /* ---------------- KPI ---------------- */
  function renderKpis(p, d) {
    const prod = sum(p, (r) => r.production);
    const ach = avg(p, (r) => r.achievement);
    const prodv = avg(p, (r) => r.productivity);
    const target = avg(p, (r) => r.target);
    const mp = avg(p, (r) => r.manpower);
    const defects = sum(d, (r) => r.qty);
    const rate = prod > 0 ? (defects / prod) * 100 : 0;
    const hours = sum(p, (r) => r.opMin) / 60;
    const cards = [
      ["Total Production", nf(prod), `${nf(p.length)} entries`, "var(--c1)"],
      ["Avg Achievement", nf(ach, 1) + "%", `target-based`, "var(--c4)"],
      ["Avg Productivity", nf(prodv, 2), `target ${nf(target, 1)}`, "var(--c2)"],
      ["Avg Manpower", nf(mp, 1), `per entry`, "var(--c7)"],
      ["Total Defects", nf(defects), `${nf(d.length)} defect logs`, "var(--c6)"],
      ["Defect Rate", nf(rate, 2) + "%", `of production`, "var(--c5)"],
      ["Operating Hours", nf(hours, 1), `from minutes`, "var(--c3)"],
      ["Active Lines", nf(new Set(p.map((r) => r.line)).size), `${nf(new Set(p.map((r) => r.item)).size)} items`, "var(--c10)"],
    ];
    $("#kpis").innerHTML = cards.map(([lab, val, sub, col]) =>
      `<div class="kpi"><span class="accent-bar" style="background:${col}"></span><div class="lab">${lab}</div><div class="val">${val}</div><div class="sub">${sub}</div></div>`
    ).join("");
  }

  /* ---------------- Charts ---------------- */
  const charts = {};
  const themeColors = () => {
    const cs = getComputedStyle(document.documentElement);
    return { text: cs.getPropertyValue("--muted").trim(), grid: cs.getPropertyValue("--border").trim() };
  };
  function baseOpts() {
    const t = themeColors();
    return {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: t.text, boxWidth: 12, font: { size: 11 } } }, tooltip: { backgroundColor: "rgba(8,12,22,.95)", borderColor: t.grid, borderWidth: 1, padding: 10 } },
      scales: { x: { ticks: { color: t.text, font: { size: 10.5 } }, grid: { color: t.grid, drawBorder: false } }, y: { ticks: { color: t.text, font: { size: 10.5 } }, grid: { color: t.grid, drawBorder: false }, beginAtZero: true } },
    };
  }
  function pieOpts() {
    const t = themeColors();
    return { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "right", labels: { color: t.text, boxWidth: 12, font: { size: 11 } } }, tooltip: { backgroundColor: "rgba(8,12,22,.95)", padding: 10 } } };
  }
  function mk(id, type, data, options, onClick) {
    const ctx = $("#" + id);
    if (!ctx) return null;
    if (charts[id]) { charts[id].destroy(); }
    const cfg = { type, data, options };
    if (onClick) cfg.options.onClick = onClick;
    charts[id] = new Chart(ctx, cfg);
    return charts[id];
  }
  function toggleCross(dim, value) {
    if (state.cross.dim === dim && state.cross.value === value) state.cross = { dim: "", value: "" };
    else state.cross = { dim, value };
    render();
  }
  const clickBar = (dim) => (e, els) => { if (els.length) { const c = els[0]; const label = c.chart.data.labels[c.index]; toggleCross(dim, String(label)); } };
  const clickPie = (dim) => (e, els) => { if (els.length) { const label = els[0].chart.data.labels[els[0].index]; toggleCross(dim, String(label)); } };

  function bar(labels, values, label, color) {
    return { labels, datasets: [{ label, data: values, backgroundColor: color, borderRadius: 6, maxBarThickness: 42 }] };
  }

  function renderCharts(p, d) {
    const byDate = sortByV(groupSum(p, (r) => dstr(r.date), (r) => r.production)).sort((a, b) => (a.k < b.k ? -1 : 1));
    const t = themeColors();
    // Production trend
    const pd = charts.cProdDate;
    const pdata = { labels: byDate.map((x) => x.k), datasets: [{ label: "Production", data: byDate.map((x) => x.v), borderColor: "#22d3ee", backgroundColor: "rgba(34,211,238,.18)", fill: true, tension: .35, pointRadius: 2, borderWidth: 2 }] };
    if (pd) { pd.data = pdata; pd.update(); } else { const o = baseOpts(); mk("cProdDate", "line", pdata, o, clickBar("date")); }

    // Achievement by PG
    const achPg = sortByV(groupAvg(p, (r) => r.pg, (r) => r.achievement));
    const ap = { labels: achPg.map((x) => x.k), datasets: [{ label: "Avg Achv %", data: achPg.map((x) => +x.v.toFixed(1)), backgroundColor: achPg.map((_, i) => PALETTE[i % PALETTE.length]), borderRadius: 6, maxBarThickness: 40 }] };
    if (charts.cAchPg) { charts.cAchPg.data = ap; charts.cAchPg.update(); } else mk("cAchPg", "bar", ap, baseOpts(), clickBar("pg"));

    // Production by Section (doughnut)
    const sec = sortByV(groupSum(p, (r) => r.section, (r) => r.production));
    const sd = { labels: sec.map((x) => x.k), datasets: [{ data: sec.map((x) => x.v), backgroundColor: sec.map((_, i) => PALETTE[i % PALETTE.length]), borderWidth: 0 }] };
    if (charts.cSection) { charts.cSection.data = sd; charts.cSection.update(); } else mk("cSection", "doughnut", sd, pieOpts(), clickPie("section"));

    // Production vs Target by PG
    const pv = groupAvg(p, (r) => r.pg, (r) => r.productivity);
    const tv = groupAvg(p, (r) => r.pg, (r) => r.target);
    const tmap = Object.fromEntries(tv.map((x) => [x.k, x.v]));
    pv.sort((a, b) => a.k.localeCompare(b.k));
    const pvdata = { labels: pv.map((x) => x.k), datasets: [
      { label: "Productivity", data: pv.map((x) => +x.v.toFixed(2)), backgroundColor: "#6366f1", borderRadius: 6, maxBarThickness: 30 },
      { label: "Target", data: pv.map((x) => +(tmap[x.k] || 0).toFixed(2)), backgroundColor: "#f59e0b", borderRadius: 6, maxBarThickness: 30 },
    ] };
    if (charts.cProdVsTarget) { charts.cProdVsTarget.data = pvdata; charts.cProdVsTarget.update(); } else mk("cProdVsTarget", "bar", pvdata, baseOpts(), clickBar("pg"));

    // Production by Line
    const ln = sortByV(groupSum(p, (r) => r.line, (r) => r.production)).slice(0, 12);
    const ldata = { labels: ln.map((x) => x.k), datasets: [{ label: "Production", data: ln.map((x) => x.v), backgroundColor: "#34d399", borderRadius: 6, maxBarThickness: 34 }] };
    if (charts.cLine) { charts.cLine.data = ldata; charts.cLine.update(); } else mk("cLine", "bar", ldata, baseOpts(), clickBar("line"));

    // Defects by Problem Type (top 10, horizontal)
    const dt = sortByV(groupSum(d, (r) => r.problem, (r) => r.qty)).slice(0, 10);
    const dtd = { labels: dt.map((x) => x.k), datasets: [{ label: "Defective Qty", data: dt.map((x) => x.v), backgroundColor: "#ef4444", borderRadius: 6, maxBarThickness: 26 }] };
    const dto = baseOpts(); dto.indexAxis = "y";
    if (charts.cDefectType) { charts.cDefectType.data = dtd; charts.cDefectType.update(); } else mk("cDefectType", "bar", dtd, dto, clickBar("defectType"));

    // Defect share by PG
    const dpg = sortByV(groupSum(d, (r) => r.pg, (r) => r.qty));
    const dpgd = { labels: dpg.map((x) => x.k), datasets: [{ data: dpg.map((x) => x.v), backgroundColor: dpg.map((_, i) => PALETTE[i % PALETTE.length]), borderWidth: 0 }] };
    if (charts.cDefectPg) { charts.cDefectPg.data = dpgd; charts.cDefectPg.update(); } else mk("cDefectPg", "doughnut", dpgd, pieOpts(), clickPie("pg"));

    // Defect trend by date
    const dd = groupSum(d, (r) => dstr(r.date), (r) => r.qty).sort((a, b) => (a.k < b.k ? -1 : 1));
    const ddd = { labels: dd.map((x) => x.k), datasets: [{ label: "Defects", data: dd.map((x) => x.v), borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,.18)", fill: true, tension: .35, pointRadius: 2, borderWidth: 2 }] };
    if (charts.cDefectDate) { charts.cDefectDate.data = ddd; charts.cDefectDate.update(); } else mk("cDefectDate", "line", ddd, baseOpts(), clickBar("date"));
  }

  /* ---------------- Table ---------------- */
  function renderTable(p, d) {
    const map = new Map();
    p.forEach((r) => {
      const k = r.item || r.itemCode;
      if (!map.has(k)) map.set(k, { item: k, pg: r.pg, prod: 0, ach: 0, n: 0, mp: 0, def: 0 });
      const o = map.get(k); o.prod += r.production; o.ach += r.achievement; o.mp += r.manpower; o.n++;
    });
    const dmap = new Map();
    d.forEach((r) => { const k = r.item || r.itemCode; dmap.set(k, (dmap.get(k) || 0) + r.qty); });
    const rows = [...map.values()].map((o) => ({ ...o, ach: o.n ? o.ach / o.n : 0, mp: o.n ? o.mp / o.n : 0, def: dmap.get(o.item) || 0 })).sort((a, b) => b.prod - a.prod).slice(0, 15);
    $("#tblItems").innerHTML = rows.map((r, i) =>
      `<tr data-item="${r.item.replace(/"/g, "&quot;")}"><td><span class="rank">${i + 1}</span></td><td>${r.item}</td><td>${r.pg}</td><td class="num">${nf(r.prod)}</td><td class="num">${nf(r.ach, 1)}%</td><td class="num">${nf(r.mp, 1)}</td><td class="num">${nf(r.def)}</td></tr>`
    ).join("");
    document.querySelectorAll("#tblItems tr").forEach((tr) => tr.addEventListener("click", () => toggleCross("item", tr.dataset.item)));
  }

  /* ---------------- Render ---------------- */
  function render() {
    const p = filteredProd();
    const d = filteredDef();
    renderKpis(p, d);
    renderCharts(p, d);
    renderTable(p, d);
    renderChips();
    document.querySelectorAll(".panel").forEach((el) => el.classList.toggle("no-data", el.querySelector("canvas") && el.querySelector("canvas").width === 0));
  }

  /* ---------------- Slicers ---------------- */
  function fillSelect(sel, values) {
    const el = $(sel);
    const cur = el.value;
    el.innerHTML = `<option value="">All</option>` + values.map((v) => `<option value="${String(v).replace(/"/g, "&quot;")}">${v}</option>`).join("");
    if (values.includes(cur)) el.value = cur;
  }
  function initSlicers() {
    const uniq = (f) => [...new Set(state.prod.map(f).filter(Boolean))].sort();
    fillSelect("#fPg", uniq((r) => r.pg));
    fillSelect("#fSection", uniq((r) => r.section));
    fillSelect("#fLine", uniq((r) => r.line));
    fillSelect("#fItem", uniq((r) => r.item));
    const dates = state.prod.map((r) => dstr(r.date)).filter(Boolean).sort();
    if (dates.length) {
      const from = $("#fFrom"), to = $("#fTo");
      from.min = to.min = dates[0];
      from.max = to.max = dates[dates.length - 1];
      from.value = dates[0]; to.value = dates[dates.length - 1];
      state.filters.from = dates[0]; state.filters.to = dates[dates.length - 1];
    }
    ["#fFrom", "#fTo", "#fPg", "#fSection", "#fLine", "#fItem"].forEach((id) => {
      $(id).addEventListener("change", () => {
        state.filters.from = $("#fFrom").value;
        state.filters.to = $("#fTo").value;
        state.filters.pg = $("#fPg").value;
        state.filters.section = $("#fSection").value;
        state.filters.line = $("#fLine").value;
        state.filters.item = $("#fItem").value;
        render();
      });
    });
  }
  function renderChips() {
    const chips = [];
    const c = state.cross;
    if (c.dim) chips.push({ label: `${c.dim}: ${c.value}`, clear: () => (state.cross = { dim: "", value: "" }) });
    const f = state.filters;
    if (f.pg) chips.push({ label: `PG: ${f.pg}`, clear: () => { state.filters.pg = ""; $("#fPg").value = ""; } });
    if (f.section) chips.push({ label: `Section: ${f.section}`, clear: () => { state.filters.section = ""; $("#fSection").value = ""; } });
    if (f.line) chips.push({ label: `Line: ${f.line}`, clear: () => { state.filters.line = ""; $("#fLine").value = ""; } });
    if (f.item) chips.push({ label: `Item: ${f.item}`, clear: () => { state.filters.item = ""; $("#fItem").value = ""; } });
    $("#chips").innerHTML = chips.length
      ? chips.map((ch, i) => `<span class="chip">${ch.label}<button data-i="${i}">✕</button></span>`).join("") + `<button class="clear-btn" id="clearAll">Clear all</button>`
      : `<span class="hint" style="color:var(--muted);font-size:12px">Click any chart to cross-filter · all visuals update together</span>`;
    document.querySelectorAll("#chips .chip button").forEach((b) => b.addEventListener("click", () => { chips[+b.dataset.i].clear(); render(); }));
    const ca = $("#clearAll");
    if (ca) ca.addEventListener("click", () => { state.cross = { dim: "", value: "" }; state.filters = { ...state.filters, pg: "", section: "", line: "", item: "" }; ["#fPg", "#fSection", "#fLine", "#fItem"].forEach((s) => ($(s).value = "")); render(); });
  }

  /* ---------------- Live ---------------- */
  function setLive(cls, text) {
    const pill = $("#livePill");
    pill.classList.toggle("updating", cls === "updating");
    $("#liveText").textContent = text;
  }
  let toastT;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600);
  }

  /* ---------------- Theme ---------------- */
  const root = document.documentElement;
  root.setAttribute("data-theme", localStorage.getItem("alel-dash-theme") || "dark");
  $("#themeBtn").addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    localStorage.setItem("alel-dash-theme", next);
    Object.values(charts).forEach((c) => c.destroy());
    Object.keys(charts).forEach((k) => delete charts[k]);
    render();
  });

  $("#refreshBtn").addEventListener("click", () => { $("#refreshBtn").classList.add("spin"); loadData(true); });

  /* ---------------- PWA ---------------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
  let deferred = null;
  const installBtn = $("#installBtn");
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; installBtn.classList.add("show"); });
  installBtn.addEventListener("click", () => {
    if (deferred) { deferred.prompt(); deferred.userChoice.then(() => { deferred = null; installBtn.classList.remove("show"); }); return; }
    alert("To install:\n\n• Windows (Edge/Chrome): menu ⋮ → Apps → Install this site as an app\n• iPhone/iPad (Safari): Share ⬆ → Add to Home Screen\n• Android (Chrome): ⋮ → Install app");
  });
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS && !navigator.standalone) installBtn.classList.add("show");

  /* ---------------- Boot ---------------- */
  loadData();
  setInterval(() => { if (!document.hidden) loadData(); }, REFRESH_MS);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadData(); });
})();
