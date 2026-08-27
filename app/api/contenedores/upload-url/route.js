import { requirePermiso } from '../../../../lib/auth-server'
import { getDb, ok, bad, handle, HttpError, BUCKET, MAX_BYTES, extensionValida, rutaStorage } from '../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// POST /api/contenedores/upload-url  { nombre, tamano }
// Devuelve una URL firmada para que el browser suba el archivo DIRECTO al
// bucket. Hace falta porque el body de una función de Vercel tope en 4.5 MB y
// las proformas con fotos adentro pesan bastante más.
export async function POST(request) {
  const _g = await requirePermiso('contenedores'); if (_g.response) return _g.response;

  return handle(async () => {
    const body = await request.json().catch(() => ({}))
    const nombre = (body.nombre || '').toString().trim()
    const tamano = Number(body.tamano) || 0

    if (!nombre) return bad('Falta el nombre del archivo.')
    if (!extensionValida(nombre)) return bad('Formato no soportado (solo PDF, Excel o CSV).')
    if (tamano > MAX_BYTES) return bad('El archivo pasa los 25 MB.')

    // Random propio: el sha256 recién se puede calcular con el archivo entero,
    // y eso pasa del lado del servidor cuando se procesa.
    const prefijo = Math.random().toString(36).slice(2, 12)
    const path = rutaStorage(nombre, prefijo)

    const { data, error } = await getDb().storage.from(BUCKET).createSignedUploadUrl(path)
    if (error) throw new HttpError(500, 'No se pudo preparar la subida: ' + error.message)

    return ok({ path: data.path, token: data.token })
  })
}
