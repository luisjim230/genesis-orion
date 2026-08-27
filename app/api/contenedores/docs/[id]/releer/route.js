import { requirePermiso } from '../../../../../../lib/auth-server'
import { getDb, ok, handle, HttpError, leerDocumento, compararConEnvio } from '../../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

// POST /api/contenedores/docs/:id/releer
// Vuelve a leer un archivo que ya está guardado. Sirve cuando la lectura falló
// (faltaba la clave, se cayó la conexión) o cuando leyó algo mal.
// Las líneas de mercadería que Luis corrigió a mano NO se tocan.
export async function POST(_request, { params }) {
  const _g = await requirePermiso('contenedores'); if (_g.response) return _g.response;

  return handle(async () => {
    const { id } = await params
    const db = getDb()
    const { data: doc } = await db.from('neptuno_docs').select('*').eq('id', id).maybeSingle()
    if (!doc) throw new HttpError(404, 'Documento no encontrado.')

    const r = await leerDocumento(doc)
    if (!r.extraido) throw new HttpError(502, r.error || 'No se pudo leer el archivo.')

    let envio = null
    if (doc.envio_id) {
      const { data } = await db.from('neptuno_envios').select('*').eq('id', doc.envio_id).maybeSingle()
      envio = data || null
    }

    return ok({
      doc: r.doc,
      items: r.items.length,
      candidatos: r.candidatos,
      diferencias: compararConEnvio(envio, r.extraido),
    })
  })
}
