import { getDb, ok, bad, handle, bitacora, sanearLineas, aprobadorDe, HttpError } from '../../_lib'

export const dynamic = 'force-dynamic'

// Encola una corrida del robot uploader en la M1 (si no hay una pendiente ya).
// Se llama cada vez que un asiento pasa a 'aprobado' (aprobar, reintentar,
// reenviar), para que el daemon lo levante y lo registre en NEO.
async function encolarUpload(db) {
  try {
    const { data: prev } = await db.from('sync_requests')
      .select('id').eq('script', 'asientos_upload').eq('status', 'pending').limit(1).maybeSingle()
    if (!prev) await db.from('sync_requests').insert({ script: 'asientos_upload', status: 'pending' })
  } catch { /* best-effort */ }
}

// GET /api/contabilidad/asientos/:id  -> asiento + líneas + factura
export async function GET(_request, { params }) {
  return handle(async () => {
    const { id } = await params
    const db = getDb()
    const { data: a, error } = await db.from('conta_asientos')
      .select('*, factura:conta_facturas(*)').eq('id', id).maybeSingle()
    if (error) throw error
    if (!a) throw new HttpError(404, 'Asiento no encontrado.')
    const { data: lineas } = await db.from('conta_asiento_lineas')
      .select('*').eq('asiento_id', id).order('orden')

    // Si es nota de crédito, resolver el documento original que rebaja: la
    // factura registrada (si la tenemos) y el asiento activo que la contabilizó.
    let referencia = null
    if (a.clave_referencia) {
      const [{ data: fo }, { data: ao }] = await Promise.all([
        db.from('conta_facturas')
          .select('clave,consecutivo,nombre_emisor,fecha_emision,total_comprobante,moneda')
          .eq('clave', a.clave_referencia).maybeSingle(),
        db.from('conta_asientos')
          .select('id,estado,asiento_neo,total_debe')
          .eq('clave_factura', a.clave_referencia).neq('estado', 'descartado').maybeSingle(),
      ])
      referencia = {
        clave: a.clave_referencia,
        razon: a.factura?.referencia_razon || null,
        factura: fo || null,
        asiento: ao || null,
      }
    }
    return ok({ ...a, lineas: lineas || [], referencia })
  })
}

// PATCH /api/contabilidad/asientos/:id
//   { accion: 'descartar' }               -> estado = descartado
//   { accion: 'reintentar' }              -> error -> aprobado, intentos+1
//   (sin accion)                          -> edita cabecera + reemplaza líneas
export async function PATCH(request, { params }) {
  return handle(async () => {
    const { id } = await params
    const db = getDb()
    const b = await request.json().catch(() => ({}))
    const actor = b.actor || 'sistema'

    const { data: a } = await db.from('conta_asientos').select('*').eq('id', id).maybeSingle()
    if (!a) throw new HttpError(404, 'Asiento no encontrado.')

    if (b.accion === 'descartar') {
      const motivo = (b.motivo || '').toString().trim() || 'Sin motivo'
      const { error } = await db.from('conta_asientos').update({ estado: 'descartado', detalle_error: motivo }).eq('id', id)
      if (error) throw error
      // Liberar la factura para poder reprocesar el mismo XML
      if (a.clave_factura) {
        await db.from('conta_facturas').update({ procesada: false }).eq('clave', a.clave_factura)
      }
      await bitacora(id, 'descartado', actor, { estado_anterior: a.estado, motivo })
      return ok({ ok: true })
    }

    if (b.accion === 'recuperar') {
      if (a.estado !== 'descartado') return bad('Solo se puede recuperar un asiento descartado.')
      const apro = await aprobadorDe(actor)
      if (!apro || !['aprobador', 'admin'].includes(apro.rol)) return bad('Solo aprobador o admin pueden recuperar.', 403)
      const { error } = await db.from('conta_asientos').update({ estado: 'borrador', detalle_error: null }).eq('id', id)
      if (error) throw error
      if (a.clave_factura) {
        await db.from('conta_facturas').update({ procesada: true }).eq('clave', a.clave_factura)
      }
      await bitacora(id, 'recuperado', actor, {})
      return ok({ ok: true })
    }

    if (b.accion === 'reintentar') {
      if (a.estado !== 'error') return bad('Solo se puede reintentar un asiento en error.')
      const { error } = await db.from('conta_asientos').update({
        estado: 'aprobado', intentos: (a.intentos || 0) + 1, detalle_error: null, procesando: false,
      }).eq('id', id)
      if (error) throw error
      await bitacora(id, 'reintentar', actor, { intentos: (a.intentos || 0) + 1 })
      await encolarUpload(db)
      return ok({ ok: true })
    }

    // Reenviar a NEO: para un asiento que YA se mandó (sincronizado/conciliado)
    // pero se anuló en NEO y hay que volver a registrarlo. Lo devuelve a la cola
    // del robot (estado=aprobado) y limpia el número de NEO viejo.
    // IMPORTANTE: primero hay que ANULAR el asiento en NEO, si no se duplica.
    if (b.accion === 'reenviar') {
      const reenviables = ['sincronizado', 'conciliado', 'error', 'enviando']
      if (!reenviables.includes(a.estado)) {
        return bad('Solo se puede reenviar un asiento que ya se envió a NEO (o quedó en error).')
      }
      const { error } = await db.from('conta_asientos').update({
        estado: 'aprobado', asiento_neo: null, enviado_en: null,
        detalle_error: null, procesando: false, intentos: (a.intentos || 0) + 1,
      }).eq('id', id)
      if (error) throw error
      await bitacora(id, 'reenviar', actor, { estado_anterior: a.estado, asiento_neo_anterior: a.asiento_neo })
      await encolarUpload(db)
      return ok({ ok: true })
    }

    // Edición normal: solo permitido en borrador
    if (a.estado !== 'borrador') return bad('Solo se pueden editar asientos en borrador.')

    const upd = {}
    if (b.fecha) upd.fecha = b.fecha
    if (typeof b.descripcion === 'string') upd.descripcion = b.descripcion.trim()
    if (typeof b.deducible === 'boolean') upd.deducible = b.deducible
    if (b.moneda) upd.moneda = b.moneda
    if ('tipo_cambio' in b) upd.tipo_cambio = b.tipo_cambio || null
    if (Object.keys(upd).length) {
      const { error } = await db.from('conta_asientos').update(upd).eq('id', id)
      if (error) throw error
    }

    // Reemplazo de líneas (si vienen). El trigger recalcula totales.
    if (Array.isArray(b.lineas)) {
      const filas = sanearLineas(b.lineas, Number(id)) // valida antes de borrar
      await db.from('conta_asiento_lineas').delete().eq('asiento_id', id)
      if (filas.length) {
        const { error } = await db.from('conta_asiento_lineas').insert(filas)
        if (error) throw error
      }
    }

    const { data: fresh } = await db.from('conta_asientos')
      .select('*, lineas:conta_asiento_lineas(*)').eq('id', id).maybeSingle()
    return ok(fresh)
  })
}
