/* =========================================================
   ALEL Production Dashboard — DEMO DATA (synthetic)
   ---------------------------------------------------------
   This build is a public portfolio demonstration. Every value
   below is randomly generated from a fixed seed — there is NO
   real company, production, defect or cost data in this file.
   ========================================================= */
(function () {
  "use strict";

  /* ---- deterministic PRNG (same numbers on every load) ---- */
  let s = 20260914 >>> 0;
  function rnd() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }
  function ri(a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }

  /* ---- product master (fictional SKUs, plausible SMVs) ---- */
  const PRODUCTS = [
    { c: "20010001", n: "ENOVAR PIANO ONE WAY SWITCH 6A",       g: "Switch Socket",     s: "Switch & Socket",  smv: 1.719, mp: 12 },
    { c: "20010002", n: "ENOVAR PIANO 2 PIN SOCKET 5A",         g: "Switch Socket",     s: "Switch & Socket",  smv: 1.925, mp: 17 },
    { c: "20010003", n: "ENOVAR PIANO FAN DIMMER 200W",         g: "Switch Socket",     s: "Switch & Socket",  smv: 2.439, mp: 17 },
    { c: "20010004", n: "ENOVAR PIANO INDICATOR",               g: "Switch Socket",     s: "Switch & Socket",  smv: 1.877, mp: 13 },
    { c: "20010005", n: "ENOVAR ONYX 5 PIN MULTI SOCKET 13A",   g: "Multi Socket",      s: "Switch & Socket",  smv: 2.457, mp: 15 },
    { c: "20010006", n: "ENOVAR ONYX THREE GANG SWITCH 16A",    g: "Multi Socket",      s: "Switch & Socket",  smv: 1.206, mp: 11 },
    { c: "20010007", n: "ENOVAR EXTENSION SOCKET 5S",           g: "Extension Socket",  s: "Switch & Socket",  smv: 14.72, mp: 14 },
    { c: "20010008", n: "ENOVAR EXTENSION SOCKET 3S",           g: "Extension Socket",  s: "Switch & Socket",  smv: 11.85, mp: 13 },
    { c: "20020001", n: "ENOVAR AC LED BULB 5W B22 DL",         g: "Regular LED Bulb",  s: "Lighting",         smv: 0.551, mp: 8 },
    { c: "20020002", n: "ENOVAR AC LED BULB 9W B22 DL",         g: "Regular LED Bulb",  s: "Lighting",         smv: 0.612, mp: 8 },
    { c: "20020003", n: "ENOVAR HIGH WATT LED 70W B22 DL",      g: "High Watt LED",     s: "Lighting",         smv: 1.813, mp: 12 },
    { c: "20020004", n: "ENOVAR PANEL SURFACE ROUND 12W DL",    g: "Panel Light",       s: "Lighting",         smv: 2.479, mp: 14 },
    { c: "20020005", n: "ENOVAR PANEL CONCEAL ROUND 18W DL",    g: "Panel Light",       s: "Lighting",         smv: 0.913, mp: 14 },
    { c: "20020006", n: "ENOVAR FLOOD LIGHT 50W DL",            g: "Flood Light",       s: "Lighting",         smv: 13.01, mp: 16 },
    { c: "20020007", n: "ENOVAR EXHAUST FAN 8 INCH",            g: "Exhaust Fan",       s: "Lighting",         smv: 5.329, mp: 19 },
    { c: "20030001", n: "ENOVAR PENDENT HOLDER B22",            g: "Holder",            s: "Accessories",      smv: 1.198, mp: 9 },
    { c: "20030002", n: "ENOVAR OCTAGONAL HOLDER E27",          g: "Holder",            s: "Accessories",      smv: 3.335, mp: 17 },
    { c: "20030003", n: "ENOVAR ROUND CEILING ROSE",            g: "Ceiling Rose",      s: "Accessories",      smv: 0.797, mp: 11 },
    { c: "20030004", n: "ENOVAR 2 PIN PLUG 10A",                g: "Plug",              s: "Accessories",      smv: 1.193, mp: 10 },
    { c: "20030005", n: "ENOVAR 3 PIN FLAT PLUG 13A",           g: "Plug",              s: "Accessories",      smv: 1.354, mp: 6 },
    { c: "20030006", n: "ENOVAR 10-13 WAY DISTRIBUTION BOX",    g: "Distribution Box",  s: "Accessories",      smv: 0.483, mp: 8 },
    { c: "20040001", n: "ENOVAR RICE COOKER 1.8L",              g: "Rice Cooker",       s: "Home Appliances",  smv: 30.0,  mp: 22 },
    { c: "20040002", n: "ENOVAR GAS STOVE DOUBLE BURNER",       g: "Gas Stove",         s: "Home Appliances",  smv: 1.495, mp: 20 },
    { c: "20040003", n: "ENOVAR ELECTRIC KETTLE 1.7L",          g: "Electric Kettle",   s: "Home Appliances",  smv: 29.09, mp: 21 },
    { c: "20040004", n: "ENOVAR INDUCTION COOKER 2000W",        g: "Induction Cooker",  s: "Home Appliances",  smv: 20.0,  mp: 18 },
  ];

  const LINES = [
    { n: "Switch Assembly Line - 1",        s: "Switch & Socket" },
    { n: "Switch Assembly Line - 2",        s: "Switch & Socket" },
    { n: "Switch Assembly Line - 3",        s: "Switch & Socket" },
    { n: "Socket Assembly Line - 1",        s: "Switch & Socket" },
    { n: "Extension Socket Assembly Line",  s: "Switch & Socket" },
    { n: "LED Bulb Line - 1",               s: "Lighting" },
    { n: "LED Bulb Line - 2",               s: "Lighting" },
    { n: "Panel Assembly Line",             s: "Lighting" },
    { n: "Flood Light Assembly Line",       s: "Lighting" },
    { n: "Exhaust Fan Assembly Line",       s: "Lighting" },
    { n: "Holder & Accessories Line - 1",   s: "Accessories" },
    { n: "Holder & Accessories Line - 2",   s: "Accessories" },
    { n: "Plug & DB Assembly Line",         s: "Accessories" },
    { n: "Home Appliance Line - 1",         s: "Home Appliances" },
    { n: "Home Appliance Line - 2",         s: "Home Appliances" },
    { n: "Home Appliance Line - 3",         s: "Home Appliances" },
  ];

  const DEFECTS = [
    "Improper Fitting", "Screw Loss/Missing", "Plastic Component Defect",
    "Loose Assembly", "Metal Base Soldering Defect", "Cosmetic Defect (Scratch/Spot)",
    "Bush/Connecting Part Defect", "Nut Defect", "Switching Failure",
    "Appearance Defect", "Contact Failure", "Riveting Defect / Missing",
  ];

  /* per-line efficiency bias so the OPEX view shows real spread */
  const bias = {};
  LINES.forEach((l, i) => { bias[l.n] = 0.54 + (i % 7) * 0.055; });

  const d2 = (n) => (n < 10 ? "0" : "") + n;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const prod = [["Date", "Item Code", "Item Name", "Line Name", "Time", "Manpower", "Production", "Productivity", "Target Productivity", "Achievement %", "PG", "Section", "User Mail", "Remarks", "Operating Minutes"]];
  const def = [["Date", "Item Code", "Item", "Line", "PG", "Problem Type", "Defective Qty"]];

  const start = new Date(2026, 6, 25), days = 51;
  for (let d = 0; d < days; d++) {
    const dt = new Date(start.getTime() + d * 86400000);
    if (dt.getDay() === 5) continue;                       // Friday = weekly holiday
    const ds = `${d2(dt.getDate())}-${MON[dt.getMonth()]}-${dt.getFullYear()}`;
    const trend = d / days;                                // slow improvement over the period
    LINES.forEach((ln) => {
      const pool = PRODUCTS.filter((p) => p.s === ln.s);
      if (!pool.length) return;
      const entries = ri(1, 3);
      for (let e = 0; e < entries; e++) {
        const p = pick(pool);
        const mp = Math.max(4, p.mp + ri(-3, 3));
        const target = +(60 / p.smv).toFixed(2);
        const factor = Math.max(0.32, bias[ln.n] + (rnd() - 0.5) * 0.2 + trend * 0.07);
        const prodv = +(target * factor).toFixed(2);
        const out = Math.max(1, Math.round(mp * prodv));
        const ach = +((prodv / target) * 100).toFixed(1);
        prod.push([ds, p.c, p.n, ln.n, `${d2(8 + e)}:00`, String(mp), String(out), String(prodv), String(target), String(ach), p.g, p.s, "demo@example.com", "", String(ri(55, 62))]);
        if (rnd() < 0.44) {
          const q = Math.max(1, Math.round(out * (0.004 + rnd() * 0.028)));
          def.push([ds, p.c, p.n, ln.n, p.g, pick(DEFECTS), String(q)]);
        }
      }
    });
  }

  window.ALEL_DEMO = true;
  window.DEMO_SHEETS = { Production_Data: prod, Defect_Data: def };
  window.DEMO_OB = PRODUCTS.map((p) => ({ n: p.n.toLowerCase(), g: p.g.toLowerCase(), s: p.s.toLowerCase(), v: p.smv }));
})();
