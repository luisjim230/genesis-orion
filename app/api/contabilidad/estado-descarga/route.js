import { requirePermiso } from '../../../../lib/auth-server'
import { getDb, ok, handle } from '../_lib'

export const dynamic = 'force-dynamic'

const SCRIPT = 'asientos_estado'

// GET /api/contabilidad/estado-descarga
// Devuelve cuándo se cargaron por última vez los estados de NEO y el estado de
// la última solicitud manual (si la hay).
export async function GET() {
  const _g = await requirePermiso('contabilidad'); if (_g.response) return _g.response;

  return handle(async () => {
    const db = getDb()
    const [ult, sol, cnt] = await Promise.all([
      db.from('neo_asientos_estado').select('fecha_carga').order('fecha_carga', { ascending: false }).limit(1).maybeSingle(),
      db.from('sync_requests').select('id,status,requested_at,completed_at').eq('script', SCRIPT).order('requested_at', { ascending: false }).limit(1).maybeSingle(),
      db.from('neo_asientos_estado').select('*', { count: 'exact', head: true }),
    ])
    const enCurso = sol.data && ['pending', 'running'].includes(sol.data.status)
    return ok({
      ultima_carga: ult.data?.fecha_carga || null,
      total_asientos: cnt.count || 0,
      solicitud: sol.data || null,
      en_curso: !!enCurso,
    })
  })
}

// POST /api/contabilidad/estado-descarga  { actor }
// Encola una descarga manual: el daemon de la M1 la corre serializada con el
// resto (sin chocar la sesión de NEO). No duplica si ya hay una en curso.
export async function POST(request) {
  const _g = await requirePermiso('contabilidad'); if (_g.response) return _g.response;

  return handle(async () => {
    const db = getDb()
    const b = await request.json().catch(() => ({}))

    const { data: prev } = await db.from('sync_requests')
      .select('id,status,requested_at').eq('script', SCRIPT)
      .in('status', ['pending', 'running']).order('requested_at', { ascending: false }).limit(1).maybeSingle()
    if (prev) return ok({ ok: true, ya_en_curso: true, solicitud: prev })

    const { data, error } = await db.from('sync_requests')
      .insert({ script: SCRIPT, status: 'pending' }).select('*').single()
    if (error) throw error
    return ok({ ok: true, solicitud: data, actor: b.actor || null })
  })
}
