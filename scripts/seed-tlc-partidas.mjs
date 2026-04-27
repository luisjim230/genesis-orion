#!/usr/bin/env node
/**
 * seed-tlc-partidas.mjs
 *
 * Carga (upsert) las partidas arancelarias del TLC China-CR a Supabase.
 * Lee /data/tlc-china-cr-partidas.json, calcula DAI efectivo 2026 y total
 * según la categoría de desgravación, y hace upsert masivo a la tabla
 * tlc_china_partidas.
 *
 * Reglas:
 *   A, B, C, D       → 0% DAI (desgravación completada en 2026) + 1% Ley 6946
 *   MFN E            → arancel base completo + 1% Ley 6946 (excluido del TLC)
 *   F                → caso especial; tratar como MFN E + nota
 *
 * Variables de entorno requeridas:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY  (service role; el RLS no permite escribir con anon)
 *
 * Uso:
 *   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/seed-tlc-partidas.mjs
 *   o bien:
 *   npm run seed:tlc
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Faltan SUPABASE_URL y/o SUPABASE_SERVICE_KEY en el entorno.');
  process.exit(1);
}

const JSON_PATH = path.resolve(__dirname, '..', 'data', 'tlc-china-cr-partidas.json');
if (!fs.existsSync(JSON_PATH)) {
  console.error(`❌ No encuentro ${JSON_PATH}`);
  process.exit(1);
}

const partidasInput = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
console.log(`📥 Leídas ${partidasInput.length} partidas desde ${path.basename(JSON_PATH)}`);

// ── Transformación + cálculos ─────────────────────────────────────────────
function arancelBaseANumero(arancel_base) {
  if (arancel_base === null || arancel_base === undefined) return null;
  const s = String(arancel_base).trim().toLowerCase();
  if (s === 'n/a' || s === 'na' || s === '') return null;
  const n = parseFloat(s.replace('%', ''));
  return Number.isFinite(n) ? n : null;
}

function calcular(partida) {
  const cat = String(partida.categoria || '').trim().toUpperCase();
  const baseNum = arancelBaseANumero(partida.arancel_base);
  const ley_6946 = 1.0;

  let paga_dai, dai_efectivo_2026, total_efectivo, notas = null;

  if (['A', 'B', 'C', 'D'].includes(cat)) {
    paga_dai = false;
    dai_efectivo_2026 = 0;
    total_efectivo = ley_6946;
  } else if (cat === 'MFN E' || cat === 'MFNE' || cat === 'E') {
    paga_dai = true;
    dai_efectivo_2026 = baseNum ?? 0;
    total_efectivo = (baseNum ?? 0) + ley_6946;
    notas = 'MFN E — excluido del TLC, paga arancel base completo.';
  } else if (cat === 'F') {
    paga_dai = true;
    dai_efectivo_2026 = baseNum ?? 0;
    total_efectivo = (baseNum ?? 0) + ley_6946;
    notas = 'Caso especial categoría F — revisar Notas Generales del TLC.';
  } else {
    paga_dai = baseNum ? true : false;
    dai_efectivo_2026 = baseNum ?? 0;
    total_efectivo = (baseNum ?? 0) + ley_6946;
    notas = `Categoría desconocida "${cat}" — revisar manualmente.`;
  }

  const codigo = String(partida.codigo).replace(/\D/g, '');
  return {
    codigo_arancelario:     codigo,
    descripcion:            partida.descripcion,
    arancel_base:           partida.arancel_base ?? null,
    categoria_desgravacion: cat,
    paga_dai,
    dai_efectivo_2026,
    ley_6946,
    total_efectivo,
    notas,
    capitulo: codigo.length >= 2 ? parseInt(codigo.slice(0, 2), 10) : null,
    partida:  codigo.length >= 4 ? parseInt(codigo.slice(0, 4), 10) : null,
  };
}

const partidas = partidasInput.map(calcular);

// ── Upsert por batches al REST de Supabase ────────────────────────────────
async function upsertBatch(rows) {
  const url = `${SUPABASE_URL}/rest/v1/tlc_china_partidas?on_conflict=codigo_arancelario`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status}: ${txt.slice(0, 500)}`);
  }
}

const BATCH = 1000;
let cargadas = 0;
for (let i = 0; i < partidas.length; i += BATCH) {
  const slice = partidas.slice(i, i + BATCH);
  await upsertBatch(slice);
  cargadas += slice.length;
  console.log(`  → upsert ${cargadas}/${partidas.length}`);
}

// ── Resumen ───────────────────────────────────────────────────────────────
const resumen = partidas.reduce((acc, p) => {
  const k = p.categoria_desgravacion || '?';
  acc[k] = (acc[k] || 0) + 1;
  return acc;
}, {});

console.log('\n✅ Carga completa.');
console.log(`   Total: ${partidas.length} partidas`);
console.log('   Por categoría:');
Object.entries(resumen)
  .sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log(`     ${k.padEnd(8)} ${v}`));

const conTLC = partidas.filter(p => !p.paga_dai).length;
const sinTLC = partidas.filter(p =>  p.paga_dai).length;
console.log(`\n   ✅ Entran libres bajo TLC: ${conTLC}`);
console.log(`   ⚠️  Pagan arancel completo: ${sinTLC}`);
