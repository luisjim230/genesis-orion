import {
  getDb, ok, bad, handle, cargarContexto, buscarProveedor,
  armarLineasGasto, crearAsientoConLineas, HttpError,
} from '../_lib'

export const dynamic = 'force-dynamic'

// GET /api/contabilidad/facturas?vista=ignoradas
// Facturas leídas pero NO contabilizadas (mercadería / OC), procesada=false.
// Nunca se borran: acá se pueden revisar y convertir en gasto.
export async function GET(request) {
  return handle(async () => {
    const db = getDb()
    const vista = new URL(request.url).searchParams.get('vista') || 'ignoradas'
    if (vista !== 'ignoradas') return ok([])
    const { data, error } = await db.from('conta_facturas')
      .select('clave,consecutivo,nombre_emisor,cedula_emisor,fecha_emision,total_comprobante,moneda,num_oc,clasificacion,creado_en')
      .eq('clasificacion', 'mercaderia').eq('procesada', false)
      .order('creado_en', { ascending: false })
    if (error) throw error
    return ok(data || [])
  })
}

// POST /api/contabilidad/facturas  { accion: 'convertir', clave, creado_por }
// Crea un borrador de gasto a partir de una factura ignorada y la marca
// procesada = true (deja de aparecer en "Ignoradas").
export async function POST(request) {
  return handle(async () => {
    const db = getDb()
    const b = await request.json().catch(() => ({}))
    if (b.accion !== 'convertir') return bad('Acción no reconocida.')
    if (!b.clave) return bad('Falta la clave de la factura.')

    const { data: f } = await db.from('conta_facturas').select('*').eq('clave', b.clave).maybeSingle()
    if (!f) throw new HttpError(404, 'Factura no encontrada.')

    // ¿Ya tiene un asiento activo?
    const { data: asx } = await db.from('conta_asientos').select('id,estado').eq('clave_factura', b.clave).neq('estado', 'descartado').maybeSingle()
    if (asx) return bad(`Esta factura ya tiene el asiento #${asx.id} (${asx.estado}).`)

    const ctx = await cargarContexto()
    const proveedor = await buscarProveedor(f.cedula_emisor, f.nombre_emisor)

    // Reconstruir la forma que espera armarLineasGasto desde lo guardado
    const factura = {
      clave: f.clave, consecutivo: f.consecutivo, moneda: f.moneda || 'CRC',
      tipo_cambio: f.tipo_cambio, venta_neta: (Number(f.total_comprobante) || 0) - (Number(f.total_impuesto) || 0),
      total_comprobante: f.total_comprobante, total_impuesto: f.total_impuesto,
      desglose_impuesto: Array.isArray(f.desglose_impuesto) ? f.desglose_impuesto : [],
      lineas: Array.isArray(f.lineas) ? f.lineas : [],
      fecha_emision: f.fecha_emision,
    }
    const { lineas } = armarLineasGasto(factura, proveedor, ctx, 'gasto')

    const asiento = await crearAsientoConLineas({
      fecha: (f.fecha_emision || new Date().toISOString()).slice(0, 10),
      descripcion: `${proveedor?.nombre || f.nombre_emisor || 'Proveedor'}${f.consecutivo ? ' · ' + f.consecutivo : ''}`,
      tipo_origen: f.xml_path ? 'xml' : (f.pdf_path ? 'pdf' : 'manual'),
      clave_factura: f.clave,
      moneda: f.moneda || 'CRC', tipo_cambio: f.tipo_cambio || null,
      deducible: proveedor?.deducible_default !== false,
      creado_por: b.creado_por || null,
      pdf_url: f.pdf_path || null,
    }, lineas)

    // La factura pasa a estar contabilizada: sale de "Ignoradas"
    await db.from('conta_facturas').update({ procesada: true, clasificacion: 'gasto' }).eq('clave', b.clave)

    return ok({ ok: true, asiento_id: asiento.id })
  })
}
