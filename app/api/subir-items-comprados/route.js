import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { ejecutarMatch } from '../../lib/procesar-match.js';

let _sb;
function getDb() {
  if (!_sb) _sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  return _sb;
}

const COLUMNAS_ORIGINALES = [
  'Compra','Estado','Fecha','Num. Factura','Proveedor','Tipo de ítem','Código interno','Ítem',
  'Cantidad comprada','Cantidad devuelta','Costo unitario sin impuesto','Moneda',
  'Precio unitario con impuesto','Subtotal','Descuento','Subtotal con descuento (moneda de contab',
  '% Impuesto','Impuestos','Total','Total sin impuesto en colones',
  'Existencias al momento de la compra','Costo unitario actual','Costo unitario compra',
  'Costo unitario promedio','Precio unitario actual','Utilidad','Tipo de cambio',
  'Marca del ítem','Categoría dél ítem',
];
const COLUMNAS_BD = [
  'compra','estado','fecha','num_factura','proveedor','tipo_item','codigo_interno','item',
  'cantidad_comprada','cantidad_devuelta','costo_unitario_sin_imp','moneda',
  'precio_unitario_con_imp','subtotal','descuento','subtotal_con_descuento_contab',
  'pct_impuesto','impuestos','total','total_sin_imp_colones',
  'existencias_al_comprar','costo_unitario_actual','costo_unitario_compra',
  'costo_unitario_promedio','precio_unitario_actual','utilidad','tipo_de_cambio',
  'marca','categoria',
];

function limpiar(val) {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  if (s === '' || s === 'nan' || s === 'null' || s === 'undefined') return null;
  return s;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const ws = workbook.worksheets[0];
    if (!ws) return NextResponse.json({ error: 'Archivo sin hojas' }, { status: 400 });

    const filas = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      filas.push(row.values.slice(1));
    });

    // Find header row: look for 'Compra' as first column value
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(10, filas.length); i++) {
      if (String(filas[i][0] || '').trim() === 'Compra') {
        headerRowIdx = i;
        break;
      }
    }
    if (headerRowIdx === -1) {
      return NextResponse.json({ error: "No se encontró encabezado 'Compra' en las primeras 10 filas" }, { status: 400 });
    }

    const headers = filas[headerRowIdx].map(v => String(v || '').trim());

    const renameMap = {};
    COLUMNAS_ORIGINALES.forEach((orig, i) => {
      const colIdx = headers.findIndex(h => h === orig.trim());
      if (colIdx >= 0) renameMap[colIdx] = COLUMNAS_BD[i];
    });

    const mapeadas = Object.keys(renameMap).length;
    if (mapeadas < 10) {
      return NextResponse.json({ error: `Solo ${mapeadas} columnas mapeadas. Verificar formato del archivo.` }, { status: 400 });
    }

    // Extract period from header rows ("Del X al Y")
    let periodo = null;
    for (let i = 0; i < headerRowIdx; i++) {
      for (const v of filas[i]) {
        const s = String(v || '').trim();
        if (s && (s.startsWith('Del ') || s.startsWith('del ')) && s.includes('/')) {
          periodo = s;
          break;
        }
      }
      if (periodo) break;
    }
    if (!periodo) periodo = `Día ${new Date().toISOString().slice(0, 10)}`;

    const fechaCarga = new Date().toISOString();
    const records = [];
    for (const row of filas.slice(headerRowIdx + 1)) {
      const primerVal = limpiar(row[0]);
      if (!primerVal || String(primerVal).startsWith('Total:')) continue;

      const record = { fecha_carga: fechaCarga, periodo_reporte: periodo };
      for (const [idxStr, norm] of Object.entries(renameMap)) {
        record[norm] = limpiar(row[parseInt(idxStr)]);
      }
      records.push(record);
    }

    if (records.length === 0) {
      return NextResponse.json({ error: 'No se encontraron registros de datos en el archivo' }, { status: 400 });
    }

    console.log(`[API subir-items-comprados] ${records.length} records, período: ${periodo}`);

    // Delete previous load for same period
    let esNuevoPeriodo = true;
    const { data: previas } = await getDb()
      .from('neo_items_comprados')
      .select('fecha_carga')
      .eq('periodo_reporte', periodo)
      .limit(50);

    if (previas?.length) {
      const fcsUnicas = [...new Set(previas.map(r => r.fecha_carga))];
      for (const fc of fcsUnicas) {
        await getDb().from('neo_items_comprados').delete().eq('fecha_carga', fc);
      }
      esNuevoPeriodo = false;
    }

    // Insert in batches
    const BATCH = 200;
    let total = 0;
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const { error } = await getDb().from('neo_items_comprados').insert(batch);
      if (error) throw new Error(`Batch ${Math.floor(i / BATCH) + 1} falló: ${error.message}`);
      total += batch.length;
    }

    // Run procesar-match automatically
    let match = null;
    try {
      match = await ejecutarMatch();
    } catch (e) {
      console.warn('[API subir-items-comprados] procesar-match falló:', e.message);
      match = { error: e.message };
    }

    return NextResponse.json({ ok: true, total, periodo, esNuevoPeriodo, fecha_carga: fechaCarga, match });
  } catch (e) {
    console.error('[API subir-items-comprados] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
