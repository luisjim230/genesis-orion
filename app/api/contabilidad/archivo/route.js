import { requirePermiso } from '../../../../lib/auth-server'
import { getDb, ok, bad, handle, BUCKET } from '../_lib'

export const dynamic = 'force-dynamic'

// GET /api/contabilidad/archivo?path=2026/....pdf  -> URL firmada temporal
export async function GET(request) {
  const _g = await requirePermiso('contabilidad'); if (_g.response) return _g.response;

  return handle(async () => {
    const path = new URL(request.url).searchParams.get('path')
    if (!path) return bad('Falta el path del archivo.')
    const { data, error } = await getDb().storage.from(BUCKET).createSignedUrl(path, 60 * 30)
    if (error) return bad('No se pudo abrir el archivo: ' + error.message, 404)
    return ok({ url: data.signedUrl })
  })
}
