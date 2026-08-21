import { getDb, ok, bad, handle, subirArchivo, HttpError } from '../../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const TIPOS = {
  venta: 'venta_archivo_id',
  cotizacion: 'cotizacion_archivo_id',
}

// POST /api/compras-proveedor/compras/:id/documentos
// multipart: tipo=venta|cotizacion + file (PDF o foto).
// Sirve para adjuntar el respaldo después, o para reemplazarlo (el archivo
// viejo nunca se borra: queda en cp_archivos por trazabilidad).
export async function POST(request, { params }) {
  return handle(async () => {
    const { id } = await params
    const db = getDb()

    const { data: compra } = await db.from('cp_compras').select('id').eq('id', id).maybeSingle()
    if (!compra) throw new HttpError(404, 'Compra no encontrada.')

    const form = await request.formData()
    const tipo = (form.get('tipo') || '').toString()
    const columna = TIPOS[tipo]
    if (!columna) return bad('Tipo de documento inválido (venta | cotizacion).')

    const file = form.get('file')
    const uploadedBy = (form.get('uploaded_by') || '').toString().trim() || null
    const archivo = await subirArchivo(file, { uploadedBy, reusarSiExiste: true })

    const { data, error } = await db
      .from('cp_compras')
      .update({ [columna]: archivo.id, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error

    return ok({ compra: data, archivo })
  })
}
