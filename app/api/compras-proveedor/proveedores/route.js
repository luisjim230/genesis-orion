import { getDb, ok, bad, handle } from '../_lib'

export const dynamic = 'force-dynamic'

// GET /api/compras-proveedor/proveedores  -> lista de proveedores
export async function GET() {
  return handle(async () => {
    const { data, error } = await getDb()
      .from('cp_proveedores')
      .select('*')
      .order('nombre', { ascending: true })
    if (error) throw error
    return ok(data || [])
  })
}

// POST /api/compras-proveedor/proveedores  -> crea proveedor
export async function POST(request) {
  return handle(async () => {
    const b = await request.json()
    if (!b?.nombre?.trim()) return bad('El nombre es obligatorio.')
    const { data, error } = await getDb()
      .from('cp_proveedores')
      .insert({
        nombre: b.nombre.trim(),
        cedula_juridica: b.cedula_juridica || null,
        contacto: b.contacto || null,
        email: b.email || null,
        telefono: b.telefono || null,
        dias_alerta_pago_sin_factura: Number.isFinite(+b.dias_alerta_pago_sin_factura)
          ? Math.max(1, parseInt(b.dias_alerta_pago_sin_factura, 10)) : 8,
        activo: b.activo !== false,
      })
      .select('*')
      .single()
    if (error) throw error
    return ok(data)
  })
}
