import { requireUserOrMachine } from '../../../../../lib/auth-server'
import { getDb, ok, handle, docsDeCompra } from '../../_lib'

export const dynamic = 'force-dynamic'

// Día de hoy en zona America/Costa_Rica (yyyy-mm-dd).
function hoyCR() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}
function dias(desde, hasta) {
  return Math.floor((Date.parse(hasta + 'T00:00:00Z') - Date.parse(String(desde).slice(0, 10) + 'T00:00:00Z')) / 86400000)
}

// GET /api/compras-proveedor/alerts/pendientes
// Resumen liviano para el dashboard (RLS bloquea las tablas cp_ al navegador).
// Devuelve:
//   solicitudes / monto_solicitudes  -> compras pedidas que nadie pagó todavía
//   sin_factura / monto_sin_factura  -> ya se pagó y falta la factura del proveedor
//   docs_faltantes                   -> compras a las que les falta algún respaldo
export async function GET() {
  const _g = await requireUserOrMachine(undefined); if (_g.response) return _g.response;

  return handle(async () => {
    const db = getDb()
    const { data } = await db
      .from('cp_compras')
      .select(
        'id, estado, descripcion, monto_cotizado, created_at, venta_archivo_id, cotizacion_archivo_id, ' +
        'proveedor:cp_proveedores(id,nombre,dias_alerta_pago_sin_factura), ' +
        'pagos:cp_pagos(id,monto,fecha_pago,comprobante_archivo_id,link:cp_factura_pago_link(id))'
      )
      .neq('estado', 'CERRADA')

    const hoy = hoyCR()
    let solicitudes = 0, monto_solicitudes = 0
    let sin_factura = 0, monto_sin_factura = 0
    let docs_faltantes = 0, vencidas = 0, mas_vieja = 0

    for (const c of data || []) {
      const pagos = c.pagos || []
      const d = docsDeCompra(c, pagos)
      if (d.faltantes.length) docs_faltantes++

      if (d.falta_pago) {
        solicitudes++
        monto_solicitudes += Number(c.monto_cotizado || 0)
      }
      if (d.falta_factura) {
        sin_factura++
        monto_sin_factura += d.monto_sin_factura
        const limite = c.proveedor?.dias_alerta_pago_sin_factura ?? 8
        const antiguedad = Math.max(
          0,
          ...pagos.filter(p => !p.link || p.link.length === 0).map(p => dias(p.fecha_pago, hoy))
        )
        if (antiguedad > limite) vencidas++
        if (antiguedad > mas_vieja) mas_vieja = antiguedad
      }
    }

    return ok({
      ok: true,
      solicitudes,
      monto_solicitudes,
      sin_factura,
      monto_sin_factura,
      docs_faltantes,
      vencidas,
      dias_mas_viejo: mas_vieja,
      total: solicitudes + sin_factura,
    })
  })
}
