import { requirePermiso } from '../../../../../lib/auth-server'
import { getDb, ok, bad, handle } from '../../_lib'

export const dynamic = 'force-dynamic'

const MAX_LOTE = 500

// POST /api/contabilidad/asientos/descartar-lote
//   { ids: [1,2,3], motivo, actor }  -> descarta varios borradores de una.
// Solo descarta: nunca aprueba ni envía nada a NEO, y solo toca asientos que
// siguen en estado 'borrador' (los demás se ignoran en silencio).
export async function POST(request) {
  const _g = await requirePermiso('contabilidad'); if (_g.response) return _g.response;

  return handle(async () => {
    const b = await request.json().catch(() => ({}))
    const actor = b.actor || 'sistema'
    const motivo = (b.motivo || '').toString().trim() || 'Sin motivo'
    const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Number.isInteger))]
    if (!ids.length) return bad('No llegó ningún borrador para descartar.')
    if (ids.length > MAX_LOTE) return bad(`Máximo ${MAX_LOTE} borradores por tanda.`)

    const db = getDb()
    const { data: filas, error: eSel } = await db.from('conta_asientos')
      .select('id, estado, clave_factura').in('id', ids)
    if (eSel) throw eSel

    const validos = (filas || []).filter((a) => a.estado === 'borrador')
    if (!validos.length) return bad('Ninguno de los seleccionados sigue en borrador.')
    const idsOk = validos.map((a) => a.id)

    const { error } = await db.from('conta_asientos')
      .update({ estado: 'descartado', detalle_error: motivo }).in('id', idsOk)
    if (error) throw error

    // Liberar las facturas para poder reprocesar el mismo XML
    const claves = validos.map((a) => a.clave_factura).filter(Boolean)
    if (claves.length) {
      await db.from('conta_facturas').update({ procesada: false }).in('clave', claves)
    }

    try {
      await db.from('conta_bitacora').insert(idsOk.map((id) => ({
        asiento_id: id, accion: 'descartado', actor,
        detalle: { estado_anterior: 'borrador', motivo, lote: idsOk.length },
      })))
    } catch { /* la bitácora nunca debe romper el flujo principal */ }

    return ok({ ok: true, descartados: idsOk.length, omitidos: ids.length - idsOk.length })
  })
}
