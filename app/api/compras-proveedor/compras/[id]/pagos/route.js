import { getDb, ok, bad, handle, recompute, subirPdf, HttpError } from '../../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// POST /api/compras-proveedor/compras/:id/pagos  (multipart: pdf + campos)
export async function POST(request, { params }) {
  return handle(async () => {
    const { id } = await params
    const db = getDb()

    const { data: compra } = await db
      .from('cp_compras')
      .select('id, estado, proveedor_id')
      .eq('id', id)
      .maybeSingle()
    if (!compra) throw new HttpError(404, 'Compra no encontrada.')
    if (!['ABIERTA', 'PAGADA'].includes(compra.estado)) {
      return bad(`No se aceptan pagos en una compra ${compra.estado}.`)
    }

    const form = await request.formData()
    const file = form.get('pdf')
    const monto = Number(form.get('monto'))
    const fecha_pago = form.get('fecha_pago')
    const referencia_bancaria = (form.get('referencia_bancaria') || '').toString().trim() || null
    const banco_origen = (form.get('banco_origen') || '').toString().trim() || null
    const uploadedBy = (form.get('uploaded_by') || '').toString().trim() || null

    if (!(monto > 0)) return bad('El monto debe ser mayor a 0.')
    if (!fecha_pago) return bad('La fecha de pago es obligatoria.')

    // Warning (no bloqueante): referencia repetida para el mismo proveedor.
    let warning = null
    if (referencia_bancaria) {
      const { data: rep } = await db
        .from('cp_pagos')
        .select('id, compra:cp_compras!inner(proveedor_id)')
        .eq('referencia_bancaria', referencia_bancaria)
        .eq('compra.proveedor_id', compra.proveedor_id)
        .limit(1)
      if (rep && rep.length) warning = `Ojo: la referencia ${referencia_bancaria} ya figura en otro pago de este proveedor.`
    }

    const archivo = await subirPdf(file, { uploadedBy })

    const { data: pago, error } = await db
      .from('cp_pagos')
      .insert({
        compra_id: id,
        fecha_pago,
        monto,
        referencia_bancaria,
        banco_origen,
        comprobante_archivo_id: archivo.id,
      })
      .select('*')
      .single()
    if (error) throw error

    await recompute(id)
    return ok({ pago, archivo, warning })
  })
}
