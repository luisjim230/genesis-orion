import { getDb, handle, HttpError, subirComprobante, registrarHistorial, BUCKET } from '../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Deduce el content-type de la imagen a partir de la extensión del archivo.
function tipoImagen(nombre) {
  const n = String(nombre || '').toLowerCase()
  if (n.endsWith('.png')) return 'image/png'
  if (n.endsWith('.webp')) return 'image/webp'
  if (n.endsWith('.heic')) return 'image/heic'
  if (n.endsWith('.heif')) return 'image/heif'
  return 'image/jpeg'
}

// GET /api/devoluciones/:id/comprobante — streamea la imagen del comprobante
// de la transferencia desde el bucket privado. La puede abrir cualquiera que
// tenga acceso al módulo (por eso pasa por la API con service_role).
export async function GET(request, { params }) {
  return handle(async () => {
    const { id } = await params
    const db = getDb()
    const { data: dev } = await db.from('devoluciones')
      .select('comprobante_path, comprobante_nombre').eq('id', id).maybeSingle()
    if (!dev || !dev.comprobante_path) throw new HttpError(404, 'Comprobante no encontrado.')

    const { data: blob, error } = await db.storage.from(BUCKET).download(dev.comprobante_path)
    if (error || !blob) throw new HttpError(404, 'No se pudo leer el comprobante del storage.')

    const buf = Buffer.from(await blob.arrayBuffer())
    const download = new URL(request.url).searchParams.get('download') === '1'
    const dispo = download ? 'attachment' : 'inline'
    const nombreSafe = (dev.comprobante_nombre || 'comprobante.jpg').replace(/"/g, '')
    return new Response(buf, {
      headers: {
        'Content-Type': tipoImagen(dev.comprobante_path || dev.comprobante_nombre),
        'Content-Disposition': `${dispo}; filename="${nombreSafe}"`,
        'Cache-Control': 'private, max-age=60',
      },
    })
  })
}

// POST /api/devoluciones/:id/comprobante — sube (o reemplaza) la imagen del
// comprobante de la transferencia. Multipart form-data con campo `comprobante`.
export async function POST(request, { params }) {
  return handle(async () => {
    const { id } = await params
    const form = await request.formData()
    const file = form.get('comprobante')
    const actor = { nombre: form.get('actor_nombre') || null, id: form.get('actor_id') || null }

    const db = getDb()
    const { data: dev } = await db.from('devoluciones')
      .select('id, estado, comprobante_path').eq('id', id).maybeSingle()
    if (!dev) throw new HttpError(404, 'Devolución no encontrada.')

    const anterior = dev.comprobante_path
    const comp = await subirComprobante(file, id)

    const { data, error } = await db.from('devoluciones')
      .update({ comprobante_path: comp.path, comprobante_nombre: comp.nombre })
      .eq('id', id).select('*').maybeSingle()
    if (error) {
      await db.storage.from(BUCKET).remove([comp.path]).catch(() => {})
      throw new HttpError(500, 'No se pudo guardar el comprobante: ' + error.message)
    }

    // Borrar la imagen anterior si se reemplazó (best-effort).
    if (anterior && anterior !== comp.path) {
      await db.storage.from(BUCKET).remove([anterior]).catch(() => {})
    }

    await registrarHistorial(id, dev.estado, dev.estado, 'Comprobante de transferencia adjuntado', actor)
    return Response.json({ ok: true, devolucion: data })
  })
}
