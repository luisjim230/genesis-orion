import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import fs from "node:fs";
import path from "node:path";

const FONT_DIR = "/usr/share/fonts/truetype/dejavu";
const regular = fs.readFileSync(path.join(FONT_DIR, "DejaVuSans.ttf")).toString("base64");
const bold    = fs.readFileSync(path.join(FONT_DIR, "DejaVuSans-Bold.ttf")).toString("base64");
const FONT = "DejaVu";
const BLUE = [24, 90, 157];

function makeDoc() {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  doc.addFileToVFS("DejaVuSans.ttf", regular);
  doc.addFont("DejaVuSans.ttf", FONT, "normal");
  doc.addFileToVFS("DejaVuSans-Bold.ttf", bold);
  doc.addFont("DejaVuSans-Bold.ttf", FONT, "bold");
  return doc;
}

const fmtCRC = (n) => "₡" + Number(n).toLocaleString("es-CR");

// ═══════════════════════════════════════════════
// PDF 1 — VENTAS
// ═══════════════════════════════════════════════
function buildVentasPDF() {
  const doc = makeDoc();
  const W = doc.internal.pageSize.getWidth();
  const M = 40;

  const dia = { ventas: 9754681, utilidad: 3262363, pct: 33.4, facturas: 187, tiquete: 52164 };
  const fecha = "Viernes 17 de abril, 2026";

  const vendedores = [
    ["antbolaños",   1567445, 553847, 35, 30],
    ["jfernandezro", 1325035, 288881, 22,  7],
    ["evedelgado",   1295016, 376573, 29, 20],
    ["MBLANCO",      1234161, 415270, 34, 20],
    ["vivianar",      809615, 311363, 38, 19],
    ["Crisoto",       759200, 234158, 31, 39],
    ["olargaespada",  733509, 285005, 39, 18],
    ["Mariedmu",      565617, 258373, 46, 17],
    ["Vnidux",        536334, 303985, 57,  5],
    ["luisjim230",    371924, 126685, 34,  2],
    ["AnthonyNuñez",  215468,  38457, 18,  3],
    ["Giovan",        177951,  33613, 19,  1],
    ["OLGARIVERA",    106545,  16545, 16,  1],
    ["vendedordj",     22712,   6406, 28,  1],
    ["rejimenez",      19104,   4409, 23,  1],
    ["Maujimenez",      9736,   4958, 51,  2],
    ["ALEJANDRO",       5310,   3836, 72,  1],
  ];

  const top25ventas = [
    ["Transporte",                              714971,  0, 715],
    ["SOL COMBO COCINA 4 QUEMADORES VI…",       442478, 30,   5],
    ["ZINC ESMALT 3.66 BLANCO #26 ESTR…",       327401, 21,  37],
    ["CEMENTO USO GENERAL 50KG",                321283, 21,  53],
    ["LAMINA NUEVA CEMENTO GRIS 61070…",        292035, 56,  15],
    ["BLOCK 15-20-40",                          274336, 11, 500],
    ["TUBO ESTRUCT. CUADRADO 4X4 100X…",        212253, 20,  10],
    ["TUBO IND. CUADRADO 1X1 1.50MM GA…",       212039, 19,  46],
    ["PISO SPC CONCRETO MILD 18.4CM X…",        189982, 39,  12],
    ["COMBO FREGADERO DOS TANQUES SATI…",       185841, 48,   3],
    ["PORCELANATO NANO MAPLE MARBLE BR…",       167735, 26,  25],
    ["PANEL DUCHA MULTIFUNCION NEGRA A…",       161062, 62,   2],
    ["ALTIVA TOMA DOBLE BLANCO 9009-W…",        159740, 50,  59],
    ["PANEL PVC FLAT JASS CIELOS Y PAR…",       157743, 53,  23],
    ["TUBO ESTRUCT. RECTANGULAR 2X6 1.…",       153503, 18,   7],
    ["VENTANA 1.20M X 1M CON MOSQUITER…",       152124, 57,   3],
    ["AKIRO AISLANTE FIBRA DE VIDRIO 2…",       141589, 69,   4],
    ["LARGA POLICARBONATO RECTANG 1.07…",       134602, 34,   9],
    ["HI BOND PEGAMENTO BLANCO CARTUCH…",       126106, 32,  19],
    ["INTACO MURO SECO BLANCO 25KG",            122124, 23,  15],
    ["VENTANA 1.50M X 1M CON MOSQUITER…",       119558, 56,   2],
    ["LAMINA GYPSUM 12MM BLANCA",               106753, 25,  19],
    ["WADFOW PULVERIZADORA DE PINTURA…",        106194, 29,   1],
    ["AVELLANAS PUERTA BAÑO VIDRIO EN…",        106194, 56,   1],
    ["LAMINA NUEVA TEC XL ONDAS DORAD…",        106191, 51,   4],
  ];

  const top15util = [
    ["LAMINA NUEVA CEMENTO GRIS 61070…", 162515, 56],
    ["SOL COMBO COCINA 4 QUEMADORES…",   130734, 30],
    ["PANEL DUCHA MULTIFUNCION NEGRA…",   99075, 62],
    ["AKIRO AISLANTE FIBRA DE VIDRIO…",   98283, 69],
    ["COMBO FREGADERO DOS TANQUES…",      89373, 48],
    ["VENTANA 1.20M X 1M CON MOSQUIT…",   86655, 57],
    ["PANEL PVC FLAT JASS CIELOS Y…",     84259, 53],
    ["SERVICIO DE TRANSPORTE LOCAL",       81265, 79],
    ["ALTIVA TOMA DOBLE BLANCO 9009-W…",  79265, 50],
    ["PISO SPC CONCRETO MILD 18.4CM…",    73171, 39],
    ["CACHERA CON CALENTADOR INCLUIDO…",  70288, 68],
    ["ZINC ESMALT 3.66 BLANCO #26…",      68545, 21],
    ["VENTANA 1.50M X 1M CON MOSQUIT…",   67522, 56],
    ["CEMENTO USO GENERAL 50KG",           66883, 21],
    ["AVELLANAS PUERTA BAÑO VIDRIO EN…",  59804, 56],
  ];

  const top15cant = [
    ["Transporte",                     715],
    ["BLOCK 15-20-40",                 500],
    ["TORNILLO TECHO 2 PB BLANCO",     315],
    ["TORNILLO MADERA 10X2",           150],
    ["TORNILLO TECHO 2 PB",            104],
    ["TORNILLO TECHO 2 PB ROJO",       100],
    ["CLIP PARA PANEL FLAT Y WPC…",     70],
    ["CLIP PARA PANEL WPC EXTERIOR…",   60],
    ["ALTIVA TOMA DOBLE BLANCO 9009…",  59],
    ["STUD 3 x 3.05",                   54],
    ["CEMENTO USO GENERAL 50KG",        53],
    ["ALAMBRE NEGRO KILO",              50],
    ["TORNILLO MADERA 10X2 1/2",        50],
    ["TUBO IND. CUADRADO 1X1 1.50MM…",  46],
    ["ZINC ESMALT 3.66 BLANCO #26…",    37],
  ];

  // Header
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, W, 88, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont(FONT, "bold"); doc.setFontSize(22);
  doc.text("SOL — Reporte de Ventas", M, 40);
  doc.setFont(FONT, "normal"); doc.setFontSize(11);
  doc.text(fecha, M, 62);
  doc.setFontSize(9);
  doc.text("Generado automáticamente · Genesis Orion", W - M, 62, { align: "right" });

  // KPI cards
  const cardY = 106, cardH = 76, gap = 10;
  const cardW = (W - M * 2 - gap * 3) / 4;
  const kpis = [
    { label: "VENTAS",    value: fmtCRC(dia.ventas),    sub: "del día" },
    { label: "UTILIDAD",  value: fmtCRC(dia.utilidad),  sub: dia.pct + "% margen" },
    { label: "FACTURAS",  value: String(dia.facturas),  sub: "emitidas" },
    { label: "TIQUETE",   value: fmtCRC(dia.tiquete),   sub: "promedio" },
  ];
  kpis.forEach((k, i) => {
    const x = M + i * (cardW + gap);
    doc.setFillColor(245, 248, 252);
    doc.roundedRect(x, cardY, cardW, cardH, 5, 5, "F");
    doc.setDrawColor(210, 220, 235);
    doc.roundedRect(x, cardY, cardW, cardH, 5, 5, "S");
    doc.setTextColor(120, 130, 145); doc.setFont(FONT, "normal"); doc.setFontSize(8);
    doc.text(k.label, x + 10, cardY + 16);
    doc.setTextColor(20, 30, 50); doc.setFont(FONT, "bold"); doc.setFontSize(14);
    doc.text(k.value, x + 10, cardY + 40);
    doc.setTextColor(120, 130, 145); doc.setFont(FONT, "normal"); doc.setFontSize(8);
    doc.text(k.sub, x + 10, cardY + 58);
  });

  function sectionTitle(doc, y, title) {
    doc.setTextColor(20, 30, 50); doc.setFont(FONT, "bold"); doc.setFontSize(12);
    doc.text(title, M, y);
    doc.setDrawColor(210, 220, 235);
    doc.line(M, y + 5, W - M, y + 5);
    return y + 16;
  }

  // Vendedores
  let y = sectionTitle(doc, cardY + cardH + 24, "👥  Vendedores");
  autoTable(doc, {
    startY: y, margin: { left: M, right: M },
    head: [["#", "Vendedor", "Ventas", "Utilidad", "Margen", "Fact."]],
    body: vendedores.map((v, i) => [i + 1, v[0], fmtCRC(v[1]), fmtCRC(v[2]), v[3] + "%", v[4]]),
    styles: { font: FONT, fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: BLUE, textColor: 255 },
    columnStyles: {
      0: { cellWidth: 22, halign: "right", textColor: [130, 140, 155] },
      1: { fontStyle: "bold" },
      2: { halign: "right" }, 3: { halign: "right" },
      4: { halign: "right" }, 5: { halign: "right" },
    },
    alternateRowStyles: { fillColor: [247, 250, 254] },
  });

  // Page 2
  doc.addPage();
  doc.setFillColor(...BLUE);
  doc.rect(0, 0, W, 36, "F");
  doc.setTextColor(255,255,255); doc.setFont(FONT,"bold"); doc.setFontSize(12);
  doc.text("SOL — Reporte de Ventas  ·  " + fecha, M, 23);

  y = sectionTitle(doc, 56, "📦  Top 25 productos por ventas");
  autoTable(doc, {
    startY: y, margin: { left: M, right: M },
    head: [["#", "Producto", "Ventas", "Margen", "Und."]],
    body: top25ventas.map((r, i) => [i + 1, r[0], fmtCRC(r[1]), r[2] + "%", r[3]]),
    styles: { font: FONT, fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: BLUE, textColor: 255 },
    columnStyles: {
      0: { cellWidth: 20, halign: "right", textColor: [130,140,155] },
      2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" },
    },
    alternateRowStyles: { fillColor: [247, 250, 254] },
  });

  y = doc.lastAutoTable.finalY + 18;
  const halfW = (W - M * 2 - 16) / 2;

  // Top 15 utilidad (left)
  y = sectionTitle(doc, y, "📈  Top 15 por utilidad");
  autoTable(doc, {
    startY: y, margin: { left: M, right: M + halfW + 16 },
    head: [["#", "Producto", "Utilidad", "%"]],
    body: top15util.map((r, i) => [i + 1, r[0], fmtCRC(r[1]), r[2] + "%"]),
    styles: { font: FONT, fontSize: 7.5, cellPadding: 3 },
    headStyles: { fillColor: BLUE, textColor: 255 },
    columnStyles: {
      0: { cellWidth: 18, halign: "right", textColor: [130,140,155] },
      2: { halign: "right" }, 3: { halign: "right" },
    },
    alternateRowStyles: { fillColor: [247, 250, 254] },
  });

  const leftEnd = doc.lastAutoTable.finalY;

  // Top 15 cantidad (right)
  autoTable(doc, {
    startY: y, margin: { left: M + halfW + 16, right: M },
    head: [["#", "Producto", "Und."]],
    body: top15cant.map((r, i) => [i + 1, r[0], r[1]]),
    styles: { font: FONT, fontSize: 7.5, cellPadding: 3 },
    headStyles: { fillColor: [40, 120, 80], textColor: 255 },
    columnStyles: {
      0: { cellWidth: 18, halign: "right", textColor: [130,140,155] },
      2: { halign: "right" },
    },
    alternateRowStyles: { fillColor: [247, 252, 249] },
  });

  // Footer each page
  const pH = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= doc.getNumberOfPages(); p++) {
    doc.setPage(p);
    doc.setTextColor(150, 160, 175); doc.setFontSize(7.5); doc.setFont(FONT, "normal");
    doc.text("SOL reportes · Genesis Orion", M, pH - 20);
    doc.text(`Página ${p} de ${doc.getNumberOfPages()}`, W - M, pH - 20, { align: "right" });
  }

  return doc;
}

// ═══════════════════════════════════════════════
// PDF 2 — COMPRAS PENDIENTES
// ═══════════════════════════════════════════════
function buildComprasPDF() {
  const doc = makeDoc();
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const RED = [180, 30, 30];

  const fecha = "Al 17 de abril, 2026";
  const totalItems = 339;

  // Only one supplier in mock data (in production all suppliers will appear)
  const proveedores = [
    {
      nombre: "CORPORACION DE SUMINISTROS Y MATERIALES DE CONSTRUCCION SA (COSMAC)",
      items: [
        { producto: "CH BREAKER 1X20",                     pedido: 10, recibido: 0, faltante: 10, dias: 19, retraso: 11, oc: "OC COSMAC 2026-03-30" },
        { producto: "SCOTCH BRITE GRANDE MORADA 7447",     pedido:  6, recibido: 0, faltante:  6, dias: 19, retraso: 11, oc: "OC COSMAC 2026-03-30" },
        { producto: "SOLDADURA HILCO #6013 3/32",          pedido: 20, recibido: 0, faltante: 20, dias: 19, retraso: 11, oc: "OC COSMAC 2026-03-30" },
        { producto: "TAPE SUPER 33+ 3M EN CAJA GDE",       pedido: 10, recibido: 0, faltante: 10, dias: 19, retraso: 11, oc: "OC COSMAC 2026-03-30" },
        { producto: "TRUPER BROCA PALETA 1 1/4 BPT-11390", pedido:  2, recibido: 0, faltante:  2, dias: 19, retraso: 11, oc: "OC COSMAC 2026-03-30" },
        { producto: "TRUPER BROCA PALETA 7/8 BPT-11381",   pedido:  2, recibido: 0, faltante:  2, dias: 19, retraso: 11, oc: "OC COSMAC 2026-03-30" },
        { producto: "TRUPER BROCA VIDRIO Y AZULEJO 1/4",   pedido:  3, recibido: 0, faltante:  3, dias: 19, retraso: 11, oc: "OC COSMAC 2026-03-30" },
        { producto: "AGUILA BLANCO PLACA COAXIAL PLATA",   pedido:  3, recibido: 0, faltante:  3, dias: 12, retraso:  4, oc: "OC COSMAC 2026-04-06" },
        { producto: "AGUILA BLANCO TOMA CORRIENTE DOBLE",  pedido: 24, recibido: 0, faltante: 24, dias: 12, retraso:  4, oc: "OC COSMAC 2026-04-06" },
        { producto: "AGUILA PLATA NEGRO TOMA DOBLE",       pedido: 12, recibido: 0, faltante: 12, dias: 12, retraso:  4, oc: "OC COSMAC 2026-04-06" },
        { producto: "AGUILA SOCKET CON PATILLAS 738",      pedido: 20, recibido: 0, faltante: 20, dias: 12, retraso:  4, oc: "OC COSMAC 2026-04-06" },
        { producto: "ALTIVA APAGADOR SENCILLO 9000-BK",    pedido: 20, recibido: 0, faltante: 20, dias: 12, retraso:  4, oc: "OC COSMAC 2026-04-06" },
        { producto: "CH BREAKER 1X20",                     pedido: 10, recibido: 0, faltante: 10, dias: 12, retraso:  4, oc: "OC COSMAC 2026-04-06" },
        { producto: "CH BREAKER 1X50",                     pedido:  2, recibido: 0, faltante:  2, dias: 12, retraso:  4, oc: "OC COSMAC 2026-04-06" },
        { producto: "EXTRACTOR COCINA ACERO INOX 75CM",    pedido: 62, recibido: 0, faltante: 62, dias: 12, retraso:  4, oc: "OC COSMAC 2026-04-06" },
        { producto: "PRETUL JUEGO BROCA SIERRA KIT-4P",    pedido:  3, recibido: 0, faltante:  3, dias: 12, retraso:  4, oc: "OC COSMAC 2026-04-06" },
        { producto: "SCOTCH BRITE GRANDE MORADA 7447",     pedido: 10, recibido: 0, faltante: 10, dias: 12, retraso:  4, oc: "OC COSMAC 2026-04-06" },
        { producto: "SOLDADURA HILCO #6013 3/32",          pedido: 20, recibido: 0, faltante: 20, dias: 12, retraso:  4, oc: "OC COSMAC 2026-04-06" },
      ]
    }
  ];

  // Header
  doc.setFillColor(170, 30, 30);
  doc.rect(0, 0, W, 88, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont(FONT, "bold"); doc.setFontSize(20);
  doc.text("⚠  Compras Pendientes de Recibir", M, 40);
  doc.setFont(FONT, "normal"); doc.setFontSize(11);
  doc.text(fecha, M, 62);
  doc.setFontSize(9);
  doc.text(`${totalItems} ítem(s) con 8+ días sin recibirse — Mockup (1 proveedor de N)`, W - M, 62, { align: "right" });

  let y = 108;

  proveedores.forEach(prov => {
    const faltanteTotal = prov.items.reduce((s, it) => s + it.faltante, 0);

    // Supplier band
    doc.setFillColor(240, 243, 248);
    doc.rect(M, y, W - M * 2, 22, "F");
    doc.setDrawColor(200, 210, 225);
    doc.rect(M, y, W - M * 2, 22, "S");
    doc.setTextColor(20, 30, 60); doc.setFont(FONT, "bold"); doc.setFontSize(9);
    doc.text(prov.nombre, M + 8, y + 14);
    doc.setFont(FONT, "normal"); doc.setTextColor(130, 50, 50);
    doc.text(`${prov.items.length} ítems · ${faltanteTotal} u. pendientes`, W - M - 8, y + 14, { align: "right" });
    y += 26;

    autoTable(doc, {
      startY: y, margin: { left: M, right: M },
      head: [["Producto", "Pedido", "Recibido", "Faltante", "Días", "Retraso", "OC"]],
      body: prov.items.map(it => [
        it.producto,
        it.pedido,
        it.recibido,
        it.faltante,
        it.dias,
        "+" + it.retraso,
        it.oc,
      ]),
      styles: { font: FONT, fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [170, 30, 30], textColor: 255 },
      columnStyles: {
        1: { halign: "right" }, 2: { halign: "right" },
        3: { halign: "right", fontStyle: "bold", textColor: [170, 30, 30] },
        4: { halign: "right" }, 5: { halign: "right", textColor: [170, 30, 30] },
        6: { fontSize: 7, textColor: [100, 100, 120] },
      },
      alternateRowStyles: { fillColor: [253, 248, 248] },
    });

    y = doc.lastAutoTable.finalY + 14;
  });

  // Footer
  const pH = doc.internal.pageSize.getHeight();
  for (let p = 1; p <= doc.getNumberOfPages(); p++) {
    doc.setPage(p);
    doc.setTextColor(150, 160, 175); doc.setFontSize(7.5); doc.setFont(FONT, "normal");
    doc.text("SOL reportes · Genesis Orion", M, pH - 20);
    doc.text(`Página ${p} de ${doc.getNumberOfPages()}`, W - M, pH - 20, { align: "right" });
  }

  return doc;
}

// Write both PDFs
const ventas  = buildVentasPDF();
const compras = buildComprasPDF();

const outVentas  = path.resolve("public/sol-ventas.pdf");
const outCompras = path.resolve("public/sol-compras-pendientes.pdf");

fs.writeFileSync(outVentas,  Buffer.from(ventas.output("arraybuffer")));
fs.writeFileSync(outCompras, Buffer.from(compras.output("arraybuffer")));

console.log("OK ventas:", outVentas);
console.log("OK compras:", outCompras);
