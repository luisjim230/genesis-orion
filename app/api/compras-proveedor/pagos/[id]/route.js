import { getDb, ok, handle, recompute, HttpError } from '../../_lib'

export const dynamic = 'force-dynamic'

// DELETE /api/compras-proveedor/pagos/:id
// Libera el link de factura si existía. El archivo NUNCA se borra (sólo se
// desvincula); queda en cp_archivos para trazabilidad fiscal.
export async function DELETE(_request, { params }) {
  return handle(async () => {
    const { id } = await params
    const db = getDb()

    const { data: pago } = await db.from('cp_pagos').select('id, compra_id').eq('id', id).maybeSingle()
    if (!pago) throw new HttpError(404, 'Pago no encontrado.')

    // El link factura<->pago se borra por ON DELETE CASCADE; el archivo queda.
    const { error } = await db.from('cp_pagos').delete().eq('id', id)
    if (error) throw error

    await recompute(pago.compra_id)
    return ok({ ok: true })
  })
}
