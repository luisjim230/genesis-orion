import { requireUserOrMachine } from '../../../../../lib/auth-server'
import { getDb, handle } from '../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// GET /api/devoluciones/alerts/pendientes
// Resumen liviano (sin datos bancarios) de las devoluciones a clientes que
// siguen pendientes de pagar. Lo consumen el dashboard y el módulo de Tareas,
// que no pueden consultar la tabla directo (RLS la bloquea para el navegador).
// Devuelve { ok, count, total_crc, total_usd, atrasadas }.
export async function GET(request) {
  const _g = await requireUserOrMachine(request); if (_g.response) return _g.response;

  return handle(async () => {
    const db = getDb()
    const { data } = await db.from('devoluciones')
      .select('monto, moneda, creado_en')
      .eq('estado', 'pendiente')

    const pend = data || []
    const hoy = new Date()
    let total_crc = 0, total_usd = 0, atrasadas = 0
    for (const d of pend) {
      const dd = Math.floor((hoy - new Date(d.creado_en)) / 86400000)
      if (dd >= 2) atrasadas++
      if (d.moneda === 'USD') total_usd += Number(d.monto)
      else total_crc += Number(d.monto)
    }
    return Response.json({ ok: true, count: pend.length, total_crc, total_usd, atrasadas })
  })
}
