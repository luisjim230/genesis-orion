import { getDb, handle, BUCKET, HttpError } from '../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// GET /api/compras-proveedor/archivos/:id
// Streamea el PDF desde el bucket privado con el Content-Type correcto.
// ?download=1 fuerza descarga; por defecto se muestra inline.
export async function GET(request, { params }) {
  return handle(async () => {
    const { id } = await params
    const db = getDb()
    const { data: archivo } = await db
      .from('cp_archivos')
      .select('nombre, mime_type, storage_path')
      .eq('id', id)
      .maybeSingle()
    if (!archivo) throw new HttpError(404, 'Archivo no encontrado.')

    const { data: blob, error } = await db.storage.from(BUCKET).download(archivo.storage_path)
    if (error || !blob) throw new HttpError(404, 'No se pudo leer el archivo del storage.')

    const buf = Buffer.from(await blob.arrayBuffer())
    const download = new URL(request.url).searchParams.get('download') === '1'
    const dispo = download ? 'attachment' : 'inline'
    const nombreSafe = (archivo.nombre || 'documento.pdf').replace(/"/g, '')
    return new Response(buf, {
      headers: {
        'Content-Type': archivo.mime_type || 'application/pdf',
        'Content-Disposition': `${dispo}; filename="${nombreSafe}"`,
        'Cache-Control': 'private, max-age=60',
      },
    })
  })
}
