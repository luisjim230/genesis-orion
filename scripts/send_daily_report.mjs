#!/usr/bin/env node
/**
 * send_daily_report.mjs
 *
 * Genera y envía por Telegram dos PDFs con los datos del día anterior:
 *   1. Reporte de ventas (KPIs + vendedores + top productos)
 *   2. Compras pendientes de recibir (8+ días)
 *
 * Corre a las 8am hora Costa Rica de lun a sáb.
 * Si el día anterior fue domingo, usa los datos del sábado.
 *
 * Variables de entorno requeridas:
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *   REPORT_DATE (opcional, YYYY-MM-DD) — override manual
 */

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import fs from "node:fs";
import path from "node:path";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  SUPABASE_ANON_KEY,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  REPORT_DATE,
} = process.env;

const SUPA_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPA_KEY) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_KEY");
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) throw new Error("Missing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID");

const FONT = "DejaVu";
const BLUE = [24, 90, 157];
const RED  = [170, 30, 30];

// ───────────────────────────────────────────────
// Fecha objetivo (día anterior en CR, salta domingo)
// ───────────────────────────────────────────────
function targetDate() {
  if (REPORT_DATE) {
    const [y, m, d] = REPORT_DATE.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const crStr = new Date().toLocaleString("en-US", { timeZone: "America/Costa_Rica" });
  const cr = new Date(crStr);
  cr.setDate(cr.getDate() - 1);
  if (cr.getDay() === 0) cr.setDate(cr.getDate() - 1); // domingo → sábado
  return cr;
}

const DIAS   = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const MESES  = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

const fmtDDMMYYYY = (d) => `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
const fmtHuman    = (d) => `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}, ${d.getFullYear()}`;
const fmtCRC      = (n) => "₡" + Math.round(Number(n || 0)).toLocaleString("es-CR");

// ───────────────────────────────────────────────
// Supabase fetch con paginación
// ───────────────────────────────────────────────
async function supaFetch(queryPath) {
  const all = [];
  const LIMIT = 1000;
  let offset = 0;
  while (true) {
    const sep = queryPath.includes("?") ? "&" : "?";
    const url = `${SUPABASE_URL}/rest/v1/${queryPath}${sep}limit=${LIMIT}&offset=${offset}`;
    let rows = null;
    let lastErr = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const r = await fetch(url, {
          headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` },
        });
        if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
        rows = await r.json();
        break;
      } catch (e) {
        lastErr = e;
        await new Promise(res => setTimeout(res, 500 * (attempt + 1)));
      }
    }
    if (rows === null) throw lastErr;
    all.push(...rows);
    if (rows.length < LIMIT) break;
    offset += LIMIT;
  }
  return all;
}

// ───────────────────────────────────────────────
// Ventas (netas sin IVA, alineado con NEO "Ventas netas")
//   · se excluyen items de servicio (transporte/flete/ruteo)
//   · se prorratea por devoluciones: subt_neto = subtotal × (fact - dev) / fact
// ───────────────────────────────────────────────
function esServicio(itemNombre) {
  const s = (itemNombre || "").toLowerCase();
  return s.includes("transporte") || s.includes("flete") || s.includes("ruteo");
}

async function fetchVentas(fechaDDMMYYYY) {
  const q = encodeURIComponent(fechaDDMMYYYY);
  const rows = await supaFetch(
    `neo_items_facturados?fecha=eq.${q}&select=factura,vendedor,item,codigo_interno,cantidad_facturada,cantidad_devuelta,subtotal,costo_unitario`
  );

  let ventas = 0, utilidad = 0;
  const facturas = new Set();
  const vendMap = new Map();
  const prodMap = new Map();

  for (const r of rows) {
    if (r.factura) facturas.add(r.factura);
    if (esServicio(r.item)) continue;

    const cantF = r.cantidad_facturada || 0;
    const cantD = r.cantidad_devuelta || 0;
    const cantNeta = cantF - cantD;
    if (cantF <= 0) continue;

    const ratio = cantNeta / cantF;
    const sub  = (r.subtotal || 0) * ratio;
    const util = sub - (r.costo_unitario || 0) * cantNeta;

    ventas   += sub;
    utilidad += util;

    if (r.vendedor) {
      const v = vendMap.get(r.vendedor) || { ventas: 0, util: 0, f: new Set() };
      v.ventas += sub; v.util += util; if (r.factura) v.f.add(r.factura);
      vendMap.set(r.vendedor, v);
    }

    const key = r.codigo_interno || r.item;
    if (key) {
      const p = prodMap.get(key) || { nombre: r.item, ventas: 0, util: 0, cant: 0 };
      p.ventas += sub; p.util += util; p.cant += cantNeta;
      prodMap.set(key, p);
    }
  }

  const vendedores = [...vendMap.entries()]
    .map(([nombre, v]) => ({
      nombre, ventas: v.ventas, util: v.util,
      pct: v.ventas ? (v.util / v.ventas) * 100 : 0,
      facturas: v.f.size,
    }))
    .sort((a, b) => b.ventas - a.ventas);

  const productos = [...prodMap.values()];

  return {
    ventas, utilidad,
    pct: ventas ? (utilidad / ventas) * 100 : 0,
    facturas: facturas.size,
    tiquete: facturas.size ? ventas / facturas.size : 0,
    vendedores,
    top25ventas: [...productos].sort((a,b) => b.ventas - a.ventas).slice(0, 25),
    top15util:   [...productos].sort((a,b) => b.util   - a.util  ).slice(0, 15),
    top15cant:   [...productos].sort((a,b) => b.cant   - a.cant  ).slice(0, 15),
  };
}

// ───────────────────────────────────────────────
// Compras pendientes (8+ días, agrupado por proveedor)
// ───────────────────────────────────────────────
async function fetchCompras(asOfDate) {
  const items = await supaFetch(
    `ordenes_compra_items?estado_item=in.(pendiente,parcial)&select=orden_id,codigo,nombre,proveedor,cantidad_ordenada,cantidad_recibida`
  );
  const ordenes = await supaFetch(`ordenes_compra?select=id,fecha_orden,dias_tribucion,nombre_lote`);
  const ordMap = new Map(ordenes.map(o => [o.id, o]));

  const porProveedor = new Map();
  let totalItems = 0;

  for (const it of items) {
    const ord = ordMap.get(it.orden_id);
    if (!ord) continue;
    const fechaOrden = new Date(ord.fecha_orden);
    const dias = Math.floor((asOfDate - fechaOrden) / 86_400_000);
    if (dias < 8) continue;
    const faltante = Math.max(0, (it.cantidad_ordenada || 0) - (it.cantidad_recibida || 0));
    if (faltante <= 0) continue;

    const prov = (it.proveedor || "(sin proveedor)").trim();
    const retraso = Math.max(0, dias - (ord.dias_tribucion || 0));
    const ocLabel = `${ord.nombre_lote || "OC"} · ${fechaOrden.toISOString().slice(0, 10)}`;

    if (!porProveedor.has(prov)) porProveedor.set(prov, []);
    porProveedor.get(prov).push({
      producto: it.nombre,
      pedido: it.cantidad_ordenada || 0,
      recibido: it.cantidad_recibida || 0,
      faltante,
      dias,
      retraso,
      oc: ocLabel,
    });
    totalItems++;
  }

  const proveedores = [...porProveedor.entries()]
    .map(([nombre, lista]) => ({
      nombre,
      items: lista.sort((a, b) => b.dias - a.dias),
      totalFaltante: lista.reduce((s, x) => s + x.faltante, 0),
      maxDias: Math.max(...lista.map(x => x.dias)),
    }))
    .sort((a, b) => b.maxDias - a.maxDias);

  return { proveedores, totalItems };
}

// ───────────────────────────────────────────────
// Utilidad: cargar fuente Unicode
// ───────────────────────────────────────────────
function loadFont(doc) {
  const dir = "/usr/share/fonts/truetype/dejavu";
  const reg = fs.readFileSync(path.join(dir, "DejaVuSans.ttf")).toString("base64");
  const bold = fs.readFileSync(path.join(dir, "DejaVuSans-Bold.ttf")).toString("base64");
  doc.addFileToVFS("DejaVuSans.ttf", reg);
  doc.addFont("DejaVuSans.ttf", FONT, "normal");
  doc.addFileToVFS("DejaVuSans-Bold.ttf", bold);
  doc.addFont("DejaVuSans-Bold.ttf", FONT, "bold");
}

function footer(doc) {
  const pH = doc.internal.pageSize.getHeight();
  const pW = doc.internal.pageSize.getWidth();
  for (let p = 1; p <= doc.getNumberOfPages(); p++) {
    doc.setPage(p);
    doc.setTextColor(150, 160, 175); doc.setFontSize(7.5); doc.setFont(FONT, "normal");
    doc.text("SOL reportes · Genesis Orion", 40, pH - 20);
    doc.text(`Página ${p} de ${doc.getNumberOfPages()}`, pW - 40, pH - 20, { align: "right" });
  }
}

// ───────────────────────────────────────────────
// PDF 1 — Ventas
// ───────────────────────────────────────────────
function buildVentasPDF(sales, fechaHuman) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  loadFont(doc);
  const W = doc.internal.pageSize.getWidth();
  const M = 40;

  doc.setFillColor(...BLUE);
  doc.rect(0, 0, W, 88, "F");
  doc.setTextColor(255,255,255); doc.setFont(FONT,"bold"); doc.setFontSize(22);
  doc.text("SOL — Reporte de Ventas", M, 40);
  doc.setFont(FONT,"normal"); doc.setFontSize(11);
  doc.text(fechaHuman, M, 62);
  doc.setFontSize(9);
  doc.text("Generado automáticamente · Genesis Orion", W - M, 62, { align: "right" });

  // KPIs
  const cardY = 106, cardH = 76, gap = 10;
  const cardW = (W - M * 2 - gap * 3) / 4;
  const kpis = [
    { label: "VENTAS",   value: fmtCRC(sales.ventas),   sub: "del día" },
    { label: "UTILIDAD", value: fmtCRC(sales.utilidad), sub: sales.pct.toFixed(1) + "% margen" },
    { label: "FACTURAS", value: String(sales.facturas), sub: "emitidas" },
    { label: "TIQUETE",  value: fmtCRC(sales.tiquete),  sub: "promedio" },
  ];
  kpis.forEach((k, i) => {
    const x = M + i * (cardW + gap);
    doc.setFillColor(245,248,252);
    doc.roundedRect(x, cardY, cardW, cardH, 5, 5, "F");
    doc.setDrawColor(210,220,235);
    doc.roundedRect(x, cardY, cardW, cardH, 5, 5, "S");
    doc.setTextColor(120,130,145); doc.setFont(FONT,"normal"); doc.setFontSize(8);
    doc.text(k.label, x + 10, cardY + 16);
    doc.setTextColor(20,30,50); doc.setFont(FONT,"bold"); doc.setFontSize(14);
    doc.text(k.value, x + 10, cardY + 40);
    doc.setTextColor(120,130,145); doc.setFont(FONT,"normal"); doc.setFontSize(8);
    doc.text(k.sub, x + 10, cardY + 58);
  });

  function sectTitle(y, title) {
    doc.setTextColor(20,30,50); doc.setFont(FONT,"bold"); doc.setFontSize(12);
    doc.text(title, M, y);
    doc.setDrawColor(210,220,235); doc.line(M, y + 5, W - M, y + 5);
    return y + 16;
  }

  // Vendedores
  let y = sectTitle(cardY + cardH + 24, "Vendedores");
  autoTable(doc, {
    startY: y, margin: { left: M, right: M },
    head: [["#", "Vendedor", "Ventas", "Utilidad", "Margen", "Fact."]],
    body: sales.vendedores.map((v, i) => [
      i + 1, v.nombre, fmtCRC(v.ventas), fmtCRC(v.util), v.pct.toFixed(0) + "%", v.facturas,
    ]),
    styles: { font: FONT, fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: BLUE, textColor: 255 },
    columnStyles: {
      0: { cellWidth: 22, halign: "right", textColor: [130,140,155] },
      1: { fontStyle: "bold" },
      2: { halign: "right" }, 3: { halign: "right" },
      4: { halign: "right" }, 5: { halign: "right" },
    },
    alternateRowStyles: { fillColor: [247,250,254] },
  });

  // Page 2
  doc.addPage();
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, W, 36, "F");
  doc.setTextColor(255,255,255); doc.setFont(FONT,"bold"); doc.setFontSize(12);
  doc.text("SOL — Reporte de Ventas  ·  " + fechaHuman, M, 23);

  const truncate = (s, n) => (s && s.length > n ? s.slice(0, n) + "…" : (s || ""));

  y = sectTitle(56, "Top 25 productos por ventas");
  autoTable(doc, {
    startY: y, margin: { left: M, right: M },
    head: [["#", "Producto", "Ventas", "Margen", "Und."]],
    body: sales.top25ventas.map((p, i) => [
      i + 1,
      truncate(p.nombre, 50),
      fmtCRC(p.ventas),
      p.ventas ? ((p.util / p.ventas) * 100).toFixed(0) + "%" : "-",
      Math.round(p.cant),
    ]),
    styles: { font: FONT, fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: BLUE, textColor: 255 },
    columnStyles: {
      0: { cellWidth: 20, halign: "right", textColor: [130,140,155] },
      2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" },
    },
    alternateRowStyles: { fillColor: [247,250,254] },
  });

  y = doc.lastAutoTable.finalY + 18;
  const halfW = (W - M * 2 - 16) / 2;

  // Top 15 por utilidad
  y = sectTitle(y, "Top 15 por utilidad");
  const utilStartY = y;
  autoTable(doc, {
    startY: utilStartY, margin: { left: M, right: M + halfW + 16 },
    head: [["#", "Producto", "Utilidad", "%"]],
    body: sales.top15util.map((p, i) => [
      i + 1,
      truncate(p.nombre, 34),
      fmtCRC(p.util),
      p.ventas ? ((p.util / p.ventas) * 100).toFixed(0) + "%" : "-",
    ]),
    styles: { font: FONT, fontSize: 7.5, cellPadding: 3 },
    headStyles: { fillColor: BLUE, textColor: 255 },
    columnStyles: {
      0: { cellWidth: 18, halign: "right", textColor: [130,140,155] },
      2: { halign: "right" }, 3: { halign: "right" },
    },
    alternateRowStyles: { fillColor: [247,250,254] },
  });

  // Top 15 por cantidad (right col, same y)
  doc.setTextColor(20,30,50); doc.setFont(FONT,"bold"); doc.setFontSize(12);
  doc.text("Top 15 por cantidad", M + halfW + 16, utilStartY - 11);
  doc.setDrawColor(210,220,235);
  doc.line(M + halfW + 16, utilStartY - 6, W - M, utilStartY - 6);

  autoTable(doc, {
    startY: utilStartY, margin: { left: M + halfW + 16, right: M },
    head: [["#", "Producto", "Und."]],
    body: sales.top15cant.map((p, i) => [
      i + 1, truncate(p.nombre, 38), Math.round(p.cant),
    ]),
    styles: { font: FONT, fontSize: 7.5, cellPadding: 3 },
    headStyles: { fillColor: [40,120,80], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 18, halign: "right", textColor: [130,140,155] },
      2: { halign: "right" },
    },
    alternateRowStyles: { fillColor: [247,252,249] },
  });

  footer(doc);
  return doc;
}

// ───────────────────────────────────────────────
// PDF 2 — Compras pendientes
// ───────────────────────────────────────────────
function buildComprasPDF(compras, fechaHuman) {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  loadFont(doc);
  const W = doc.internal.pageSize.getWidth();
  const M = 40;

  doc.setFillColor(...RED);
  doc.rect(0, 0, W, 88, "F");
  doc.setTextColor(255,255,255); doc.setFont(FONT,"bold"); doc.setFontSize(20);
  doc.text("⚠  Compras Pendientes de Recibir", M, 40);
  doc.setFont(FONT,"normal"); doc.setFontSize(11);
  doc.text("Al " + fechaHuman, M, 62);
  doc.setFontSize(9);
  doc.text(
    `${compras.totalItems} ítem(s) · ${compras.proveedores.length} proveedor(es) con 8+ días sin recibirse`,
    W - M, 62, { align: "right" }
  );

  let y = 108;
  const pH = doc.internal.pageSize.getHeight();

  if (compras.proveedores.length === 0) {
    doc.setTextColor(40,120,80); doc.setFont(FONT,"bold"); doc.setFontSize(16);
    doc.text("✓  Sin compras pendientes con 8+ días", W / 2, 200, { align: "center" });
  }

  for (const prov of compras.proveedores) {
    if (y > pH - 120) {
      doc.addPage();
      doc.setFillColor(...RED);
      doc.rect(0, 0, W, 36, "F");
      doc.setTextColor(255,255,255); doc.setFont(FONT,"bold"); doc.setFontSize(12);
      doc.text("Compras Pendientes  ·  Al " + fechaHuman, M, 23);
      y = 56;
    }

    // Banda proveedor
    doc.setFillColor(240,243,248);
    doc.rect(M, y, W - M * 2, 22, "F");
    doc.setDrawColor(200,210,225);
    doc.rect(M, y, W - M * 2, 22, "S");
    doc.setTextColor(20,30,60); doc.setFont(FONT,"bold"); doc.setFontSize(9);
    doc.text(prov.nombre.length > 90 ? prov.nombre.slice(0,90) + "…" : prov.nombre, M + 8, y + 14);
    doc.setFont(FONT,"normal"); doc.setTextColor(130,50,50);
    doc.text(`${prov.items.length} ítems · ${prov.totalFaltante} u. pendientes · máx ${prov.maxDias} días`,
      W - M - 8, y + 14, { align: "right" });
    y += 26;

    autoTable(doc, {
      startY: y, margin: { left: M, right: M },
      head: [["Producto", "Pedido", "Recib.", "Falt.", "Días", "Retraso", "OC"]],
      body: prov.items.map(it => [
        (it.producto || "").length > 50 ? it.producto.slice(0,50) + "…" : (it.producto || ""),
        it.pedido, it.recibido, it.faltante, it.dias,
        it.retraso > 0 ? "+" + it.retraso : "—",
        it.oc,
      ]),
      styles: { font: FONT, fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: RED, textColor: 255 },
      columnStyles: {
        1: { halign: "right" }, 2: { halign: "right" },
        3: { halign: "right", fontStyle: "bold", textColor: RED },
        4: { halign: "right" }, 5: { halign: "right", textColor: RED },
        6: { fontSize: 7, textColor: [100,100,120] },
      },
      alternateRowStyles: { fillColor: [253,248,248] },
    });

    y = doc.lastAutoTable.finalY + 14;
  }

  footer(doc);
  return doc;
}

// ───────────────────────────────────────────────
// Telegram
// ───────────────────────────────────────────────
async function sendDocument(pdfPath, caption) {
  const form = new FormData();
  form.append("chat_id", TELEGRAM_CHAT_ID);
  form.append("caption", caption);
  const buf = fs.readFileSync(pdfPath);
  form.append("document", new Blob([buf], { type: "application/pdf" }), path.basename(pdfPath));
  const r = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`, {
    method: "POST", body: form,
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram ${j.error_code}: ${j.description}`);
  return j;
}

// ───────────────────────────────────────────────
// Main
// ───────────────────────────────────────────────
async function main() {
  const target = targetDate();
  const fechaDDMM = fmtDDMMYYYY(target);
  const fechaHum  = fmtHuman(target);

  console.log(`📅 Generando reporte para ${fechaHum} (${fechaDDMM})`);

  const [sales, compras] = await Promise.all([
    fetchVentas(fechaDDMM),
    fetchCompras(target),
  ]);

  console.log(`📊 Ventas: ${fmtCRC(sales.ventas)} · ${sales.facturas} facturas · ${sales.vendedores.length} vendedores`);
  console.log(`📦 Compras pendientes: ${compras.totalItems} ítems · ${compras.proveedores.length} proveedores`);

  const tmp = process.env.RUNNER_TEMP || "/tmp";
  const ventasPath  = path.join(tmp, "sol-ventas.pdf");
  const comprasPath = path.join(tmp, "sol-compras-pendientes.pdf");

  const vDoc = buildVentasPDF(sales, fechaHum);
  const cDoc = buildComprasPDF(compras, fechaHum);
  fs.writeFileSync(ventasPath,  Buffer.from(vDoc.output("arraybuffer")));
  fs.writeFileSync(comprasPath, Buffer.from(cDoc.output("arraybuffer")));

  await sendDocument(ventasPath, `📊 SOL — Reporte de Ventas · ${fechaHum}`);
  await sendDocument(comprasPath, `⚠️ Compras Pendientes · Al ${fechaHum}`);

  console.log("✅ Reportes enviados");
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
