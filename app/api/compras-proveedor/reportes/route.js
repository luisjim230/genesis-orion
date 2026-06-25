import { getDb, ok, handle } from '../_lib'

export const dynamic = 'force-dynamic'

// Día de hoy en zona America/Costa_Rica (yyyy-mm-dd).
function hoyCR() {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  return f.format(new Date())
}
function diasEntre(desde, hasta) {
  return Math.floor((Date.parse(hasta + 'T00:00:00Z') - Date.parse(desde + 'T00:00:00Z')) / 86400000)
}

// GET /api/compras-proveedor/reportes?proveedor_id=
// Devuelve saldo documental total, desglose por proveedor y aging.
export async function GET(request) {
  return handle(async () => {
    const url = new URL(request.url)
    const proveedorId = url.searchParams.get('proveedor_id')

    let q = getDb()
      .from('cp_pagos')
      .select('monto, fecha_pago, compra:cp_compras!inner(estado,proveedor_id,proveedor:cp_proveedores(nombre)), link:cp_factura_pago_link(id)')
      .neq('compra.estado', 'CERRADA')
    if (proveedorId) q = q.eq('compra.proveedor_id', proveedorId)
    const { data, error } = await q
    if (error) throw error

    const sinFactura = (data || []).filter(p => !p.link || p.link.length === 0)
    const hoy = hoyCR()

    let saldo_total = 0
    const porProv = {}
    const aging = { '0-15': 0, '16-30': 0, '31-60': 0, '+60': 0 }
    const agingCount = { '0-15': 0, '16-30': 0, '31-60': 0, '+60': 0 }

    for (const p of sinFactura) {
      const monto = Number(p.monto)
      saldo_total += monto
      const pid = p.compra?.proveedor_id
      const pnombre = p.compra?.proveedor?.nombre || '—'
      if (!porProv[pid]) porProv[pid] = { proveedor_id: pid, nombre: pnombre, saldo: 0, pagos: 0 }
      porProv[pid].saldo += monto
      porProv[pid].pagos += 1

      const d = diasEntre(p.fecha_pago, hoy)
      const bucket = d <= 15 ? '0-15' : d <= 30 ? '16-30' : d <= 60 ? '31-60' : '+60'
      aging[bucket] += monto
      agingCount[bucket] += 1
    }

    return ok({
      saldo_total,
      por_proveedor: Object.values(porProv).sort((a, b) => b.saldo - a.saldo),
      aging: Object.keys(aging).map(rango => ({ rango, monto: aging[rango], pagos: agingCount[rango] })),
      pagos_sin_factura: sinFactura.length,
    })
  })
}
