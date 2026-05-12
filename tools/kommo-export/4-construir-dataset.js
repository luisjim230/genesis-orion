// Paso 4 — armar el dataset final separado por canal.
// Uso: node 4-construir-dataset.js
//
// Lee export/AAAA-MM/lead_X/conversacion.json y separa por el campo `canal`
// que detectó 5-reprocesar.js. Genera 3 carpetas en el Escritorio:
//   KOMMO <rango>/             (WhatsApp + desconocidos)
//   KOMMO-INSTAGRAM <rango>/
//   KOMMO-FACEBOOK <rango>/

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

function escribirDataset(outDir, convs, label) {
  if (convs.length === 0) {
    console.log(`(${label}: 0 leads, salteando carpeta)`);
    return;
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.join(outDir, 'dataset-por-vendedor'), { recursive: true });

  // dataset-entrenamiento.jsonl
  const lineas = convs.map((c) =>
    JSON.stringify({
      lead_id: c.lead_id,
      canal: c.canal || label,
      mes: c.mes,
      contact_name: c.contact_name || '',
      telefono: c.telefono || '',
      messages: c.messages || [],
    })
  );
  fs.writeFileSync(path.join(outDir, 'dataset-entrenamiento.jsonl'), lineas.join('\n'));

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
    const f = path.join(outDir, 'dataset-por-vendedor', `${limpiarNombreArchivo(v)}.jsonl`);
    fs.writeFileSync(f, msgs.map((m) => JSON.stringify(m)).join('\n'));
  }

  fs.writeFileSync(path.join(outDir, 'TODAS-LAS-CONVERSACIONES.json'), JSON.stringify(convs, null, 2));

  const csv = ['lead_id,canal,mes,contact_name,telefono,total_mensajes'];
  for (const c of convs) {
    csv.push(
      `${c.lead_id},${c.canal || label},${c.mes},"${(c.contact_name || '').replace(/"/g, '""')}",${c.telefono || ''},${(c.messages || []).length}`
    );
  }
  fs.writeFileSync(path.join(outDir, 'TODAS-LAS-CONVERSACIONES.csv'), csv.join('\n'));

  const txt = [];
  for (const c of convs) {
    txt.push(`═════ Lead ${c.lead_id} · ${c.canal || label} · ${c.mes} · ${c.contact_name || ''} ═════`);
    for (const m of c.messages || []) {
      const tag = m.role === 'user' ? 'CLIENTE' : (m.vendedor || 'EQUIPO');
      txt.push(`[${tag}] ${m.content}`);
    }
    txt.push('');
  }
  fs.writeFileSync(path.join(outDir, 'TODAS-LAS-CONVERSACIONES.txt'), txt.join('\n'));

  const porMes = new Map();
  for (const c of convs) porMes.set(c.mes, (porMes.get(c.mes) || 0) + 1);
  const stats = [
    `Canal: ${label}`,
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
  fs.writeFileSync(path.join(outDir, 'estadisticas.txt'), stats.join('\n'));

  console.log(`✓ ${label}: ${convs.length} leads · ${porVendedor.size} vendedores · ${outDir}`);
}

(async () => {
  const convs = recorrerExport();
  console.log(`Encontradas ${convs.length} conversaciones en ${config.EXPORT_DIR}/`);

  const porCanal = { whatsapp: [], instagram: [], facebook: [], desconocido: [] };
  for (const c of convs) {
    const canal = c.canal || 'desconocido';
    if (!porCanal[canal]) porCanal[canal] = [];
    porCanal[canal].push(c);
  }

  console.log('\nDistribución por canal:');
  Object.entries(porCanal).forEach(([k, v]) => console.log(`  ${k}: ${v.length} leads`));

  // WhatsApp y desconocidos van juntos en la carpeta WhatsApp (mantenemos compat).
  const whatsappYDesconocidos = [...porCanal.whatsapp, ...porCanal.desconocido];
  escribirDataset(config.OUTPUT_DIR, whatsappYDesconocidos, 'WHATSAPP');
  escribirDataset(config.OUTPUT_DIR_INSTAGRAM, porCanal.instagram, 'INSTAGRAM');
  escribirDataset(config.OUTPUT_DIR_FACEBOOK, porCanal.facebook, 'FACEBOOK');

  console.log('\n✓ Listo. Carpetas en ~/Desktop/:');
  console.log(`  ${path.basename(config.OUTPUT_DIR)}/`);
  console.log(`  ${path.basename(config.OUTPUT_DIR_INSTAGRAM)}/`);
  console.log(`  ${path.basename(config.OUTPUT_DIR_FACEBOOK)}/`);
})();
