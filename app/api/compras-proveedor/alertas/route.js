import { getDb, ok, handle } from '../_lib'

export const dynamic = 'force-dynamic'

// GET /api/compras-proveedor/alertas?resuelta=false
export async function GET(request) {
  return handle(async () => {
    const url = new URL(request.url)
    const resuelta = url.searchParams.get('resuelta')
    let q = getDb()
      .from('cp_alertas')
      .select('*, compra:cp_compras(id,descripcion,cliente_nombre,proveedor_id,proveedor:cp_proveedores(nombre)), factura:cp_facturas(id,numero_factura)')
      .order('created_at', { ascending: false })
      .limit(500)
    if (resuelta === 'false') q = q.eq('resuelta', false)
    else if (resuelta === 'true') q = q.eq('resuelta', true)
    const { data, error } = await q
    if (error) throw error
    return ok(data || [])
  })
}
