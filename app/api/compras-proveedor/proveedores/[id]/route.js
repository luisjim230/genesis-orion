import { getDb, ok, bad, handle } from '../../_lib'

export const dynamic = 'force-dynamic'

// PATCH /api/compras-proveedor/proveedores/:id
export async function PATCH(request, { params }) {
  return handle(async () => {
    const { id } = await params
    const b = await request.json()
    const patch = {}
    for (const k of ['nombre', 'cedula_juridica', 'contacto', 'email', 'telefono', 'notas']) {
      if (b[k] !== undefined) patch[k] = b[k]
    }
    if (b.dias_alerta_pago_sin_factura !== undefined) {
      patch.dias_alerta_pago_sin_factura = Math.max(1, parseInt(b.dias_alerta_pago_sin_factura, 10) || 8)
    }
    if (b.activo !== undefined) patch.activo = !!b.activo
    if (Object.keys(patch).length === 0) return bad('Nada para actualizar.')

    const { data, error } = await getDb()
      .from('cp_proveedores')
      .update(patch)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return ok(data)
  })
}
