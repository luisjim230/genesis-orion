import { getDb, handle, HttpError, registrarHistorial } from '../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// POST /api/devoluciones/:id/estado — transiciones de estado.
// Body JSON: { accion: 'pagar'|'rechazar'|'anular', referencia_pago?, motivo?,
//              actor_nombre?, actor_id? }
//
// Todas usan UPDATE ... WHERE id=X AND estado='pendiente' (o 'rechazada' para
// anular) para blindar contra doble procesamiento: si no afecta filas, se avisa
// que ya fue procesada.
export async function POST(request, { params }) {
  return handle(async () => {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const accion = body.accion
    const actor = { nombre: body.actor_nombre || null, id: body.actor_id || null }
    const db = getDb()

    const { data: actual } = await db.from('devoluciones').select('*').eq('id', id).maybeSingle()
    if (!actual) throw new HttpError(404, 'Devolución no encontrada.')

    if (accion === 'pagar') {
      const patch = {
        estado: 'pagada',
        pagado_por: actor.nombre,
        pagado_por_id: actor.id,
        pagado_en: new Date().toISOString(),
        referencia_pago: String(body.referencia_pago || '').trim() || null,
      }
      const { data, error } = await db.from('devoluciones')
        .update(patch).eq('id', id).eq('estado', 'pendiente').select('*').maybeSingle()
      if (error) throw new HttpError(500, error.message)
      if (!data) throw new HttpError(409, 'Esta devolución ya fue procesada. Refrescá la lista.')
      await registrarHistorial(id, 'pendiente', 'pagada', patch.referencia_pago || 'Pago confirmado', actor)
      return Response.json({ ok: true, devolucion: data })
    }

    if (accion === 'rechazar') {
      const motivo = String(body.motivo || '').trim()
      if (motivo.length < 5) throw new HttpError(400, 'El motivo de rechazo debe tener al menos 5 caracteres.')
      const { data, error } = await db.from('devoluciones')
        .update({ estado: 'rechazada', motivo_rechazo: motivo })
        .eq('id', id).eq('estado', 'pendiente').select('*').maybeSingle()
      if (error) throw new HttpError(500, error.message)
      if (!data) throw new HttpError(409, 'Esta devolución ya fue procesada. Refrescá la lista.')
      await registrarHistorial(id, 'pendiente', 'rechazada', motivo, actor)
      return Response.json({ ok: true, devolucion: data })
    }

    if (accion === 'anular') {
      const { data, error } = await db.from('devoluciones')
        .update({ estado: 'anulada' })
        .eq('id', id).in('estado', ['pendiente', 'rechazada']).select('*').maybeSingle()
      if (error) throw new HttpError(500, error.message)
      if (!data) throw new HttpError(409, 'Esta devolución ya no se puede anular. Refrescá la lista.')
      await registrarHistorial(id, actual.estado, 'anulada', String(body.motivo || '').trim() || 'Anulada por el contador', actor)
      return Response.json({ ok: true, devolucion: data })
    }

    throw new HttpError(400, 'Acción inválida.')
  })
}
