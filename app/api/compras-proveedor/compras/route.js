import { getDb, ok, bad, handle } from '../_lib'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 50

// GET /api/compras-proveedor/compras?estado=&proveedor_id=&alerta=&q=&page=
export async function GET(request) {
  return handle(async () => {
    const url = new URL(request.url)
    const estado = url.searchParams.get('estado')
    const proveedorId = url.searchParams.get('proveedor_id')
    const alerta = url.searchParams.get('alerta')
    const q = (url.searchParams.get('q') || '').trim()
    const page = Math.max(0, parseInt(url.searchParams.get('page') || '0', 10) || 0)

    let query = getDb()
      .from('cp_compras')
      .select('*, proveedor:cp_proveedores(id,nombre)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (estado) query = query.eq('estado', estado)
    if (proveedorId) query = query.eq('proveedor_id', proveedorId)
    if (alerta === 'true') query = query.or('bandera_alerta_vencida.eq.true,bandera_discrepancia.eq.true')
    if (q) query = query.or(`descripcion.ilike.%${q}%,cliente_nombre.ilike.%${q}%,venta_cliente_ref.ilike.%${q}%`)

    const { data, error, count } = await query
    if (error) throw error
    return ok({ compras: data || [], total: count || 0, page, page_size: PAGE_SIZE })
  })
}

// POST /api/compras-proveedor/compras  -> crea compra (estado ABIERTA)
export async function POST(request) {
  return handle(async () => {
    const b = await request.json()
    if (!b?.proveedor_id) return bad('Seleccioná un proveedor.')
    if (!b?.descripcion?.trim()) return bad('La descripción es obligatoria.')

    const db = getDb()
    const { data: prov } = await db.from('cp_proveedores').select('id,activo').eq('id', b.proveedor_id).maybeSingle()
    if (!prov) return bad('El proveedor no existe.')

    const { data, error } = await db
      .from('cp_compras')
      .insert({
        proveedor_id: b.proveedor_id,
        venta_cliente_ref: b.venta_cliente_ref || null,
        cliente_nombre: b.cliente_nombre || null,
        descripcion: b.descripcion.trim(),
        cantidad: b.cantidad != null && b.cantidad !== '' ? Number(b.cantidad) : null,
        unidad: b.unidad || null,
        monto_cotizado: b.monto_cotizado != null && b.monto_cotizado !== '' ? Number(b.monto_cotizado) : null,
        fecha_cotizacion: b.fecha_cotizacion || null,
        fecha_entrega: b.fecha_entrega || null,
        notas: b.notas || null,
      })
      .select('*')
      .single()
    if (error) throw error
    return ok(data)
  })
}
