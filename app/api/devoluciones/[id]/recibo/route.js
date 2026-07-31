import { getDb, handle, HttpError, BUCKET, contentTypePorNombre, contentDisposition } from '../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// GET /api/devoluciones/:id/recibo — streamea el recibo de la NC (PDF o imagen)
// desde el bucket privado. ?download=1 fuerza descarga; por defecto inline.
export async function GET(request, { params }) {
  return handle(async () => {
    const { id } = await params
    const db = getDb()
    const { data: dev } = await db.from('devoluciones')
      .select('recibo_path, recibo_nombre').eq('id', id).maybeSingle()
    if (!dev || !dev.recibo_path) throw new HttpError(404, 'Recibo no encontrado.')

    const { data: blob, error } = await db.storage.from(BUCKET).download(dev.recibo_path)
    if (error || !blob) throw new HttpError(404, 'No se pudo leer el recibo del storage.')

    const buf = Buffer.from(await blob.arrayBuffer())
    const download = new URL(request.url).searchParams.get('download') === '1'
    const dispo = download ? 'attachment' : 'inline'
    return new Response(buf, {
      headers: {
        'Content-Type': contentTypePorNombre(dev.recibo_path || dev.recibo_nombre),
        'Content-Disposition': contentDisposition(dispo, dev.recibo_nombre || 'recibo.pdf'),
        'Cache-Control': 'private, max-age=60',
      },
    })
  })
}
