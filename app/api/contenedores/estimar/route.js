import { requirePermiso } from '../../../../lib/auth-server'
import { getDb, ok, bad, handle, HttpError, estimarImpuestos, recalcularEstimado } from '../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// GET /api/contenedores/estimar?envio_id=...  → estimado sin guardar nada
export async function GET(request) {
  const _g = await requirePermiso('contenedores'); if (_g.response) return _g.response;

  return handle(async () => {
    const envioId = new URL(request.url).searchParams.get('envio_id')
    if (!envioId) return bad('Falta envio_id.')
    const db = getDb()
    const { data: envio } = await db.from('neptuno_envios').select('*').eq('id', envioId).maybeSingle()
    if (!envio) throw new HttpError(404, 'Ese envío ya no existe.')
    const { data: items } = await db.from('neptuno_items').select('monto, dai_pct').eq('envio_id', envioId)
    return ok({ estimado: estimarImpuestos({ envio, items: items || [] }) })
  })
}

// POST /api/contenedores/estimar  { envio_id }
// Recalcula el estimado y lo guarda. Nunca toca impuestos_monto (el real).
export async function POST(request) {
  const _g = await requirePermiso('contenedores'); if (_g.response) return _g.response;

  return handle(async () => {
    const body = await request.json().catch(() => ({}))
    const envioId = (body.envio_id || '').toString().trim()
    if (!envioId) return bad('Falta envio_id.')
    const est = await recalcularEstimado(envioId)
    if (!est) throw new HttpError(404, 'Ese envío ya no existe.')
    return ok({ estimado: est })
  })
}
