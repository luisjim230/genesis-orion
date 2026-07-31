import { getDb, handle, HttpError, validarDevolucion, subirRecibo, registrarHistorial } from '../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// PATCH /api/devoluciones/:id — editar / reenviar (contador). Multipart.
// Solo permitido si el estado es 'pendiente' o 'rechazada'. Si venía rechazada,
// al guardar vuelve a 'pendiente'. El PDF anterior se conserva (auditoría); si
// se adjunta uno nuevo, se sube y se apunta el registro al nuevo.
export async function PATCH(request, { params }) {
  return handle(async () => {
    const { id } = await params
    const db = getDb()

    const { data: actual } = await db.from('devoluciones').select('*').eq('id', id).maybeSingle()
    if (!actual) throw new HttpError(404, 'Devolución no encontrada.')
    if (!['pendiente', 'rechazada'].includes(actual.estado)) {
      throw new HttpError(409, 'Solo se puede editar una devolución pendiente o rechazada.')
    }

    const form = await request.formData()
    const actor = { nombre: form.get('actor_nombre') || null, id: form.get('actor_id') || null }

    const datos = validarDevolucion({
      cliente_nombre: form.get('cliente_nombre'),
      cliente_identificacion: form.get('cliente_identificacion'),
      titular_cuenta: form.get('titular_cuenta'),
      motivo: form.get('motivo'),
      monto: form.get('monto'),
      moneda: form.get('moneda'),
      metodo: form.get('metodo'),
      sinpe_numero: form.get('sinpe_numero'),
      iban: form.get('iban'),
      banco: form.get('banco'),
      referencia_erp: form.get('referencia_erp'),
      nota_credito: form.get('nota_credito'),
      notas: form.get('notas'),
    })

    const patch = { ...datos }
    const file = form.get('recibo')
    if (file && typeof file.arrayBuffer === 'function' && file.size > 0) {
      const recibo = await subirRecibo(file, id)
      patch.recibo_path = recibo.path
      patch.recibo_nombre = recibo.nombre
    }

    const reenviada = actual.estado === 'rechazada'
    if (reenviada) {
      patch.estado = 'pendiente'
      patch.motivo_rechazo = null
    }

    // Update condicional: protege contra que el gerente la procese en el medio.
    const { data, error } = await db.from('devoluciones')
      .update(patch)
      .eq('id', id)
      .in('estado', ['pendiente', 'rechazada'])
      .select('*').single()
    if (error) throw new HttpError(500, error.message)

    if (reenviada) {
      await registrarHistorial(id, 'rechazada', 'pendiente', 'Corregida y reenviada', actor)
    } else {
      await registrarHistorial(id, 'pendiente', 'pendiente', 'Editada', actor)
    }
    return Response.json({ ok: true, devolucion: data })
  })
}
