import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file     = formData.get('file');
    const tabla    = formData.get('tabla'); // 'fin_cuentas_pagar' o 'fin_cuentas_cobrar'

    if (!file) return Response.json({ error: 'No file' }, { status: 400 });

    const buf  = Buffer.from(await file.arrayBuffer());
    const wb   = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws   = wb.worksheets[0];

    // Detectar fila de headers buscando "Código" o "Vendedor" en columna A
    let headerRowNum = -1;
    ws.eachRow((row, rn) => {
      if (headerRowNum > 0) return;
      const a = String(row.getCell(1).value || '').trim();
      if (a === 'Código' || a === 'Vendedor') headerRowNum = rn;
    });

    if (headerRowNum < 0) {
      return Response.json({ error: 'No se encontró fila de headers' }, { status: 422 });
    }

    // Leer headers
    const headerRow = ws.getRow(headerRowNum);
    const headers   = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
      headers[col] = String(cell.value || '').trim();
    });

    // Mapeo header → campo snake_case
    const MAPA_PAGAR = {
      'Código':               'codigo',
      'Proveedor':            'proveedor',
      'Tipo':                 'tipo',
      'Número':               'numero',
      'Fecha de la compra':   'fecha_compra',
      'Fecha de vencimiento': 'fecha_vencimiento',
      'Saldo original':       'saldo_original',
      'Pagos aplicados':      'pagos_aplicados',
      'Notas aplicadas':      'notas_aplicadas',
      'Saldo actual':         'saldo_actual',
      'Moneda':               'moneda',
      'Sin vencer':           'sin_vencer',
      '1 - 8 Días':           'dias_1_8',
      '9 - 15 Días':          'dias_9_15',
      '16 - 22 Días':         'dias_16_22',
      '23 - 30 Días':         'dias_23_30',
      '1 - 30 Días':          'dias_1_30',
      '31 - 60 Días':         'dias_31_60',
      '61 - 90 Días':         'dias_61_90',
      '91 - 120 Días':        'dias_91_120',
      'Más de 120 Días':      'mas_120_dias',
    };

    const MAPA_COBRAR = {
      'Vendedor':                    'vendedor',
      'Territorio':                  'territorio',
      'Código':                      'codigo',
      'Cliente':                     'cliente',
      'Tipo':                        'tipo',
      'Número':                      'numero',
      'Fecha de la factura':         'fecha_factura',
      'Fecha de vencimiento':        'fecha_vencimiento',
      'Saldo original':              'saldo_original',
      'Cobros aplicados':            'cobros_aplicados',
      'Notas de crédito aplicadas':  'notas_credito',
      'Notas de débito aplicadas':   'notas_debito',
      'Saldo actual':                'saldo_actual',
      'Moneda':                      'moneda',
      'Sin vencer':                  'sin_vencer',
      '1 - 30 Días':                 'dias_1_30',
      '31 - 60 Días':                'dias_31_60',
      '61 - 90 Días':                'dias_61_90',
      '91 - 120 Días':               'dias_91_120',
      'Más de 120 Días':             'mas_120_dias',
      'Notas':                       'notas',
    };

    const mapa = tabla === 'fin_cuentas_cobrar' ? MAPA_COBRAR : MAPA_PAGAR;

    // Construir renameMap col → campo
    const renameMap = {};
    headers.forEach((h, col) => {
      if (h && mapa[h]) renameMap[col] = mapa[h];
    });

    console.log(`[FinAPI] tabla=${tabla} headers encontrados=${Object.keys(renameMap).length}`);

    // Extraer datos — saltar filas de subtotal (sin código o número vacío)
    const now     = new Date().toISOString();
    const periodo = `Día ${new Date().toISOString().slice(0, 10).split('-').reverse().join('/')}`;
    const records = [];

    ws.eachRow((row, rn) => {
      if (rn <= headerRowNum) return; // saltar header y filas previas

      const obj = { fecha_carga: now, periodo_reporte: periodo };
      let hasData = false;

      Object.entries(renameMap).forEach(([col, campo]) => {
        const cell  = row.getCell(Number(col));
        let val     = cell.value;

        // ExcelJS puede retornar objetos richText
        if (val && typeof val === 'object' && val.richText) {
          val = val.richText.map(r => r.text).join('');
        }
        if (val && typeof val === 'object' && val.text) {
          val = val.text;
        }

        // Limpiar strings
        if (typeof val === 'string') val = val.trim();
        if (val === '' || val === null || val === undefined) val = null;

        obj[campo] = val;
        if (val !== null) hasData = true;
      });

      if (!hasData) return; // fila vacía

      // Filtrar filas de subtotal: tienen saldo pero no tienen código válido
      // Los subtotales de NEO tienen la col A vacía o igual al proveedor anterior
      const codigo = obj['codigo'] || obj['vendedor'];
      if (!codigo) return; // subtotal sin identificador

      records.push(obj);
    });

    if (records.length === 0) {
      return Response.json({ error: 'Sin datos válidos' }, { status: 422 });
    }

    // Borrar período anterior y reinsertar
    await supabase.from(tabla).delete().eq('periodo_reporte', periodo);
    const { error } = await supabase.from(tabla).insert(records);

    if (error) {
      console.error('[FinAPI] insert error:', error);
      return Response.json({ error: error.message }, { status: 500 });
    }

    console.log(`[FinAPI] OK: ${records.length} registros en ${tabla}`);
    return Response.json({ ok: true, registros: records.length, tabla });

  } catch (e) {
    console.error('[FinAPI] Error:', e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}
