import { getDb, ok, handle, r2 } from '../../_lib'

export const dynamic = 'force-dynamic'

// GET /api/contabilidad/asientos/similares?fecha=YYYY-MM-DD&total=123.45&centros=1,2&excluir=ID
// Busca asientos parecidos a uno que se está montando a mano: mismo centro de
// costo, mismo monto total y fecha dentro de ±7 días, en cualquier estado menos
// 'descartado'. Es solo un aviso (no bloquea): devuelve los candidatos.
export async function GET(request) {
  return handle(async () => {
    const db = getDb()
    const u = new URL(request.url)
    const fecha = u.searchParams.get('fecha')
    const total = r2(u.searchParams.get('total'))
    const centros = new Set((u.searchParams.get('centros') || '').split(',').map((s) => Number(s)).filter(Boolean))
    const excluir = u.searchParams.get('excluir')
    if (!fecha || !(total > 0)) return ok([])

    const desde = new Date(fecha); desde.setDate(desde.getDate() - 7)
    const hasta = new Date(fecha); hasta.setDate(hasta.getDate() + 7)

    let q = db.from('conta_asientos')
      .select('id, fecha, descripcion, estado, total_debe, moneda, lineas:conta_asiento_lineas(centro_costo_id)')
      .neq('estado', 'descartado')
      .gte('fecha', desde.toISOString().slice(0, 10))
      .lte('fecha', hasta.toISOString().slice(0, 10))
    if (excluir) q = q.neq('id', excluir)
    const { data, error } = await q
    if (error) throw error

    const matches = (data || []).filter((a) => {
      if (r2(a.total_debe) !== total) return false
      // Si el nuevo asiento tiene centros, exigir que compartan al menos uno.
      if (centros.size) {
        const suyos = new Set((a.lineas || []).map((l) => l.centro_costo_id).filter(Boolean))
        if (![...centros].some((c) => suyos.has(c))) return false
      }
      return true
    }).map((a) => ({ id: a.id, fecha: a.fecha, descripcion: a.descripcion, estado: a.estado, total_debe: a.total_debe, moneda: a.moneda }))

    return ok(matches)
  })
}
