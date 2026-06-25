import { getDb, ok, handle, recompute, HttpError } from '../../../../_lib'

export const dynamic = 'force-dynamic'

// DELETE /api/compras-proveedor/facturas/:id/links/:linkId
// Desvincula un pago de la factura. La compra vuelve a recalcularse.
export async function DELETE(_request, { params }) {
  return handle(async () => {
    const { id, linkId } = await params
    const db = getDb()

    const { data: link } = await db
      .from('cp_factura_pago_link')
      .select('id, factura_id, pago:cp_pagos(compra_id)')
      .eq('id', linkId)
      .eq('factura_id', id)
      .maybeSingle()
    if (!link) throw new HttpError(404, 'Vínculo no encontrado.')

    const compraId = link.pago?.compra_id
    const { error } = await db.from('cp_factura_pago_link').delete().eq('id', linkId)
    if (error) throw error

    if (compraId) await recompute(compraId)
    return ok({ ok: true })
  })
}
