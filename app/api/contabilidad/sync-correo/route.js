import { getDb, ok, handle } from '../_lib'

export const dynamic = 'force-dynamic'

const SCRIPT = 'gmail_facturas'

// GET /api/contabilidad/sync-correo
// Estado de la sincronización de facturas por correo: última corrida y si hay
// una en curso. Sirve para el botón "Sincronizar correo ahora".
export async function GET() {
  return handle(async () => {
    const db = getDb()
    const [sol, ult] = await Promise.all([
      db.from('sync_requests').select('id,status,requested_at,completed_at')
        .eq('script', SCRIPT).order('requested_at', { ascending: false }).limit(1).maybeSingle(),
      db.from('conta_facturas').select('creado_en').order('creado_en', { ascending: false }).limit(1).maybeSingle(),
    ])
    const enCurso = sol.data && ['pending', 'running'].includes(sol.data.status)
    return ok({
      solicitud: sol.data || null,
      en_curso: !!enCurso,
      ultima_factura: ult.data?.creado_en || null,
    })
  })
}

// POST /api/contabilidad/sync-correo  { actor }
// Encola una corrida del robot que lee el correo (gmail_facturas). El daemon de
// la M1 la corre serializada con el resto. No duplica si ya hay una en curso.
export async function POST(request) {
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
