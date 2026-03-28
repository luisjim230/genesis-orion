import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

let _sb;
function getDb() {
  if (!_sb) _sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  return _sb;
}

const COLS_VENDEDOR = [
  'unidades_vendidas','ventas_sin_imp','ventas_con_imp',
  'notas_sin_imp','notas_con_imp','imp_ventas','imp_notas',
  'ventas_otros_cargos','notas_otros_cargos','ventas_totales',
  'notas_totales','ventas_netas','costo','utilidad',
  'pct_utilidad','util_costo','transacciones','tiquete_promedio',
];

function toNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'object' && val.richText) val = val.richText.map(r => r.text).join('');
  if (typeof val === 'object' && val.text)     val = val.text;
  const s = String(val).replace('%', '').trim();
  return parseFloat(s) || 0;
}

function toStr(val) {
  if (val === null || val === undefined) return '';
  if (typeof val === 'object' && val.richText) return val.richText.map(r => r.text).join('').trim();
  if (typeof val === 'object' && val.text)     return String(val.text).trim();
  return String(val).trim();
}

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file     = formData.get('file');
    const tabla    = formData.get('tabla'); // neo_informe_ventas_vendedor | neo_informe_ventas_categoria

    if (!file) return Response.json({ error: 'No file' }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const wb  = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws  = wb.worksheets[0];

    // ── Extraer período desde las primeras 20 filas ──────────────────────────
    let periodo = null;
    ws.eachRow((row, rn) => {
      if (periodo || rn > 20) return;
      row.eachCell({ includeEmpty: false }, cell => {
        const s = toStr(cell.value);
        if (!periodo && (s.includes('Del ') || s.includes('del ')) && s.includes('/')) {
          periodo = s;
        }
      });
    });

    // Fallback: usar fecha de hoy
    if (!periodo) {
      periodo = `Día ${new Date().toISOString().slice(0, 10)}`;
    }

    // Calcular columna mes desde periodo
    let mes = null;
    const m1 = periodo.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (m1) mes = m1[3] + '-' + m1[2];
    if (!mes) { const m2 = periodo.match(/(\d{4}-\d{2})/); if (m2) mes = m2[1]; }

    // ── Encontrar fila de headers buscando "Vendedor" en col A ───────────────
    let headerRowNum = -1;
    ws.eachRow((row, rn) => {
      if (headerRowNum > 0) return;
      if (toStr(row.getCell(1).value) === 'Vendedor') headerRowNum = rn;
    });

    if (headerRowNum < 0) {
      return Response.json({ error: 'No se encontró fila de headers (Vendedor)' }, { status: 422 });
    }

    console.log(`[VentasAPI] tabla=${tabla} headerRow=${headerRowNum} periodo="${periodo}" mes=${mes}`);

    // ── Leer datos ───────────────────────────────────────────────────────────
    const now     = new Date().toISOString();
    const records = [];

    ws.eachRow((row, rn) => {
      if (rn <= headerRowNum) return;

      const vendedor = toStr(row.getCell(1).value);
      if (!vendedor) return; // fila sin nombre → subtotal de sub-grupo (skip)

      // Saltar fila de gran total
      const vendLower = vendedor.toLowerCase();
      if (vendLower.startsWith('gran total') || vendLower.startsWith('total general')) return;

      const record = {
        fecha_carga:      now,
        periodo_reporte:  periodo,
        mes,
        vendedor,
        unidades_vendidas: toNum(row.getCell(2).value),
      };

      // Columnas 3..19 → COLS_VENDEDOR[0..17]
      COLS_VENDEDOR.forEach((col, i) => {
        record[col] = toNum(row.getCell(i + 3).value);
      });

      records.push(record);
    });

    if (records.length === 0) {
      return Response.json({ error: 'Sin datos válidos (0 vendedores leídos)' }, { status: 422 });
    }

    console.log(`[VentasAPI] ${records.length} vendedores leídos`);

    // ── Deduplicar por período: borrar cargas previas con mismo periodo_reporte ─
    const { data: previas } = await getDb()
      .from(tabla)
      .select('fecha_carga')
      .eq('periodo_reporte', periodo)
      .limit(50);

    const fcsUnicas = [...new Set((previas || []).map(r => r.fecha_carga))];
    for (const fc of fcsUnicas) {
      await getDb().from(tabla).delete().eq('fecha_carga', fc);
    }

    // ── Insertar ─────────────────────────────────────────────────────────────
    const { error } = await getDb().from(tabla).insert(records);

    if (error) {
      console.error('[VentasAPI] insert error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    // ── Auto-crear vendedores en sol_metas_vendedor ──────────────────────────
    try {
      const vendedores = records.map(r => r.vendedor).filter(Boolean);
      const { data: yaExisten } = await getDb().from('sol_metas_vendedor').select('vendedor');
      const existentes = new Set((yaExisten || []).map(r => r.vendedor));
      const nuevos = vendedores.filter(v => !existentes.has(v));
      if (nuevos.length > 0) {
        await getDb().from('sol_metas_vendedor').insert(
          nuevos.map(v => ({ vendedor: v, meta_ventas: 0, meta_utilidad: 0, pct_comision: 3, bono_meta: 1, bono_margen: 1, umbral_margen: 35 }))
        );
        console.log(`[VentasAPI] Auto-creados ${nuevos.length} vendedores nuevos`);
      }
    } catch (e) {
      console.warn('[VentasAPI] No se pudieron auto-crear vendedores:', e.message);
    }

    return Response.json({ ok: true, registros: records.length, periodo, mes, tabla });

  } catch (e) {
    console.error('[VentasAPI] Error:', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
