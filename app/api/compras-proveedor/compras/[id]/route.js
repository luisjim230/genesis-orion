import { getDb, ok, bad, handle, HttpError } from '../../_lib'

export const dynamic = 'force-dynamic'

const ESTADOS = ['ABIERTA', 'PAGADA', 'FACTURADA', 'CERRADA']

// GET /api/compras-proveedor/compras/:id  -> detalle completo
export async function GET(_request, { params }) {
  return handle(async () => {
    const { id } = await params
    const db = getDb()

    const { data: compra, error: e1 } = await db
      .from('cp_compras')
      .select('*, proveedor:cp_proveedores(*)')
      .eq('id', id)
      .maybeSingle()
    if (e1) throw e1
    if (!compra) throw new HttpError(404, 'Compra no encontrada.')

    const { data: pagos } = await db
      .from('cp_pagos')
      .select('*, comprobante:cp_archivos(id,nombre,tamano_bytes), link:cp_factura_pago_link(id,factura_id,monto_aplicado)')
      .eq('compra_id', id)
      .order('fecha_pago', { ascending: true })

    // Facturas vinculadas a cualquier pago de esta compra.
    const facturaIds = [...new Set((pagos || []).flatMap(p => (p.link || []).map(l => l.factura_id)))]
    let facturas = []
    if (facturaIds.length) {
      const { data: f } = await db
        .from('cp_facturas')
        .select('*, archivo:cp_archivos(id,nombre)')
        .in('id', facturaIds)
      facturas = f || []
    }

    const { data: alertas } = await db
      .from('cp_alertas')
      .select('*')
      .eq('compra_id', id)
      .order('created_at', { ascending: false })

    // Timeline de eventos (orden cronológico).
    const eventos = []
    eventos.push({ ts: compra.created_at, tipo: 'compra_creada', texto: 'Compra registrada' })
    for (const p of pagos || []) {
      eventos.push({ ts: p.created_at, tipo: 'pago', texto: `Pago registrado · ₡${Number(p.monto).toLocaleString('es-CR')}`, ref: p.id })
    }
    for (const f of facturas) {
      eventos.push({ ts: f.created_at, tipo: 'factura', texto: `Factura ${f.numero_factura} vinculada · ₡${Number(f.monto_total).toLocaleString('es-CR')}`, ref: f.id })
    }
    for (const a of alertas || []) {
      eventos.push({ ts: a.created_at, tipo: 'alerta', texto: `Alerta ${a.tipo} (${a.severidad})${a.resuelta ? ' · resuelta' : ''}`, ref: a.id })
    }
    eventos.sort((x, y) => new Date(x.ts) - new Date(y.ts))

    const suma_pagos = (pagos || []).reduce((s, p) => s + Number(p.monto), 0)
    const suma_facturado = (pagos || []).reduce((s, p) => s + (p.link || []).reduce((ss, l) => ss + Number(l.monto_aplicado), 0), 0)

    return ok({ compra, pagos: pagos || [], facturas, alertas: alertas || [], eventos, suma_pagos, suma_facturado })
  })
}

// PATCH /api/compras-proveedor/compras/:id
export async function PATCH(request, { params }) {
  return handle(async () => {
    const { id } = await params
    const b = await request.json()
    const patch = {}
    for (const k of ['venta_cliente_ref', 'cliente_nombre', 'descripcion', 'unidad', 'fecha_cotizacion', 'fecha_entrega', 'notas']) {
      if (b[k] !== undefined) patch[k] = b[k] || null
    }
    if (b.cantidad !== undefined) patch.cantidad = b.cantidad === '' || b.cantidad == null ? null : Number(b.cantidad)
    if (b.monto_cotizado !== undefined) patch.monto_cotizado = b.monto_cotizado === '' || b.monto_cotizado == null ? null : Number(b.monto_cotizado)
    if (b.estado !== undefined) {
      if (!ESTADOS.includes(b.estado)) return bad('Estado inválido.')
      patch.estado = b.estado
    }
    if (Object.keys(patch).length === 0) return bad('Nada para actualizar.')
    patch.updated_at = new Date().toISOString()

    const { data, error } = await getDb()
      .from('cp_compras')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return ok(data)
  })
}

// DELETE /api/compras-proveedor/compras/:id  (sólo si no tiene pagos)
export async function DELETE(_request, { params }) {
  return handle(async () => {
    const { id } = await params
    const db = getDb()
    const { count } = await db.from('cp_pagos').select('id', { count: 'exact', head: true }).eq('compra_id', id)
    if (count && count > 0) return bad('No se puede borrar una compra con pagos registrados.')
    const { error } = await db.from('cp_compras').delete().eq('id', id)
    if (error) throw error
    return ok({ ok: true })
  })
}
