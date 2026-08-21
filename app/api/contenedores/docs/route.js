import {
  getDb, ok, bad, handle, HttpError, MAX_BYTES,
  esPdf, esExcel, sha256, subirArchivo, leerDocumento, compararConEnvio,
} from '../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

// GET /api/contenedores/docs?envio_id=...   (o ?sin_asignar=1)
export async function GET(request) {
  return handle(async () => {
    const sp = new URL(request.url).searchParams
    const db = getDb()
    let q = db.from('neptuno_docs')
      .select('id, envio_id, nombre, mime_type, tamano_bytes, tipo_doc, estado, error, extraido, match_sugerido, created_at')
      .order('created_at', { ascending: false })
    if (sp.get('envio_id')) q = q.eq('envio_id', sp.get('envio_id'))
    else if (sp.get('sin_asignar') === '1') q = q.is('envio_id', null)
    const { data, error } = await q
    if (error) throw new HttpError(500, error.message)
    return ok({ docs: data || [] })
  })
}

// POST /api/contenedores/docs  (multipart: files[], envio_id?, creado_por?)
// El archivo se guarda SIEMPRE. Después se intenta leer: si la lectura falla,
// el documento queda marcado y se puede reintentar sin volver a subirlo.
// Nunca pisa lo que Luis cargó a mano: devuelve las diferencias para que decida.
export async function POST(request) {
  return handle(async () => {
    const form = await request.formData()
    const files = form.getAll('files').filter((f) => f && typeof f.arrayBuffer === 'function')
    const envioId = (form.get('envio_id') || '').toString().trim() || null
    const creadoPor = (form.get('creado_por') || '').toString().trim() || null
    if (!files.length) return bad('No llegó ningún archivo.')

    const db = getDb()

    let envio = null
    if (envioId) {
      const { data } = await db.from('neptuno_envios').select('*').eq('id', envioId).maybeSingle()
      if (!data) throw new HttpError(404, 'Ese envío ya no existe.')
      envio = data
    }

    const resultados = []
    for (const file of files) {
      const nombre = file.name || 'documento'
      try {
        if (!esPdf(file) && !esExcel(file)) {
          throw new HttpError(400, 'Formato no soportado (solo PDF, Excel o CSV).')
        }
        const buffer = Buffer.from(await file.arrayBuffer())
        if (!buffer.length) throw new HttpError(400, 'El archivo está vacío.')
        if (buffer.length > MAX_BYTES) throw new HttpError(400, 'El archivo pasa los 20 MB.')

        const hash = sha256(buffer)
        const { data: dup } = await db.from('neptuno_docs')
          .select('id, nombre, envio_id').eq('sha256', hash).maybeSingle()
        if (dup) {
          resultados.push({
            archivo: nombre, estado: 'duplicado', doc_id: dup.id, envio_id: dup.envio_id,
            motivo: 'Este archivo ya estaba subido.',
          })
          continue
        }

        // 1) Guardar el archivo antes que nada: pase lo que pase, no se pierde.
        const storagePath = await subirArchivo(file, buffer, hash)
        const { data: doc, error: errDoc } = await db.from('neptuno_docs').insert({
          envio_id: envioId,
          nombre,
          mime_type: file.type || null,
          tamano_bytes: buffer.length,
          storage_path: storagePath,
          sha256: hash,
          tipo_doc: 'otro',
          estado: 'pendiente',
          creado_por: creadoPor,
        }).select('*').single()
        if (errDoc) throw new HttpError(500, errDoc.message)

        // 2) Leerlo con IA (si falla, queda para reintentar).
        const r = await leerDocumento(doc, { file, buffer })

        resultados.push({
          archivo: nombre,
          estado: r.extraido ? 'procesado' : 'sin_leer',
          motivo: r.error || null,
          doc_id: doc.id,
          envio_id: envioId,
          tipo_doc: r.doc.tipo_doc,
          proveedor: r.extraido?.proveedor || null,
          pi_num: r.extraido?.pi_num || null,
          total: r.extraido?.total_monto ?? null,
          resumen: r.extraido?.resumen || null,
          items: r.items.length,
          candidatos: r.candidatos,
          diferencias: envio && r.extraido ? compararConEnvio(envio, r.extraido) : [],
        })
      } catch (e) {
        resultados.push({
          archivo: nombre, estado: 'error',
          motivo: e instanceof HttpError ? e.message : String(e?.message || e),
        })
      }
    }

    return ok({ resultados })
  })
}
