import { requirePermiso } from '../../../../lib/auth-server'
import {
  getDb, ok, bad, handle, cargarContexto, armarLineasGasto,
  sanearLineas, bitacora, HttpError,
} from '../_lib'

export const dynamic = 'force-dynamic'

// POST /api/contabilidad/proveedores
//   { accion:'amarrar', asiento_id, proveedor_id, actor }
//     -> guarda la cédula del emisor en ese proveedor y re-arma el asiento con
//        su cuenta/centro/contrapartida.
//   { accion:'nuevo', asiento_id, actor }
//     -> crea el proveedor con la cédula y el nombre del XML (por_clasificar).
export async function POST(request) {
  const _g = await requirePermiso('contabilidad'); if (_g.response) return _g.response;

  return handle(async () => {
    const db = getDb()
    const b = await request.json().catch(() => ({}))
    const actor = b.actor || 'sistema'

    const { data: asiento } = await db.from('conta_asientos').select('*').eq('id', b.asiento_id).maybeSingle()
    if (!asiento) throw new HttpError(404, 'Asiento no encontrado.')
    if (!asiento.clave_factura) return bad('Este asiento no viene de una factura, no hay proveedor que amarrar.')
    const { data: factura } = await db.from('conta_facturas').select('*').eq('clave', asiento.clave_factura).maybeSingle()
    if (!factura) throw new HttpError(404, 'Factura no encontrada.')
    const cedula = (factura.cedula_emisor || '').trim()
    if (!cedula) return bad('La factura no trae cédula de emisor.')

    if (b.accion === 'amarrar') {
      const { data: prov } = await db.from('conta_proveedores').select('*').eq('id', b.proveedor_id).maybeSingle()
      if (!prov) return bad('Proveedor no encontrado.')
      // Si la cédula ya está en otro proveedor, no duplicar
      const { data: ocupa } = await db.from('conta_proveedores').select('id,nombre').eq('cedula', cedula).maybeSingle()
      if (ocupa && ocupa.id !== prov.id) return bad(`Esa cédula ya está amarrada a "${ocupa.nombre}".`)

      await db.from('conta_proveedores').update({ cedula, actualizado_en: new Date().toISOString() }).eq('id', prov.id)
      const provFull = { ...prov, cedula }

      // Re-armar el asiento con la info del proveedor
      const ctx = await cargarContexto()
      const facturaShape = {
        moneda: factura.moneda || 'CRC',
        venta_neta: (Number(factura.total_comprobante) || 0) - (Number(factura.total_impuesto) || 0),
        desglose_impuesto: Array.isArray(factura.desglose_impuesto) ? factura.desglose_impuesto : [],
        lineas: Array.isArray(factura.lineas) ? factura.lineas : [],
      }
      const { lineas } = armarLineasGasto(facturaShape, provFull, ctx, 'gasto')
      const filas = sanearLineas(lineas, Number(b.asiento_id))
      await db.from('conta_asiento_lineas').delete().eq('asiento_id', b.asiento_id)
      if (filas.length) await db.from('conta_asiento_lineas').insert(filas)

      // Actualizar clasificación de la factura según el proveedor
      const clasif = prov.clasificacion === 'gasto' ? 'gasto' : (prov.clasificacion || 'por_clasificar')
      await db.from('conta_facturas').update({ clasificacion: clasif }).eq('clave', asiento.clave_factura)

      await bitacora(b.asiento_id, 'proveedor_amarrado', actor, { proveedor_id: prov.id, nombre: prov.nombre, cedula })
      return ok({ ok: true, proveedor: provFull })
    }

    if (b.accion === 'nuevo') {
      const { data: existe } = await db.from('conta_proveedores').select('id').eq('cedula', cedula).maybeSingle()
      if (existe) return bad('Ya existe un proveedor con esa cédula.')
      const { data: prov, error } = await db.from('conta_proveedores').insert({
        cedula, nombre: factura.nombre_emisor || cedula, clasificacion: 'por_clasificar',
      }).select('*').single()
      if (error) throw error
      await bitacora(b.asiento_id, 'proveedor_creado', actor, { proveedor_id: prov.id, nombre: prov.nombre, cedula })
      return ok({ ok: true, proveedor: prov })
    }

    return bad('Acción no reconocida.')
  })
}
