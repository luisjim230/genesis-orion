import {
  getDb, ok, bad, handle, HttpError, MAX_BYTES,
  esPdf, esExcel, sha256, subirArchivo, extraerDoc, armarItems,
  compararConEnvio, matchEnvios, recalcularEstimado,
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
// Sube cada archivo, lo lee con IA y guarda la lectura. NO pisa nada de lo que
// ya está cargado a mano: devuelve las diferencias para que Luis decida.
export async function POST(request) {
  return handle(async () => {
    const form = await request.formData()
    const files = form.getAll('files').filter((f) => f && typeof f.arrayBuffer === 'function')
    const envioId = (form.get('envio_id') || '').toString().trim() || null
    const creadoPor = (form.get('creado_por') || '').toString().trim() || null
    if (!files.length) return bad('No llegó ningún archivo.')

    const db = getDb()

    // Envío destino (si se subió desde adentro de un expediente).
    let envio = null
    if (envioId) {
      const { data } = await db.from('neptuno_envios').select('*').eq('id', envioId).maybeSingle()
      if (!data) throw new HttpError(404, 'Ese envío ya no existe.')
      envio = data
    }

    // Para el match automático solo interesan los envíos vivos.
    const { data: activos } = await db.from('neptuno_envios')
      .select('id, nombre, proveedor, eta, pi_num, adelanto_monto, final_monto')
      .eq('archivado', false)

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

        const extraido = await extraerDoc({ file, buffer })
        const storagePath = await subirArchivo(file, buffer, hash)

        // ¿A qué envío va? El que se pidió, o el mejor candidato por plata.
        const candidatos = envioId ? [] : matchEnvios(extraido, activos || [])
        const destino = envioId || null

        const { data: doc, error: errDoc } = await db.from('neptuno_docs').insert({
          envio_id: destino,
          nombre,
          mime_type: file.type || null,
          tamano_bytes: buffer.length,
          storage_path: storagePath,
          sha256: hash,
          tipo_doc: extraido?.tipo_doc || 'otro',
          estado: 'procesado',
          extraido,
          match_sugerido: candidatos.length ? { candidatos } : null,
          creado_por: creadoPor,
        }).select('*').single()
        if (errDoc) throw new HttpError(500, errDoc.message)

        const items = await armarItems(extraido)
        if (items.length) {
          await db.from('neptuno_items').insert(
            items.map((it) => ({ ...it, doc_id: doc.id, envio_id: destino }))
          )
        }
        if (destino) await recalcularEstimado(destino)

        resultados.push({
          archivo: nombre,
          estado: 'procesado',
          doc_id: doc.id,
          envio_id: destino,
          tipo_doc: doc.tipo_doc,
          proveedor: extraido?.proveedor || null,
          pi_num: extraido?.pi_num || null,
          total: extraido?.total_monto ?? null,
          resumen: extraido?.resumen || null,
          items: items.length,
          candidatos,
          diferencias: envio ? compararConEnvio(envio, extraido) : [],
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
