import ExcelJS from 'exceljs'
import { getDb, bad } from '../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const ENVIADOS = ['aprobado', 'enviando', 'sincronizado', 'conciliado', 'rechazado', 'error']

// GET /api/contabilidad/exportar?estado=&desde=&hasta=&proveedor=&incluir_prueba=
// Devuelve un .xlsx con los asientos enviados.
export async function GET(request) {
  try {
    const db = getDb()
    const u = new URL(request.url)
    const estado = u.searchParams.get('estado')
    const desde = u.searchParams.get('desde')
    const hasta = u.searchParams.get('hasta')
    const proveedor = u.searchParams.get('proveedor')
    const incluirPrueba = u.searchParams.get('incluir_prueba') !== 'false'

    let q = db.from('conta_asientos')
      .select('*, factura:conta_facturas(nombre_emisor,cedula_emisor)')
      .order('actualizado_en', { ascending: false })
    if (estado && estado !== 'todos') q = q.eq('estado', estado)
    else q = q.in('estado', ENVIADOS)
    if (desde) q = q.gte('fecha', desde)
    if (hasta) q = q.lte('fecha', hasta)
    if (!incluirPrueba) q = q.eq('es_prueba', false)
    const { data, error } = await q
    if (error) return bad(error.message, 500)

    let rows = data || []
    if (proveedor) {
      const p = proveedor.toLowerCase()
      rows = rows.filter((r) => (r.factura?.nombre_emisor || r.descripcion || '').toLowerCase().includes(p))
    }

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Asientos enviados')
    ws.columns = [
      { header: 'ID', key: 'id', width: 8 },
      { header: 'Fecha', key: 'fecha', width: 12 },
      { header: 'Proveedor', key: 'prov', width: 34 },
      { header: 'Descripción', key: 'desc', width: 40 },
      { header: 'Moneda', key: 'moneda', width: 8 },
      { header: 'Total', key: 'total', width: 16 },
      { header: 'Estado', key: 'estado', width: 14 },
      { header: 'Asiento NEO', key: 'neo', width: 16 },
      { header: 'Aprobado por', key: 'aprob', width: 26 },
      { header: 'Aprobado en', key: 'aproben', width: 20 },
      { header: 'Intentos', key: 'intentos', width: 9 },
      { header: 'Prueba', key: 'prueba', width: 8 },
      { header: 'Error', key: 'err', width: 40 },
    ]
    ws.getRow(1).font = { bold: true }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF225F74' } }
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    for (const r of rows) {
      ws.addRow({
        id: r.id, fecha: r.fecha,
        prov: r.factura?.nombre_emisor || '—', desc: r.descripcion,
        moneda: r.moneda, total: Number(r.total_debe) || 0,
        estado: r.estado, neo: r.asiento_neo || '',
        aprob: r.aprobado_por || '', aproben: r.aprobado_en ? new Date(r.aprobado_en).toLocaleString('es-CR') : '',
        intentos: r.intentos || 0, prueba: r.es_prueba ? 'SÍ' : '', err: r.detalle_error || '',
      })
    }
    ws.getColumn('total').numFmt = '#,##0.00'

    const buf = await wb.xlsx.writeBuffer()
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="asientos-contabilidad-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    })
  } catch (e) {
    return bad(String(e?.message || e), 500)
  }
}
