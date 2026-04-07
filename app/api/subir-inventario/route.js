import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

let _sb;
function getDb() { if (!_sb) _sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY); return _sb; }

const COLUMNAS_ORIGINALES = ['Código','Tipo','Nombre','Categoría','Marca','Ubicación','Mínimo','Existencias','Máximo','Última compra','Último proveedor','Último costo unitario con descuento','Moneda','Promedio mensual vendido','Activo','Estatus'];
const COLUMNAS_BD = ['codigo','tipo','nombre','categoria','marca','ubicacion','minimo','existencias','maximo','ultima_compra','ultimo_proveedor','ultimo_costo','moneda','promedio_mensual','activo','estatus'];

function limpiar(val) {
  if (val === null || val === undefined) return null;
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

    // Leer todas las filas como arrays de valores
    const filas = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      filas.push(row.values.slice(1)); // slice(1) porque ExcelJS usa índice 1-based
    });

    // Encontrar fila de headers (buscar 'Código' en las primeras 5 filas)
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(5, filas.length); i++) {
      if (filas[i].some(v => String(v || '').trim() === 'Código')) {
        headerRowIdx = i;
        break;
      }
    }
    if (headerRowIdx === -1) return NextResponse.json({ error: "No se encontró fila de encabezados con 'Código'" }, { status: 400 });

    const headers = filas[headerRowIdx].map(v => String(v || '').trim());

    // Construir mapa de columnas
    const renameMap = {};
    COLUMNAS_ORIGINALES.forEach((orig, i) => {
      const colIdx = headers.findIndex(h => h === orig.trim());
      if (colIdx >= 0) renameMap[colIdx] = COLUMNAS_BD[i];
    });

    const mapeadas = Object.keys(renameMap).length;
    if (mapeadas < 10) return NextResponse.json({ error: `Solo ${mapeadas} columnas mapeadas de ${COLUMNAS_ORIGINALES.length}` }, { status: 400 });

    // Procesar filas de datos
    const fechaCarga = new Date().toISOString();
    const records = [];
    const dataRows = filas.slice(headerRowIdx + 1);

    for (const row of dataRows) {
      const primerVal = limpiar(row[0]);
      if (!primerVal || String(primerVal).startsWith('Total:')) continue;

      const record = { fecha_carga: fechaCarga, periodo_reporte: 'Sin período' };
      for (const [idxStr, norm] of Object.entries(renameMap)) {
        const idx = parseInt(idxStr);
        let val = row[idx];
        // ExcelJS devuelve fechas como objetos Date
        if (val instanceof Date) {
          record[norm] = val.toISOString().slice(0, 10);
        } else {
          record[norm] = limpiar(val);
        }
      }
      records.push(record);
    }

    if (records.length === 0) return NextResponse.json({ error: 'No se encontraron registros de datos' }, { status: 400 });

    const conProv = records.filter(r => r.ultimo_proveedor !== null).length;
    console.log(`[API subir-inventario] ${records.length} records, ${conProv} con proveedor`);

    // Limpiar datos anteriores (por fecha_carga una por una para respetar RLS)
    const { data: fechasExistentes } = await getDb()
      .from('neo_minimos_maximos')
      .select('fecha_carga')
      .order('fecha_carga', { ascending: false })
      .limit(1000);

    if (fechasExistentes?.length) {
      const fechasUnicas = [...new Set(fechasExistentes.map(r => r.fecha_carga))];
      for (const fc of fechasUnicas) {
        await getDb().from('neo_minimos_maximos').delete().eq('fecha_carga', fc);
      }
    }

    // Insertar en batches de 200
    const BATCH = 200;
    let total = 0;
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const { error } = await getDb().from('neo_minimos_maximos').insert(batch);
      if (error) throw new Error(`Batch ${Math.floor(i/BATCH)+1} falló: ${error.message}`);
      total += batch.length;
    }

    return NextResponse.json({
      ok: true,
      total,
      con_proveedor: conProv,
      sin_proveedor: records.length - conProv,
      fecha_carga: fechaCarga,
    });

  } catch (e) {
    console.error('[API subir-inventario] Error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
