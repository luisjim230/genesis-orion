import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import fs from "node:fs";
import path from "node:path";

const FONT_DIR = "/usr/share/fonts/truetype/dejavu";
const regular = fs.readFileSync(path.join(FONT_DIR, "DejaVuSans.ttf")).toString("base64");
const bold    = fs.readFileSync(path.join(FONT_DIR, "DejaVuSans-Bold.ttf")).toString("base64");

const data = {
  titulo: "SOL — Sábado 18 de abril 2026",
  resumen: {
    ventas: 10509621,
    utilidad: 3759658,
    pctUtilidad: 35.8,
    facturas: 206,
    tiquete: 51018,
  },
  vendedores: [
    { nombre: "Crisoto",       ventas: 1604499, util: 455703, pct: 28, fact: 30 },
    { nombre: "antbolaños",    ventas: 1397982, util: 514555, pct: 37, fact: 7  },
    { nombre: "MBLANCO",       ventas: 1248252, util: 427827, pct: 34, fact: 21 },
    { nombre: "AnthonyNuñez",  ventas: 1097311, util: 463629, pct: 42, fact: 12 },
    { nombre: "olargaespada",  ventas:  884446, util: 335693, pct: 38, fact: 37 },
    { nombre: "jfernandezro",  ventas:  867576, util: 363051, pct: 42, fact: 8  },
    { nombre: "vendrojimo3",   ventas:  647315, util: 184920, pct: 29, fact: 13 },
    { nombre: "evedelgado",    ventas:  597466, util: 233723, pct: 39, fact: 13 },
    { nombre: "Mariedmu",      ventas:  563144, util: 227797, pct: 40, fact: 21 },
    { nombre: "vivianar",      ventas:  492310, util: 192724, pct: 39, fact: 26 },
    { nombre: "ALEJANDRO",     ventas:  416117, util: 118157, pct: 28, fact: 7  },
  ],
};

const fmtCRC = (n) => "₡" + n.toLocaleString("es-CR");
const fmtPct = (n) => n.toFixed(1).replace(/\.0$/, "") + "%";

const doc = new jsPDF({ unit: "pt", format: "letter" });
doc.addFileToVFS("DejaVuSans.ttf", regular);
doc.addFont("DejaVuSans.ttf", "DejaVu", "normal");
doc.addFileToVFS("DejaVuSans-Bold.ttf", bold);
doc.addFont("DejaVuSans-Bold.ttf", "DejaVu", "bold");
const FONT = "DejaVu";
const W = doc.internal.pageSize.getWidth();
const M = 40;

// Header band
doc.setFillColor(24, 90, 157);
doc.rect(0, 0, W, 90, "F");
doc.setTextColor(255, 255, 255);
doc.setFont(FONT, "bold");
doc.setFontSize(22);
doc.text("SOL — Reporte Diario", M, 42);
doc.setFont(FONT, "normal");
doc.setFontSize(12);
doc.text("Sábado 18 de abril, 2026", M, 64);
doc.setFontSize(9);
doc.text("Generado automáticamente · Genesis Orion", W - M, 64, { align: "right" });

// KPI cards
const cardY = 110;
const cardH = 78;
const gap = 12;
const cardW = (W - M * 2 - gap * 3) / 4;

const kpis = [
  { label: "Ventas",   value: fmtCRC(data.resumen.ventas),   sub: "del día" },
  { label: "Utilidad", value: fmtCRC(data.resumen.utilidad), sub: fmtPct(data.resumen.pctUtilidad) + " margen" },
  { label: "Facturas", value: String(data.resumen.facturas), sub: "emitidas" },
  { label: "Tiquete",  value: fmtCRC(data.resumen.tiquete),  sub: "promedio" },
];

kpis.forEach((k, i) => {
  const x = M + i * (cardW + gap);
  doc.setFillColor(246, 248, 251);
  doc.roundedRect(x, cardY, cardW, cardH, 6, 6, "F");
  doc.setDrawColor(220, 228, 238);
  doc.roundedRect(x, cardY, cardW, cardH, 6, 6, "S");

  doc.setTextColor(110, 120, 135);
  doc.setFont(FONT, "normal");
  doc.setFontSize(9);
  doc.text(k.label.toUpperCase(), x + 12, cardY + 18);

  doc.setTextColor(20, 30, 50);
  doc.setFont(FONT, "bold");
  doc.setFontSize(16);
  doc.text(k.value, x + 12, cardY + 44);

  doc.setTextColor(110, 120, 135);
  doc.setFont(FONT, "normal");
  doc.setFontSize(9);
  doc.text(k.sub, x + 12, cardY + 62);
});

// Section title
const tableY = cardY + cardH + 28;
doc.setTextColor(20, 30, 50);
doc.setFont(FONT, "bold");
doc.setFontSize(13);
doc.text("Ranking de vendedores", M, tableY);

doc.setDrawColor(220, 228, 238);
doc.line(M, tableY + 6, W - M, tableY + 6);

// Vendor table
autoTable(doc, {
  startY: tableY + 14,
  margin: { left: M, right: M },
  head: [["#", "Vendedor", "Ventas", "Utilidad", "Margen", "Fact."]],
  body: data.vendedores.map((v, i) => [
    String(i + 1),
    v.nombre,
    fmtCRC(v.ventas),
    fmtCRC(v.util),
    v.pct + "%",
    String(v.fact),
  ]),
  styles: { font: FONT, fontSize: 10, cellPadding: 6 },
  headStyles: { fillColor: [24, 90, 157], textColor: 255, halign: "left" },
  columnStyles: {
    0: { cellWidth: 26, halign: "right", textColor: [110, 120, 135] },
    1: { fontStyle: "bold" },
    2: { halign: "right" },
    3: { halign: "right" },
    4: { halign: "right" },
    5: { halign: "right" },
  },
  alternateRowStyles: { fillColor: [248, 250, 253] },
});

// Footer
const pageH = doc.internal.pageSize.getHeight();
doc.setTextColor(140, 150, 165);
doc.setFontSize(8);
doc.text("SOL reportes · Genesis Orion", M, pageH - 24);
doc.text("Página 1 de 1", W - M, pageH - 24, { align: "right" });

const outPath = path.resolve("public/sample-sol-report.pdf");
fs.writeFileSync(outPath, Buffer.from(doc.output("arraybuffer")));
console.log("Wrote", outPath);
