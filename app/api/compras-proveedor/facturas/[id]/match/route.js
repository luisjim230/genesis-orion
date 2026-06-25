import { getDb, ok, bad, handle, recompute, HttpError } from '../../../_lib'

export const dynamic = 'force-dynamic'

// POST /api/compras-proveedor/facturas/:id/match
// body: [{pago_id, monto_aplicado}, ...]  ó  { links: [...] }
export async function POST(request, { params }) {
  return handle(async () => {
    const { id } = await params
    const body = await request.json()
    const links = Array.isArray(body) ? body : (body?.links || [])
    if (!links.length) return bad('Seleccioná al menos un pago para conciliar.')

    const db = getDb()
    const { data: factura } = await db.from('cp_facturas').select('*').eq('id', id).maybeSingle()
    if (!factura) throw new HttpError(404, 'Factura no encontrada.')

    const pagoIds = links.map(l => l.pago_id)
    const { data: pagos } = await db
      .from('cp_pagos')
      .select('id, monto, compra_id, compra:cp_compras!inner(proveedor_id), link:cp_factura_pago_link(id)')
      .in('id', pagoIds)

    const byId = Object.fromEntries((pagos || []).map(p => [String(p.id), p]))
    const rows = []
    for (const l of links) {
      const p = byId[String(l.pago_id)]
      if (!p) return bad(`El pago #${l.pago_id} no existe.`)
      if (p.compra.proveedor_id !== factura.proveedor_id) return bad(`El pago #${l.pago_id} es de otro proveedor.`)
      if (p.link && p.link.length) return bad(`El pago #${l.pago_id} ya está vinculado a otra factura.`)
      const aplicado = Number(l.monto_aplicado != null ? l.monto_aplicado : p.monto)
      if (!(aplicado > 0)) return bad(`Monto aplicado inválido en el pago #${l.pago_id}.`)
      if (Math.round(aplicado * 100) > Math.round(Number(p.monto) * 100)) {
        return bad(`El monto aplicado del pago #${l.pago_id} no puede superar su monto (₡${Number(p.monto).toLocaleString('es-CR')}).`)
      }
      rows.push({ factura_id: factura.id, pago_id: p.id, monto_aplicado: aplicado })
    }

    const { error: insErr } = await db.from('cp_factura_pago_link').insert(rows)
    if (insErr) throw insErr

    // Recalcular cada compra afectada.
    const compras = [...new Set((pagos || []).filter(p => pagoIds.includes(p.id)).map(p => p.compra_id))]
    for (const cid of compras) await recompute(cid)

    // La factura dejó de estar huérfana.
    await db.from('cp_alertas').update({ resuelta: true, resuelta_at: new Date().toISOString() })
      .eq('factura_id', factura.id).eq('tipo', 'FACTURA_HUERFANA').eq('resuelta', false)

    const sumAplicado = rows.reduce((s, r) => s + r.monto_aplicado, 0)
    const conciliada = Math.round(sumAplicado * 100) === Math.round(Number(factura.monto_total) * 100)

    return ok({
      ok: true,
      conciliada,
      monto_aplicado: sumAplicado,
      monto_total: Number(factura.monto_total),
      compras_afectadas: compras,
      warning: conciliada ? null : 'La suma aplicada no iguala el total de la factura; quedó con discrepancia.',
    })
  })
}
