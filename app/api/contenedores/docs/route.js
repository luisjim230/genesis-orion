import {
  getDb, ok, bad, handle, HttpError, BUCKET, MAX_BYTES,
  esPdf, esExcel, extensionValida, mimePorNombre, sha256, subirArchivo,
  leerDocumento, compararConEnvio,
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

// POST /api/contenedores/docs
//
// Dos formas de entrar:
//   a) JSON { envio_id?, archivos: [{ path, nombre, tamano }] } — el browser ya
//      subió el binario al bucket con una URL firmada. Es el camino normal: el
//      body de una función de Vercel tope en 4.5 MB y las proformas pesan más.
//   b) multipart files[] — para archivos chicos o llamadas desde scripts.
//
// En ambos casos el archivo queda guardado pase lo que pase; si la lectura con
// IA falla, el documento queda marcado y se reintenta con "Leer de nuevo".
// Nunca pisa lo que Luis cargó a mano: devuelve las diferencias para que decida.
export async function POST(request) {
  return handle(async () => {
    const db = getDb()
    const esJson = (request.headers.get('content-type') || '').includes('application/json')

    let envioId = null
    let entradas = []   // { nombre, buffer, storagePath? }

    if (esJson) {
      const body = await request.json().catch(() => ({}))
      envioId = (body.envio_id || '').toString().trim() || null
      const archivos = Array.isArray(body.archivos) ? body.archivos : []
      if (!archivos.length) return bad('No llegó ningún archivo.')
      entradas = archivos.map((a) => ({
        nombre: (a?.nombre || 'documento').toString(),
        storagePath: (a?.path || '').toString(),
      }))
    } else {
      const form = await request.formData()
      const files = form.getAll('files').filter((f) => f && typeof f.arrayBuffer === 'function')
      envioId = (form.get('envio_id') || '').toString().trim() || null
      if (!files.length) return bad('No llegó ningún archivo.')
      entradas = files.map((f) => ({ nombre: f.name || 'documento', file: f }))
    }

    let envio = null
    if (envioId) {
      const { data } = await db.from('neptuno_envios').select('*').eq('id', envioId).maybeSingle()
      if (!data) throw new HttpError(404, 'Ese envío ya no existe.')
      envio = data
    }

    const resultados = []
    for (const entrada of entradas) {
      const nombre = entrada.nombre
      let subidoAcá = null   // objeto a limpiar si el archivo termina descartado
      try {
        if (!extensionValida(nombre)) throw new HttpError(400, 'Formato no soportado (solo PDF, Excel o CSV).')

        // ── Traer el binario ──────────────────────────────────────────────
        let buffer, storagePath
        if (entrada.storagePath) {
          storagePath = entrada.storagePath
          subidoAcá = storagePath
          const { data: blob, error } = await db.storage.from(BUCKET).download(storagePath)
          if (error || !blob) throw new HttpError(400, 'El archivo no llegó completo al storage. Probá de nuevo.')
          buffer = Buffer.from(await blob.arrayBuffer())
        } else {
          const file = entrada.file
          if (!esPdf(file) && !esExcel(file)) throw new HttpError(400, 'Formato no soportado (solo PDF, Excel o CSV).')
          buffer = Buffer.from(await file.arrayBuffer())
          if (!buffer.length) throw new HttpError(400, 'El archivo está vacío.')
          if (buffer.length > MAX_BYTES) throw new HttpError(400, 'El archivo pasa los 25 MB.')
        }
        if (!buffer.length) throw new HttpError(400, 'El archivo está vacío.')

        // ── ¿Ya estaba? ───────────────────────────────────────────────────
        const hash = sha256(buffer)
        const { data: dup } = await db.from('neptuno_docs')
          .select('id, nombre, envio_id').eq('sha256', hash).maybeSingle()
        if (dup) {
          if (subidoAcá) await db.storage.from(BUCKET).remove([subidoAcá])
          resultados.push({
            archivo: nombre, estado: 'duplicado', doc_id: dup.id, envio_id: dup.envio_id,
            motivo: 'Este archivo ya estaba subido.',
          })
          continue
        }

        if (!storagePath) storagePath = await subirArchivo({ name: nombre }, buffer, hash)

        // ── Registrar el documento antes de leerlo: así no se pierde ──────
        const { data: doc, error: errDoc } = await db.from('neptuno_docs').insert({
          envio_id: envioId,
          nombre,
          mime_type: entrada.file?.type || mimePorNombre(nombre),
          tamano_bytes: buffer.length,
          storage_path: storagePath,
          sha256: hash,
          tipo_doc: 'otro',
          estado: 'pendiente',
        }).select('*').single()
        if (errDoc) throw new HttpError(500, errDoc.message)
        subidoAcá = null   // ya tiene dueño, no se limpia

        // ── Leerlo con IA (si falla, queda para reintentar) ───────────────
        const r = await leerDocumento(doc, { file: { name: nombre, type: doc.mime_type }, buffer })

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
        if (subidoAcá) await db.storage.from(BUCKET).remove([subidoAcá]).catch(() => {})
        resultados.push({
          archivo: nombre, estado: 'error',
          motivo: e instanceof HttpError ? e.message : String(e?.message || e),
        })
      }
    }

    return ok({ resultados })
  })
}
