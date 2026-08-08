import { getDb, ok, bad, handle, crearAsientoConLineas } from '../_lib'

export const dynamic = 'force-dynamic'

// Estados que ya salieron del panel (pestaña Enviados)
const ENVIADOS = ['aprobado', 'enviando', 'sincronizado', 'conciliado', 'error']

// GET /api/contabilidad/asientos?vista=bandeja|enviados&estado=&proveedor=&desde=&hasta=
export async function GET(request) {
  return handle(async () => {
    const db = getDb()
    const u = new URL(request.url)
    const vista = u.searchParams.get('vista') || 'bandeja'
    const estado = u.searchParams.get('estado')
    const proveedor = u.searchParams.get('proveedor')
    const desde = u.searchParams.get('desde')
    const hasta = u.searchParams.get('hasta')

    let q = db.from('conta_asientos').select(
      '*, factura:conta_facturas(clave,nombre_emisor,cedula_emisor,total_comprobante), lineas:conta_asiento_lineas(id)'
    )

    if (vista === 'bandeja') {
      q = q.eq('estado', 'borrador').order('creado_en', { ascending: true })
    } else {
      if (estado && estado !== 'todos') q = q.eq('estado', estado)
      else q = q.in('estado', ENVIADOS)
      q = q.order('actualizado_en', { ascending: false })
    }
    if (desde) q = q.gte('fecha', desde)
    if (hasta) q = q.lte('fecha', hasta)

    const { data, error } = await q
    if (error) throw error
    let rows = (data || []).map((a) => ({
      ...a,
      n_lineas: (a.lineas || []).length,
      proveedor_nombre: a.factura?.nombre_emisor || null,
    }))
    if (proveedor) {
      const p = proveedor.toLowerCase()
      rows = rows.filter((r) => (r.proveedor_nombre || '').toLowerCase().includes(p) || (r.descripcion || '').toLowerCase().includes(p))
    }
    return ok(rows)
  })
}

// POST /api/contabilidad/asientos  -> crea asiento manual/plantilla (borrador)
export async function POST(request) {
  return handle(async () => {
    const b = await request.json()
    if (!b?.fecha) return bad('La fecha es obligatoria.')
    if (!b?.descripcion?.trim()) return bad('La descripción es obligatoria.')
    const lineas = Array.isArray(b.lineas) ? b.lineas : []
    if (lineas.length < 1) return bad('El asiento necesita al menos una línea.')

    const a = await crearAsientoConLineas({
      fecha: b.fecha,
      descripcion: b.descripcion.trim(),
      tipo_origen: b.tipo_origen || 'manual',
      clave_factura: b.clave_factura || null,
      plantilla_id: b.plantilla_id || null,
      moneda: b.moneda || 'CRC',
      tipo_cambio: b.tipo_cambio || null,
      deducible: b.deducible !== false,
      creado_por: b.creado_por || null,
    }, lineas)

    return ok(a)
  })
}
