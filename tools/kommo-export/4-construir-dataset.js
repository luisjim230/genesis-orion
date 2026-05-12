// Paso 4 — armar el dataset final para entrenar al agente.
// Uso: node 4-construir-dataset.js
//
// Genera:
//   - dataset-entrenamiento.jsonl   (un lead por línea, formato chat)
//   - dataset-por-vendedor/<Nombre>.jsonl
//   - TODAS-LAS-CONVERSACIONES.{csv,txt,json}
//   - estadisticas.txt              (conteos por mes, por vendedor)

const fs = require('fs');
const path = require('path');
const config = require('./config');

const NOMBRES_BOT = new Set([
  'SalesBot',
  'Robot',
  'También puede realizar su compra en:',
  'Nombre completo',
  'Enviado',
]);

function esBot(vendedor) {
  if (!vendedor) return false;
  for (const b of NOMBRES_BOT) if (vendedor.includes(b)) return true;
  return false;
}

function limpiarNombreArchivo(s) {
  return (s || 'sin_vendedor').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function recorrerExport() {
  const out = [];
  if (!fs.existsSync(config.EXPORT_DIR)) return out;
  for (const mes of fs.readdirSync(config.EXPORT_DIR)) {
    if (!/^\d{4}-\d{2}$/.test(mes)) continue;
    const dirMes = path.join(config.EXPORT_DIR, mes);
    for (const carp of fs.readdirSync(dirMes)) {
      const jsonPath = path.join(dirMes, carp, 'conversacion.json');
      if (!fs.existsSync(jsonPath)) continue;
      try {
        const conv = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        out.push({ mes, ...conv });
      } catch {}
    }
  }
  return out;
}

(async () => {
  const convs = recorrerExport();
  console.log(`Encontradas ${convs.length} conversaciones en ${config.EXPORT_DIR}/`);

  const OUT = config.OUTPUT_DIR;
  fs.mkdirSync(OUT, { recursive: true });
  fs.mkdirSync(path.join(OUT, 'dataset-por-vendedor'), { recursive: true });
  console.log(`Carpeta de salida: ${OUT}`);

  // dataset-entrenamiento.jsonl
  const lineas = convs.map((c) =>
    JSON.stringify({
      lead_id: c.lead_id,
      mes: c.mes,
      contact_name: c.contact_name || '',
      telefono: c.telefono || '',
      messages: c.messages || [],
    })
  );
  fs.writeFileSync(path.join(OUT, 'dataset-entrenamiento.jsonl'), lineas.join('\n'));
  console.log(`✓ dataset-entrenamiento.jsonl (${lineas.length} líneas)`);

  // Por vendedor.
  const porVendedor = new Map();
  for (const c of convs) {
    for (const m of c.messages || []) {
      if (m.role !== 'assistant' || esBot(m.vendedor)) continue;
      const v = m.vendedor || 'sin_vendedor';
      if (!porVendedor.has(v)) porVendedor.set(v, []);
      porVendedor.get(v).push({ lead_id: c.lead_id, content: m.content });
    }
  }
  for (const [v, msgs] of porVendedor) {
    const f = path.join(OUT, 'dataset-por-vendedor', `${limpiarNombreArchivo(v)}.jsonl`);
    fs.writeFileSync(f, msgs.map((m) => JSON.stringify(m)).join('\n'));
  }
  console.log(`✓ dataset-por-vendedor/ (${porVendedor.size} vendedores)`);

  // TODAS-LAS-CONVERSACIONES en 3 formatos.
  fs.writeFileSync(path.join(OUT, 'TODAS-LAS-CONVERSACIONES.json'), JSON.stringify(convs, null, 2));

  const csv = ['lead_id,mes,contact_name,telefono,total_mensajes'];
  for (const c of convs) {
    csv.push(`${c.lead_id},${c.mes},"${(c.contact_name || '').replace(/"/g, '""')}",${c.telefono || ''},${(c.messages || []).length}`);
  }
  fs.writeFileSync(path.join(OUT, 'TODAS-LAS-CONVERSACIONES.csv'), csv.join('\n'));

  const txt = [];
  for (const c of convs) {
    txt.push(`═════ Lead ${c.lead_id} · ${c.mes} · ${c.contact_name || ''} ═════`);
    for (const m of c.messages || []) {
      const tag = m.role === 'user' ? 'CLIENTE' : (m.vendedor || 'EQUIPO');
      txt.push(`[${tag}] ${m.content}`);
    }
    txt.push('');
  }
  fs.writeFileSync(path.join(OUT, 'TODAS-LAS-CONVERSACIONES.txt'), txt.join('\n'));
  console.log(`✓ TODAS-LAS-CONVERSACIONES.{json,csv,txt}`);

  // Estadísticas.
  const porMes = new Map();
  for (const c of convs) porMes.set(c.mes, (porMes.get(c.mes) || 0) + 1);
  const stats = [
    `Rango: ${config.DESDE_FECHA} a ${config.HASTA_FECHA}`,
    `Total leads: ${convs.length}`,
    '',
    'CONTEO POR MES:',
  ];
  for (const [mes, n] of [...porMes.entries()].sort()) stats.push(`  ${mes}: ${n} leads`);
  stats.push('', 'MENSAJES POR VENDEDOR:');
  for (const [v, msgs] of [...porVendedor.entries()].sort((a, b) => b[1].length - a[1].length)) {
    stats.push(`  ${v}: ${msgs.length} mensajes`);
  }
  fs.writeFileSync(path.join(OUT, 'estadisticas.txt'), stats.join('\n'));
  console.log(`✓ estadisticas.txt\n`);
  console.log(stats.join('\n'));
  console.log(`\n✓ Todo guardado en: ${OUT}`);
})();
