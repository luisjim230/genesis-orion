import { getDb, handle, fmtMoneda } from '../../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// POST /api/devoluciones/alerts/daily
// Arma el resumen de devoluciones pendientes de pagar para mandar por Telegram.
// Lo consume el workflow telegram-devoluciones-daily.yml (mismo patrón que
// métricas-web). Devuelve { ok, message, hay_pendientes }.
export async function POST() {
  return handle(async () => {
    const db = getDb()
    const { data } = await db.from('devoluciones')
      .select('cliente_nombre, monto, moneda, metodo, creado_en, referencia_erp')
      .eq('estado', 'pendiente')
      .order('creado_en', { ascending: true })

    const pendientes = data || []
    const hoy = new Date()
    const dias = (d) => Math.floor((hoy - new Date(d)) / 86400000)

    if (pendientes.length === 0) {
      return Response.json({
        ok: true,
        hay_pendientes: false,
        message: '✅ <b>Devoluciones</b>\nNo hay devoluciones pendientes de pagar. Todo al día.',
      })
    }

    let totalCrc = 0, totalUsd = 0, atrasadas = 0
    const lineas = pendientes.map((d) => {
      const dd = dias(d.creado_en)
      if (dd >= 2) atrasadas++
      if (d.moneda === 'USD') totalUsd += Number(d.monto)
      else totalCrc += Number(d.monto)
      const alerta = dd >= 3 ? ' 🔴' : dd >= 2 ? ' 🟠' : ''
      const via = d.metodo === 'sinpe_movil' ? 'SINPE' : 'Transf.'
      return `• <b>${d.cliente_nombre}</b> — ${fmtMoneda(d.monto, d.moneda)} · ${via} · ${dd}d${alerta}`
    })

    const totales = []
    if (totalCrc > 0) totales.push(fmtMoneda(totalCrc, 'CRC'))
    if (totalUsd > 0) totales.push(fmtMoneda(totalUsd, 'USD'))

    const message = [
      `💸 <b>Devoluciones pendientes de pagar</b>`,
      `${pendientes.length} sin transferir${atrasadas ? ` · ${atrasadas} atrasada(s) 🔴` : ''}`,
      `Total: ${totales.join(' + ')}`,
      ``,
      ...lineas,
      ``,
      `👉 Confirmá cada pago en SOL → Devoluciones`,
    ].join('\n')

    return Response.json({ ok: true, hay_pendientes: true, message })
  })
}
