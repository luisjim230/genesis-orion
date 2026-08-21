import { getDb, ok, handle, HttpError, BUCKET, compararConEnvio, recalcularEstimado } from '../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// GET /api/contenedores/docs/:id → documento + comparativo contra su envío
export async function GET(_request, { params }) {
  return handle(async () => {
    const { id } = await params
    const db = getDb()
    const { data: doc } = await db.from('neptuno_docs').select('*').eq('id', id).maybeSingle()
    if (!doc) throw new HttpError(404, 'Documento no encontrado.')

    let envio = null
    if (doc.envio_id) {
      const { data } = await db.from('neptuno_envios').select('*').eq('id', doc.envio_id).maybeSingle()
      envio = data || null
    }
    const { data: items } = await db.from('neptuno_items')
      .select('*').eq('doc_id', doc.id).order('linea')

    return ok({
      doc,
      envio,
      items: items || [],
      diferencias: compararConEnvio(envio, doc.extraido),
    })
  })
}

// PATCH /api/contenedores/docs/:id  { envio_id }
// Asigna (o reasigna) el documento a un envío y arrastra su mercadería.
export async function PATCH(request, { params }) {
  return handle(async () => {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const envioId = (body.envio_id || '').toString().trim() || null
    const db = getDb()

    const { data: doc } = await db.from('neptuno_docs').select('*').eq('id', id).maybeSingle()
    if (!doc) throw new HttpError(404, 'Documento no encontrado.')

    let envio = null
    if (envioId) {
      const { data } = await db.from('neptuno_envios').select('*').eq('id', envioId).maybeSingle()
      if (!data) throw new HttpError(404, 'Ese envío ya no existe.')
      envio = data
    }

    const anterior = doc.envio_id
    await db.from('neptuno_docs').update({ envio_id: envioId, match_sugerido: null }).eq('id', doc.id)
    await db.from('neptuno_items').update({ envio_id: envioId }).eq('doc_id', doc.id)

    if (anterior && anterior !== envioId) await recalcularEstimado(anterior)
    if (envioId) await recalcularEstimado(envioId)

    return ok({
      doc: { ...doc, envio_id: envioId },
      diferencias: compararConEnvio(envio, doc.extraido),
    })
  })
}

// DELETE /api/contenedores/docs/:id
// Se lleva el archivo y las líneas que salieron de él, salvo las que Luis
// editó a mano (esas quedan como mercadería manual del envío).
export async function DELETE(_request, { params }) {
  return handle(async () => {
    const { id } = await params
    const db = getDb()
    const { data: doc } = await db.from('neptuno_docs').select('*').eq('id', id).maybeSingle()
    if (!doc) throw new HttpError(404, 'Documento no encontrado.')

    await db.from('neptuno_items').delete().eq('doc_id', doc.id).eq('editado', false)
    await db.from('neptuno_items').update({ doc_id: null, origen: 'manual' }).eq('doc_id', doc.id)
    await db.from('neptuno_docs').delete().eq('id', doc.id)
    if (doc.storage_path) await db.storage.from(BUCKET).remove([doc.storage_path])
    if (doc.envio_id) await recalcularEstimado(doc.envio_id)

    return ok({ borrado: true })
  })
}
