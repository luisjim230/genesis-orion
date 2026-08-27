import { requirePermiso } from '../../../../../../lib/auth-server'
import {
  getDb, ok, bad, handle, HttpError,
  compararConEnvio, CAMPOS_APLICABLES, recalcularEstimado,
} from '../../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// POST /api/contenedores/docs/:id/aplicar
//   { campos: ['adelanto_monto', ...], valores: { campo: valorEditado } }
// Aplica al envío SOLO los campos que Luis marcó. Si él editó el valor antes
// de aplicar, manda el suyo en `valores` y ese es el que se guarda.
export async function POST(request, { params }) {
  const _g = await requirePermiso('contenedores'); if (_g.response) return _g.response;

  return handle(async () => {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const campos = Array.isArray(body.campos) ? body.campos : []
    const valores = body.valores && typeof body.valores === 'object' ? body.valores : {}
    if (!campos.length) return bad('No marcaste ningún campo para aplicar.')

    const db = getDb()
    const { data: doc } = await db.from('neptuno_docs').select('*').eq('id', id).maybeSingle()
    if (!doc) throw new HttpError(404, 'Documento no encontrado.')
    if (!doc.envio_id) throw new HttpError(400, 'Primero asigná este documento a un envío.')

    const { data: envio } = await db.from('neptuno_envios').select('*').eq('id', doc.envio_id).maybeSingle()
    if (!envio) throw new HttpError(404, 'Ese envío ya no existe.')

    const propuestos = new Map(compararConEnvio(envio, doc.extraido).map((f) => [f.campo, f]))
    const update = {}
    for (const campo of campos) {
      if (!CAMPOS_APLICABLES.has(campo)) continue
      const valor = Object.prototype.hasOwnProperty.call(valores, campo)
        ? valores[campo]
        : propuestos.get(campo)?.propuesto
      if (valor === undefined) continue
      update[campo] = valor === '' ? null : valor
      if (campo === 'impuestos_monto') update.impuestos_fijado = true
    }
    if (!Object.keys(update).length) return bad('No había nada aplicable en lo que marcaste.')

    update.actualizado = new Date().toLocaleDateString('es-CR', {
      timeZone: 'America/Costa_Rica', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    const { data: actualizado, error } = await db.from('neptuno_envios')
      .update(update).eq('id', envio.id).select('*').single()
    if (error) throw new HttpError(500, error.message)

    await recalcularEstimado(envio.id)
    const { data: fresco } = await db.from('neptuno_envios').select('*').eq('id', envio.id).maybeSingle()

    return ok({
      envio: fresco || actualizado,
      aplicados: Object.keys(update).filter((k) => k !== 'actualizado'),
      diferencias: compararConEnvio(fresco || actualizado, doc.extraido),
    })
  })
}
