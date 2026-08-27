import { requirePermiso } from '../../../../lib/auth-server'
import { getDb, ok, bad, handle, subirArchivo, docsDeCompra } from '../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PAGE_SIZE = 50

// GET /api/compras-proveedor/compras?estado=&proveedor_id=&alerta=&falta=&q=&page=
// `falta` filtra por documento pendiente:
//   factura     -> ya se pagó y no llegó la factura del proveedor
//   pago        -> solicitud de pago todavía sin pagar
//   venta       -> sin respaldo de la venta al cliente
//   cotizacion  -> sin cotización del proveedor
export async function GET(request) {
  const _g = await requirePermiso('compras-proveedor'); if (_g.response) return _g.response;

  return handle(async () => {
    const url = new URL(request.url)
    const estado = url.searchParams.get('estado')
    const proveedorId = url.searchParams.get('proveedor_id')
    const alerta = url.searchParams.get('alerta')
    const falta = url.searchParams.get('falta')
    const q = (url.searchParams.get('q') || '').trim()
    const page = Math.max(0, parseInt(url.searchParams.get('page') || '0', 10) || 0)

    let query = getDb()
      .from('cp_compras')
      .select(
        '*, proveedor:cp_proveedores(id,nombre), ' +
        'venta_archivo:cp_archivos!cp_compras_venta_archivo_id_fkey(id,nombre,mime_type), ' +
        'cotizacion_archivo:cp_archivos!cp_compras_cotizacion_archivo_id_fkey(id,nombre,mime_type), ' +
        'pagos:cp_pagos(id,monto,comprobante_archivo_id,link:cp_factura_pago_link(id))',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (estado) query = query.eq('estado', estado)
    if (proveedorId) query = query.eq('proveedor_id', proveedorId)
    if (alerta === 'true') query = query.or('bandera_alerta_vencida.eq.true,bandera_discrepancia.eq.true')
    if (!estado && falta === 'factura') query = query.eq('estado', 'PAGADA')
    if (!estado && falta === 'pago') query = query.eq('estado', 'ABIERTA')
    if (falta === 'venta') query = query.is('venta_archivo_id', null)
    if (falta === 'cotizacion') query = query.is('cotizacion_archivo_id', null)
    if (q) query = query.or(`descripcion.ilike.%${q}%,cliente_nombre.ilike.%${q}%,venta_cliente_ref.ilike.%${q}%`)

    const { data, error, count } = await query
    if (error) throw error

    const compras = (data || []).map(c => {
      const { pagos, ...resto } = c
      return { ...resto, ...docsDeCompra(c, pagos || []) }
    })
    return ok({ compras, total: count || 0, page, page_size: PAGE_SIZE })
  })
}

// POST /api/compras-proveedor/compras -> crea la compra / solicitud de pago.
// Acepta JSON o multipart. En multipart puede venir el respaldo de la venta al
// cliente (`venta_file`) y la cotización del proveedor (`cotizacion_file`),
// en PDF o foto.
export async function POST(request) {
  const _g = await requirePermiso('compras-proveedor'); if (_g.response) return _g.response;

  return handle(async () => {
    const ct = request.headers.get('content-type') || ''
    let b = {}
    let ventaFile = null, cotizacionFile = null
    if (ct.includes('multipart/form-data')) {
      const form = await request.formData()
      for (const [k, v] of form.entries()) {
        if (typeof v === 'string') b[k] = v
      }
      const vf = form.get('venta_file')
      const cf = form.get('cotizacion_file')
      if (vf && typeof vf.arrayBuffer === 'function' && vf.size > 0) ventaFile = vf
      if (cf && typeof cf.arrayBuffer === 'function' && cf.size > 0) cotizacionFile = cf
    } else {
      b = await request.json()
    }

    if (!b?.proveedor_id) return bad('Seleccioná un proveedor.')
    if (!b?.descripcion?.trim()) return bad('La descripción es obligatoria.')

    const db = getDb()
    const { data: prov } = await db.from('cp_proveedores').select('id,activo').eq('id', b.proveedor_id).maybeSingle()
    if (!prov) return bad('El proveedor no existe.')

    const uploadedBy = (b.uploaded_by || '').trim() || null
    const ventaArchivo = ventaFile ? await subirArchivo(ventaFile, { uploadedBy, reusarSiExiste: true }) : null
    const cotizacionArchivo = cotizacionFile ? await subirArchivo(cotizacionFile, { uploadedBy, reusarSiExiste: true }) : null

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
        venta_archivo_id: ventaArchivo?.id || null,
        cotizacion_archivo_id: cotizacionArchivo?.id || null,
        solicitado_por: uploadedBy,
        urgente: b.urgente === 'true' || b.urgente === true,
      })
      .select('*')
      .single()
    if (error) throw error
    return ok({ ...data, ...docsDeCompra(data, []) })
  })
}
