import { getDb, ok, bad, handle, bitacora, r2, HttpError } from '../../../_lib'

export const dynamic = 'force-dynamic'

// POST /api/contabilidad/asientos/:id/aprobar   { actor: email }
// Valida rol, monto máximo, imputabilidad y cuadre, pasa a 'aprobado'
// (la cola del robot) y deja rastro en la bitácora.
export async function POST(request, { params }) {
  return handle(async () => {
    const { id } = await params
    const db = getDb()
    const b = await request.json().catch(() => ({}))
    const actorEmail = (b.actor || '').trim()
    if (!actorEmail) return bad('No se pudo identificar al usuario.')

    // Rol autoritativo desde conta_aprobadores
    const { data: apro } = await db.from('conta_aprobadores')
      .select('*').eq('email', actorEmail).eq('activo', true).maybeSingle()
    if (!apro || !['aprobador', 'admin'].includes(apro.rol)) {
      return bad('No tenés permiso para aprobar asientos. Pedíselo a un admin.', 403)
    }

    const { data: a } = await db.from('conta_asientos').select('*').eq('id', id).maybeSingle()
    if (!a) throw new HttpError(404, 'Asiento no encontrado.')
    if (a.estado !== 'borrador') return bad(`El asiento ya está en estado "${a.estado}".`)

    const { data: lineas } = await db.from('conta_asiento_lineas').select('*').eq('asiento_id', id).order('orden')
    if (!lineas || lineas.length < 2) return bad('El asiento necesita al menos dos líneas.')

    // Todas las cuentas deben ser imputables, activas y permitidas en gastos
    const codigos = [...new Set(lineas.map((l) => l.cuenta).filter(Boolean))]
    const { data: cuentas } = await db.from('conta_cuentas').select('codigo,imputable,activa,permitida_en_gastos').in('codigo', codigos)
    const mapa = new Map((cuentas || []).map((c) => [c.codigo, c]))
    for (const l of lineas) {
      const c = mapa.get(l.cuenta)
      if (!c) return bad(`La cuenta ${l.cuenta || '(vacía)'} no existe en el catálogo.`)
      if (!c.imputable || !c.activa) return bad(`La cuenta ${l.cuenta} no es imputable: elegí una cuenta de detalle.`)
      if (!c.permitida_en_gastos) return bad(`La cuenta ${l.cuenta} no se puede usar en este módulo (es de ingreso, costo o patrimonio).`)
    }

    // Cuadre (defensa en el front; la base también lo valida)
    const totDebe = r2(lineas.reduce((s, l) => s + Number(l.debe), 0))
    const totHaber = r2(lineas.reduce((s, l) => s + Number(l.haber), 0))
    if (totDebe !== totHaber) return bad(`El asiento no cuadra: debe ₡${totDebe} vs haber ₡${totHaber}.`)
    if (totDebe === 0) return bad('El asiento está en cero.')

    // Monto máximo del aprobador
    if (apro.monto_maximo != null && totDebe > Number(apro.monto_maximo)) {
      return bad(`Este asiento (₡${totDebe.toLocaleString('es-CR')}) supera tu monto máximo (₡${Number(apro.monto_maximo).toLocaleString('es-CR')}). Necesita aprobación de alguien con más nivel.`, 403)
    }

    // Aprobar (el trigger vuelve a validar cuadre/lineas y setea aprobado_en)
    const { error } = await db.from('conta_asientos').update({
      estado: 'aprobado', aprobado_por: actorEmail,
    }).eq('id', id).eq('estado', 'borrador')
    if (error) {
      // Excepción del trigger de validación -> mensaje limpio
      return bad('No se pudo aprobar: ' + error.message)
    }

    // Aprendizaje: guardar cédula del emisor en el centro de costo usado
    try {
      if (a.clave_factura) {
        const { data: f } = await db.from('conta_facturas').select('cedula_emisor').eq('clave', a.clave_factura).maybeSingle()
        const centro = lineas.find((l) => l.centro_costo_id)?.centro_costo_id
        if (f?.cedula_emisor && centro) {
          await db.from('conta_centros_costo').update({ cedula: f.cedula_emisor }).eq('id', centro).is('cedula', null)
        }
      }
    } catch { /* aprendizaje best-effort */ }

    await bitacora(id, 'aprobado', actorEmail, {
      total_debe: totDebe, total_haber: totHaber,
      lineas: lineas.map((l) => ({ cuenta: l.cuenta, debe: l.debe, haber: l.haber, centro: l.centro_costo_id })),
    })

    // Disparar al robot de la M1: encolar una corrida del uploader (si no es
    // prueba y no hay ya una en curso). El daemon la levanta y registra en NEO.
    try {
      if (!a.es_prueba) {
        // Dedup solo contra 'pending' (no 'running'): si una corrida ya está en
        // curso y no incluyó este asiento, igual queremos encolar una nueva que
        // lo agarre al terminar la actual.
        const { data: prev } = await db.from('sync_requests')
          .select('id').eq('script', 'asientos_upload')
          .eq('status', 'pending').limit(1).maybeSingle()
        if (!prev) {
          await db.from('sync_requests').insert({ script: 'asientos_upload', status: 'pending' })
        }
      }
    } catch { /* encolar es best-effort; si falla, la corrida programada lo agarra */ }

    return ok({ ok: true, estado: 'aprobado' })
  })
}
