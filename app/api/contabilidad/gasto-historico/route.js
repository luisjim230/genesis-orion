import { getDb, ok, handle } from '../_lib'

export const dynamic = 'force-dynamic'

// GET /api/contabilidad/gasto-historico?cuentas=a,b,c&emisor=310...
// Devuelve, por cuenta contable, lo gastado este mes y el mes anterior
// (desde v_movimientos_contables_validos), más estadística del proveedor
// (promedio y desviación de sus facturas) para detectar montos inusuales.
export async function GET(request) {
  return handle(async () => {
    const db = getDb()
    const u = new URL(request.url)
    const cuentas = (u.searchParams.get('cuentas') || '').split(',').map((s) => s.trim()).filter(Boolean)
    const emisor = u.searchParams.get('emisor')

    const now = new Date()
    const y = now.getUTCFullYear(), m = now.getUTCMonth()
    const iniActual = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const iniAnterior = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10)

    const porCuenta = {}
    if (cuentas.length) {
      // La vista guarda 'fecha' como texto; comparamos por prefijo YYYY-MM.
      const mesActual = `${y}-${String(m + 1).padStart(2, '0')}`
      const dPrev = new Date(Date.UTC(y, m - 1, 1))
      const mesAnterior = `${dPrev.getUTCFullYear()}-${String(dPrev.getUTCMonth() + 1).padStart(2, '0')}`
      const { data } = await db
        .from('v_movimientos_contables_validos')
        .select('cuenta_contable,fecha,debe_contabilidad')
        .in('cuenta_contable', cuentas)
        .or(`fecha.ilike.${mesActual}%,fecha.ilike.${mesAnterior}%`)
      for (const c of cuentas) porCuenta[c] = { mes_actual: 0, mes_anterior: 0 }
      for (const r of data || []) {
        const f = String(r.fecha || '')
        const val = Number(r.debe_contabilidad) || 0
        if (f.startsWith(mesActual)) porCuenta[r.cuenta_contable].mes_actual += val
        else if (f.startsWith(mesAnterior)) porCuenta[r.cuenta_contable].mes_anterior += val
      }
    }

    // Estadística del proveedor a partir de sus facturas históricas
    let proveedor_stats = null
    if (emisor) {
      const { data } = await db.from('conta_facturas').select('total_comprobante').eq('cedula_emisor', emisor)
      const montos = (data || []).map((x) => Number(x.total_comprobante) || 0).filter((n) => n > 0)
      if (montos.length >= 2) {
        const prom = montos.reduce((s, n) => s + n, 0) / montos.length
        const varza = montos.reduce((s, n) => s + (n - prom) ** 2, 0) / montos.length
        proveedor_stats = { n: montos.length, promedio: prom, desviacion: Math.sqrt(varza) }
      }
    }

    return ok({ por_cuenta: porCuenta, proveedor_stats, ini_actual: iniActual, ini_anterior: iniAnterior })
  })
}
