import {
  getDb, ok, bad, handle, cargarContexto, buscarProveedor,
  armarLineasGasto, crearAsientoConLineas, modoPruebaActivo, HttpError,
} from '../_lib'

export const dynamic = 'force-dynamic'

const COLS = 'clave,consecutivo,nombre_emisor,cedula_emisor,fecha_emision,total_comprobante,moneda,num_oc,clasificacion,creado_en,revisada_en,revisada_por'

// GET /api/contabilidad/facturas?vista=ignoradas|revisadas
//  - ignoradas: leídas pero NO contabilizadas (mercadería), pendientes de revisar.
//  - revisadas: las que alguien marcó como "no requiere asiento" (con deshacer).
// Nunca se borran: acá se revisan, se convierten en gasto o se marcan revisadas.
export async function GET(request) {
  return handle(async () => {
    const db = getDb()
    const vista = new URL(request.url).searchParams.get('vista') || 'ignoradas'

    if (vista === 'revisadas') {
      const { data, error } = await db.from('conta_facturas')
        .select(COLS)
        .not('revisada_en', 'is', null)
        .order('revisada_en', { ascending: false })
        .limit(50)
      if (error) throw error
      return ok(data || [])
    }

    // Pendientes de revisar: mercadería, sin procesar y sin marca de revisión.
    const { data, error } = await db.from('conta_facturas')
      .select(COLS)
      .eq('clasificacion', 'mercaderia').eq('procesada', false).is('revisada_en', null)
      .order('creado_en', { ascending: false })
    if (error) throw error
    return ok(data || [])
  })
}

// POST /api/contabilidad/facturas
//   { accion: 'convertir', clave, creado_por }   -> crea borrador de gasto
//   { accion: 'no_requiere', clave, creado_por }  -> marca "revisada, sin asiento"
//   { accion: 'recuperar', clave }                -> deshace la revisión
export async function POST(request) {
  return handle(async () => {
    const db = getDb()
    const b = await request.json().catch(() => ({}))
    if (!b.clave) return bad('Falta la clave de la factura.')

    // Marcar como revisada (no requiere asiento): sale de pendientes sin crear nada.
    if (b.accion === 'no_requiere') {
      const { data: f } = await db.from('conta_facturas').select('clave').eq('clave', b.clave).maybeSingle()
      if (!f) throw new HttpError(404, 'Factura no encontrada.')
      const { error } = await db.from('conta_facturas')
        .update({ revisada_en: new Date().toISOString(), revisada_por: b.creado_por || null })
        .eq('clave', b.clave)
      if (error) throw error
      return ok({ ok: true })
    }

    // Deshacer la revisión: vuelve a pendientes.
    if (b.accion === 'recuperar') {
      const { error } = await db.from('conta_facturas')
        .update({ revisada_en: null, revisada_por: null })
        .eq('clave', b.clave)
      if (error) throw error
      return ok({ ok: true })
    }

    if (b.accion !== 'convertir') return bad('Acción no reconocida.')

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

    // Si vino en otra moneda, las líneas ya se convirtieron a CRC; se anota.
    const enMonedaExtranjera = factura.moneda && factura.moneda !== 'CRC' && Number(factura.tipo_cambio) > 1
    const notaMoneda = enMonedaExtranjera
      ? ` (${factura.moneda} ${Number(f.total_comprobante || 0).toLocaleString('es-CR')} @ ${factura.tipo_cambio})`
      : ''

    const asiento = await crearAsientoConLineas({
      fecha: (f.fecha_emision || new Date().toISOString()).slice(0, 10),
      descripcion: `${proveedor?.nombre || f.nombre_emisor || 'Proveedor'}${f.consecutivo ? ' · ' + f.consecutivo : ''}${notaMoneda}`,
      tipo_origen: f.xml_path ? 'xml' : (f.pdf_path ? 'pdf' : 'manual'),
      clave_factura: f.clave,
      moneda: 'CRC', tipo_cambio: f.tipo_cambio || null,
      deducible: proveedor?.deducible_default !== false,
      creado_por: b.creado_por || null,
      pdf_url: f.pdf_path || null,
      es_prueba: await modoPruebaActivo(),
    }, lineas)

    // La factura pasa a estar contabilizada: sale de "Ignoradas"
    await db.from('conta_facturas').update({ procesada: true, clasificacion: 'gasto' }).eq('clave', b.clave)

    return ok({ ok: true, asiento_id: asiento.id })
  })
}
