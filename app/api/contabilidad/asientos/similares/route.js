import { getDb, ok, handle, r2 } from '../../_lib'

export const dynamic = 'force-dynamic'

// GET /api/contabilidad/asientos/similares?fecha=&total=&cuenta=&centro=&excluir=
// Busca asientos parecidos a uno que se está montando a mano. Compara contra la
// LÍNEA DE GASTO PRINCIPAL (el débito más grande) de cada asiento:
//   mismo monto total, fecha dentro de ±7 días (cualquier estado menos
//   'descartado') y, además:
//     - mismo centro de costo, tratando dos nulos como iguales (equivalente a
//       `centro IS NOT DISTINCT FROM centro`: en JS null===null ya es true), y
//     - cuando el asiento no tiene centro, también exige misma cuenta contable
//       de la línea de gasto principal, para no depender solo del centro vacío.
// Es solo un aviso (no bloquea): devuelve los candidatos.
export async function GET(request) {
  return handle(async () => {
    const db = getDb()
    const u = new URL(request.url)
    const fecha = u.searchParams.get('fecha')
    const total = r2(u.searchParams.get('total'))
    const cuentaNew = u.searchParams.get('cuenta') || null
    const centroNew = u.searchParams.get('centro') ? Number(u.searchParams.get('centro')) : null
    const excluir = u.searchParams.get('excluir')
    if (!fecha || !(total > 0)) return ok([])

    const desde = new Date(fecha); desde.setDate(desde.getDate() - 7)
    const hasta = new Date(fecha); hasta.setDate(hasta.getDate() + 7)

    let q = db.from('conta_asientos')
      .select('id, fecha, descripcion, estado, total_debe, moneda, lineas:conta_asiento_lineas(cuenta, centro_costo_id, debe)')
      .neq('estado', 'descartado')
      .gte('fecha', desde.toISOString().slice(0, 10))
      .lte('fecha', hasta.toISOString().slice(0, 10))
    if (excluir) q = q.neq('id', excluir)
    const { data, error } = await q
    if (error) throw error

    const matches = (data || []).filter((a) => {
      if (r2(a.total_debe) !== total) return false
      const p = lineaGastoPrincipal(a.lineas)
      const candCentro = p ? (p.centro_costo_id ?? null) : null
      const candCuenta = p ? (p.cuenta ?? null) : null
      const centroMatch = candCentro === centroNew          // null===null → true (IS NOT DISTINCT FROM)
      if (!centroMatch) return false
      // Con centro presente, el match de centro alcanza. Sin centro, exigir cuenta.
      if (centroNew === null && candCuenta !== cuentaNew) return false
      return true
    }).map((a) => ({ id: a.id, fecha: a.fecha, descripcion: a.descripcion, estado: a.estado, total_debe: a.total_debe, moneda: a.moneda }))

    return ok(matches)
  })
}

// La línea de gasto principal = el débito más grande del asiento.
function lineaGastoPrincipal(lineas) {
  let best = null
  for (const l of lineas || []) {
    const d = Number(l.debe) || 0
    if (d <= 0) continue
    if (!best || d > (Number(best.debe) || 0)) best = l
  }
  return best
}
