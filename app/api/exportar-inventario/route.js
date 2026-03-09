import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const ALERTA_ORDER = {
  '🔴 Bajo stock': 1, '🔴 Bajo stock 🚢': 2,
  '🟠 En tránsito': 3, '🟡 Prestar atención': 4,
  '🟢 Óptimo': 5, '🔵 Sobrestock': 6,
};

function calcularAlertas(items, transitoMap, dias) {
  return items.map(item => {
    const existencias = parseFloat(item.existencias || 0) || 0;
    const promMensual = parseFloat(item.promedio_mensual || 0) || 0;
    const codigo      = (item.codigo || '').toString().trim();
    const transito    = transitoMap[codigo] || 0;
    const sugerencia  = (promMensual / 30) * dias;
    const aBruto      = Math.max(sugerencia - existencias, 0);
    const aNeto       = Math.max(aBruto - transito, 0);
    const cantComprar = Math.ceil(aNeto);
    const existe      = existencias > 0;
    const promedio    = promMensual > 0;
    const comprar     = cantComprar > 0;
    const sobre       = existencias > sugerencia;
    const enTransito  = transito > 0;
    const transitoCubre = aBruto > 0 && transito >= aBruto;

    let alerta = '🟢 Óptimo';
    if (!existe && !promedio)                              alerta = '🟡 Prestar atención';
    else if (!existe && promedio && transitoCubre)         alerta = '🟠 En tránsito';
    else if (!existe && promedio && enTransito && comprar) alerta = '🔴 Bajo stock 🚢';
    else if (!existe && promedio)                          alerta = '🔴 Bajo stock';
    else if (comprar && enTransito)                        alerta = '🔴 Bajo stock 🚢';
    else if (comprar)                                      alerta = '🔴 Bajo stock';
    else if (sobre)                                        alerta = '🔵 Sobrestock';

    return { ...item, _alerta: alerta, _cantComprar: cantComprar, _transito: transito };
  });
}

export async function POST(request) {
  try {
    const { dias = 30 } = await request.json().catch(() => ({}));

    // 1. Cargar datos
    const { data: fd } = await supabase
      .from('neo_minimos_maximos').select('fecha_carga')
      .order('fecha_carga', { ascending: false }).limit(1);
    if (!fd?.length) return NextResponse.json({ error: 'Sin datos' }, { status: 400 });

    const fc = fd[0].fecha_carga;
    let todos = [], offset = 0;
    while (true) {
      const { data } = await supabase.from('neo_minimos_maximos')
        .select('*').eq('fecha_carga', fc).range(offset, offset + 999);
      if (!data?.length) break;
      todos = todos.concat(data);
      if (data.length < 1000) break;
      offset += 1000;
    }

    // 2. Tránsito
    const { data: tData } = await supabase.from('ordenes_compra_items')
      .select('codigo,cantidad_ordenada,cantidad_recibida,estado_item')
      .in('estado_item', ['pendiente', 'parcial']);
    const tMap = {};
    (tData || []).forEach(i => {
      const c = (i.codigo || '').trim();
      const p = Math.max((parseFloat(i.cantidad_ordenada) || 0) - (parseFloat(i.cantidad_recibida) || 0), 0);
      if (c && p > 0) tMap[c] = (tMap[c] || 0) + p;
    });

    // 3. Calcular alertas
    const calc = calcularAlertas(todos, tMap, dias);

    // 4. Agrupar por proveedor ordenado por alerta
    const porProv = {};
    calc.forEach(i => {
      const p = (i.ultimo_proveedor || 'Sin proveedor').trim();
      if (!porProv[p]) porProv[p] = [];
      porProv[p].push(i);
    });
    Object.keys(porProv).forEach(p => {
      porProv[p].sort((a, b) => (ALERTA_ORDER[a._alerta] || 9) - (ALERTA_ORDER[b._alerta] || 9));
    });

    // 5. Generar Excel con ExcelJS
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Filtrado agrupado');

    // Anchos de columna (igual que el original)
    ws.columns = [
      { width: 20.7 }, { width: 17.7 }, { width: 50.7 }, { width: 18.7 },
      { width: 13.7 }, { width: 15.7 }, { width: 20.7 }, { width: 16.7 },
      { width: 21.7 }, { width: 50.7 },
    ];

    // Fila de headers con fondo azul claro + bold + autofilter
    const headerRow = ws.addRow([
      'Alerta', 'Código', 'Nombre', 'Promedio mensual', 'Existencias',
      '🚢 En tránsito', 'Cantidad a comprar', 'Último costo',
      'Fecha última compra', 'Último proveedor'
    ]);
    headerRow.eachCell(cell => {
      cell.font = { bold: true, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F2FF' } };
      cell.alignment = { vertical: 'middle' };
    });
    ws.autoFilter = { from: 'A1', to: 'J1' };

    // Agregar proveedores
    Object.keys(porProv).sort().forEach((prov, idx) => {
      const items = porProv[prov];

      // 4 filas vacías entre proveedores
      if (idx > 0) {
        for (let k = 0; k < 4; k++) ws.addRow([]);
      }

      // Fila separadora mergeada con fondo azul oscuro + bold
      const sepRow = ws.addRow([`Proveedor: ${prov}`]);
      ws.mergeCells(`A${sepRow.number}:J${sepRow.number}`);
      sepRow.getCell(1).font = { bold: true, size: 11 };
      sepRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } };
      sepRow.getCell(1).alignment = { vertical: 'middle' };

      // Productos
      items.forEach(i => {
        ws.addRow([
          i._alerta,
          i.codigo,
          i.nombre,
          parseFloat(i.promedio_mensual) || 0,
          parseFloat(i.existencias) || 0,
          i._transito > 0 ? `🚢 ${i._transito}` : '–',
          i._cantComprar,
          parseFloat(i.ultimo_costo) || 0,
          i.ultima_compra ? String(i.ultima_compra).slice(0, 10) : '—',
          i.ultimo_proveedor || '',
        ]);
      });
    });

    // Hoja resumen
    const wsRes = workbook.addWorksheet('Resumen por Proveedor');
    wsRes.columns = [{ width: 50 }, { width: 12 }, { width: 14 }];
    const resHeader = wsRes.addRow(['Proveedor', 'Productos', 'A comprar']);
    resHeader.eachCell(cell => {
      cell.font = { bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F2FF' } };
    });
    Object.keys(porProv).sort().forEach(p => {
      wsRes.addRow([p, porProv[p].length, porProv[p].reduce((s, i) => s + i._cantComprar, 0)]);
    });

    // Generar buffer y devolver como descarga
    const buffer = await workbook.xlsx.writeBuffer();
    const ts = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    const filename = `filtrado_por_proveedor_${ts}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });

  } catch (e) {
    console.error('[exportar-inventario]', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
