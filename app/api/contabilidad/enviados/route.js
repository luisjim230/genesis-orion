import { requirePermiso } from '../../../../lib/auth-server'
import { getDb, ok, bad, handle, esAdmin, bitacoraCatalogo } from '../_lib'

export const dynamic = 'force-dynamic'

const ENVIADOS = ['aprobado', 'enviando', 'sincronizado', 'conciliado', 'rechazado', 'error']

// GET /api/contabilidad/enviados?estado=&desde=&hasta=&proveedor=&incluir_prueba=
// Devuelve { rows, conciliacion_activa }. El diagnóstico/semáforo sale de la
// vista v_conta_conciliacion (no se calcula en el front).
export async function GET(request) {
  const _g = await requirePermiso('contabilidad'); if (_g.response) return _g.response;

  return handle(async () => {
    const db = getDb()
    const u = new URL(request.url)
    const estado = u.searchParams.get('estado')
    const desde = u.searchParams.get('desde')
    const hasta = u.searchParams.get('hasta')
    const proveedor = u.searchParams.get('proveedor')
    const incluirPrueba = u.searchParams.get('incluir_prueba') !== 'false'

    let q = db.from('conta_asientos')
      .select('*, factura:conta_facturas(nombre_emisor,cedula_emisor)')
      .order('actualizado_en', { ascending: false })
    if (estado && estado !== 'todos') q = q.eq('estado', estado)
    else q = q.in('estado', ENVIADOS)
    if (desde) q = q.gte('fecha', desde)
    if (hasta) q = q.lte('fecha', hasta)
    if (!incluirPrueba) q = q.eq('es_prueba', false)

    const [{ data: asientos, error }, { data: conc }, { count: neoCount }] = await Promise.all([
      q,
      db.from('v_conta_conciliacion').select('id,estado_neo,diagnostico,horas_desde_envio'),
      db.from('neo_asientos_estado').select('*', { count: 'exact', head: true }),
    ])
    if (error) throw error

    const cmap = new Map((conc || []).map((c) => [c.id, c]))
    let rows = (asientos || []).map((a) => {
      const c = cmap.get(a.id) || {}
      return {
        ...a,
        proveedor_nombre: a.factura?.nombre_emisor || null,
        estado_neo: c.estado_neo || null,
        diagnostico: c.diagnostico || null,
        horas_desde_envio: c.horas_desde_envio != null ? Number(c.horas_desde_envio) : null,
      }
    })
    if (proveedor) {
      const p = proveedor.toLowerCase()
      rows = rows.filter((r) => (r.proveedor_nombre || r.descripcion || '').toLowerCase().includes(p))
    }
    return ok({ rows, conciliacion_activa: (neoCount || 0) > 0 })
  })
}

// POST /api/contabilidad/enviados
//   { accion:'descartar_prueba', actor }        -> descarta todos los de prueba
//   { accion:'vaciar_descartados_90', actor }   -> borra descartados con +90 días
// Ambas solo admin.
export async function POST(request) {
  const _g = await requirePermiso('contabilidad'); if (_g.response) return _g.response;

  return handle(async () => {
    const db = getDb()
    const b = await request.json().catch(() => ({}))
    if (!(await esAdmin(b.actor))) return bad('Solo un admin puede hacer esta limpieza.', 403)

    if (b.accion === 'descartar_prueba') {
      const { data, error } = await db.from('conta_asientos')
        .update({ estado: 'descartado' })
        .eq('es_prueba', true).neq('estado', 'descartado').select('id')
      if (error) throw error
      await bitacoraCatalogo('descartar_prueba', b.actor, { cantidad: (data || []).length })
      return ok({ descartados: (data || []).length })
    }

    if (b.accion === 'vaciar_descartados_90') {
      const corte = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()
      const { data: viejos } = await db.from('conta_asientos')
        .select('id').eq('estado', 'descartado').lt('actualizado_en', corte)
      const ids = (viejos || []).map((x) => x.id)
      // Dejar rastro-resumen ANTES de borrar (la bitácora de esos asientos se
      // borra en cascada, así que este resumen es la respuesta que queda).
      await bitacoraCatalogo('vaciar_descartados_90', b.actor, { cantidad: ids.length, ids })
      if (ids.length) {
        const { error } = await db.from('conta_asientos').delete().in('id', ids)
        if (error) throw error
      }
      return ok({ eliminados: ids.length })
    }

    return bad('Acción no reconocida.')
  })
}
