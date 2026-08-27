import { requirePermiso } from '../../../../../../lib/auth-server'
import { getDb, handle, HttpError, BUCKET } from '../../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// GET /api/contenedores/docs/:id/archivo → sirve el archivo original.
// ?download=1 fuerza la descarga (los Excel siempre se descargan).
export async function GET(request, { params }) {
  const _g = await requirePermiso('contenedores'); if (_g.response) return _g.response;

  return handle(async () => {
    const { id } = await params
    const db = getDb()
    const { data: doc } = await db.from('neptuno_docs')
      .select('nombre, mime_type, storage_path').eq('id', id).maybeSingle()
    if (!doc) throw new HttpError(404, 'Documento no encontrado.')

    const { data: blob, error } = await db.storage.from(BUCKET).download(doc.storage_path)
    if (error || !blob) throw new HttpError(404, 'El archivo ya no está en el storage.')

    const buf = Buffer.from(await blob.arrayBuffer())
    const forzar = new URL(request.url).searchParams.get('download') === '1'
    const esPdf = /pdf/i.test(doc.mime_type || '') || /\.pdf$/i.test(doc.nombre || '')
    const dispo = forzar || !esPdf ? 'attachment' : 'inline'
    return new Response(buf, {
      headers: {
        'Content-Type': doc.mime_type || 'application/octet-stream',
        'Content-Disposition': `${dispo}; filename="${(doc.nombre || 'documento').replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=60',
      },
    })
  })
}
