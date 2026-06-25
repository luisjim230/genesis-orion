import { getDb, ok, bad, handle, subirPdf, sugerenciasMatch, HttpError } from '../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// GET /api/compras-proveedor/facturas  -> lista de facturas con estado de conciliación
export async function GET(request) {
  return handle(async () => {
    const url = new URL(request.url)
    const proveedorId = url.searchParams.get('proveedor_id')
    let q = getDb()
      .from('cp_facturas')
      .select('*, proveedor:cp_proveedores(id,nombre), links:cp_factura_pago_link(id,monto_aplicado)')
      .order('created_at', { ascending: false })
    if (proveedorId) q = q.eq('proveedor_id', proveedorId)
    const { data, error } = await q
    if (error) throw error
    const facturas = (data || []).map(f => {
      const aplicado = (f.links || []).reduce((s, l) => s + Number(l.monto_aplicado), 0)
      return { ...f, monto_aplicado: aplicado, conciliada: Math.round(aplicado * 100) === Math.round(Number(f.monto_total) * 100), num_links: (f.links || []).length }
    })
    return ok(facturas)
  })
}

// POST /api/compras-proveedor/facturas  (multipart: pdf + campos)
// Sube la factura y devuelve sugerencias de match (sección 8.1 + 8.2).
export async function POST(request) {
  return handle(async () => {
    const form = await request.formData()
    const file = form.get('pdf')
    const proveedor_id = form.get('proveedor_id')
    const numero_factura = (form.get('numero_factura') || '').toString().trim()
    const fecha_factura = form.get('fecha_factura')
    const monto_total = Number(form.get('monto_total'))
    const notas = (form.get('notas') || '').toString().trim() || null
    const uploadedBy = (form.get('uploaded_by') || '').toString().trim() || null

    if (!proveedor_id) return bad('Seleccioná un proveedor.')
    if (!numero_factura) return bad('El número de factura es obligatorio.')
    if (!fecha_factura) return bad('La fecha de factura es obligatoria.')
    if (!(monto_total > 0)) return bad('El monto total debe ser mayor a 0.')

    const db = getDb()
    const { data: prov } = await db.from('cp_proveedores').select('id, activo').eq('id', proveedor_id).maybeSingle()
    if (!prov) return bad('El proveedor no existe.')
    if (prov.activo === false) return bad('El proveedor está inactivo.')

    const { data: existe } = await db
      .from('cp_facturas')
      .select('id')
      .eq('proveedor_id', proveedor_id)
      .eq('numero_factura', numero_factura)
      .maybeSingle()
    if (existe) throw new HttpError(409, `Ya existe la factura ${numero_factura} para este proveedor.`)

    const archivo = await subirPdf(file, { uploadedBy })

    const { data: factura, error } = await db
      .from('cp_facturas')
      .insert({ proveedor_id, numero_factura, fecha_factura, monto_total, notas, archivo_id: archivo.id })
      .select('*')
      .single()
    if (error) throw error

    const sugerencias = await sugerenciasMatch(factura.id)
    return ok({ factura, archivo, ...sugerencias })
  })
}
