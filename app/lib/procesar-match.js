import { createClient } from '@supabase/supabase-js'

let _sb
function getDb() {
  if (!_sb) _sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  return _sb
}

function parseFecha(val) {
  if (!val) return null
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val
  const s = String(val).trim()
  if (!s) return null
  const num = Number(s)
  if (!isNaN(num) && num > 40000 && num < 60000)
    return new Date(Math.round((num - 25569) * 86400 * 1000))
  const dmyMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch
    return new Date(`${y}-${m}-${d}T00:00:00Z`)
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export async function ejecutarMatch() {
  // Cargar fechas de órdenes por separado (no depender de joins FK)
  const { data: todasOrdenes } = await getDb().from('ordenes_compra').select('id, fecha_orden')
  const fechaOrdenMap = {}
  for (const o of (todasOrdenes || [])) {
    if (o.id && o.fecha_orden) fechaOrdenMap[o.id] = o.fecha_orden
  }

  // 1. Revertir matchs inválidos
  const { data: itemsConFecha } = await getDb()
    .from('ordenes_compra_items')
    .select('id, fecha_recepcion, orden_id')
    .in('estado_item', ['parcial', 'completo'])

  let revertidos = 0
  if (itemsConFecha?.length) {
    const aRevertir = []
    for (const item of itemsConFecha) {
      if (!item.fecha_recepcion) continue
      const fechaOrdenRaw = fechaOrdenMap[item.orden_id]
      if (!fechaOrdenRaw) continue
      const fRecep = parseFecha(item.fecha_recepcion)
      const fOrden = parseFecha(fechaOrdenRaw)
      if (!fRecep || !fOrden) continue
      // Comparar solo a nivel de día para evitar falsos positivos por hora
      const fRecepDia = new Date(fRecep); fRecepDia.setUTCHours(0, 0, 0, 0)
      const fOrdenDia = new Date(fOrden); fOrdenDia.setUTCHours(0, 0, 0, 0)
      if (fRecepDia < fOrdenDia) {
        aRevertir.push({ id: item.id, cantidad_recibida: 0, estado_item: 'pendiente', fecha_recepcion: null })
        revertidos++
      }
    }
    if (aRevertir.length > 0)
      await getDb().from('ordenes_compra_items').upsert(aRevertir, { onConflict: 'id' })
  }

  // 2. Traer TODAS las compras históricas de NEO
  const PAGE_SIZE = 1000
  let todos = [], offset = 0
  while (true) {
    const { data } = await getDb().from('neo_items_comprados')
      .select('codigo_interno, cantidad_comprada, fecha')
      .range(offset, offset + PAGE_SIZE - 1)
    if (!data || data.length === 0) break
    todos = todos.concat(data)
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }
  if (todos.length === 0) return { ok: false, error: 'Sin datos en neo_items_comprados' }

  // 3. Ítems pendientes/parciales
  const { data: itemsPend } = await getDb()
    .from('ordenes_compra_items')
    .select('id, orden_id, codigo, cantidad_ordenada, cantidad_recibida, estado_item, creado_en')
    .in('estado_item', ['pendiente', 'parcial'])
    .order('creado_en', { ascending: false })

  const res = { ok: true, completados: 0, parciales: 0, sin_match: 0, ignorados_por_fecha: 0, revertidos }
  if (!itemsPend || itemsPend.length === 0) return res

  // 4. Agrupar compras por código
  const comprasPorCodigo = {}, comprasPorCodigoNorm = {}
  for (const c of todos) {
    const codExacto = String(c.codigo_interno || '').trim()
    if (!codExacto) continue
    const codNorm = codExacto.toUpperCase()
    const fechaCompra = parseFecha(c.fecha)
    if (!fechaCompra) continue
    const entrada = { cantidad: parseFloat(c.cantidad_comprada) || 0, fecha: fechaCompra }
    if (!comprasPorCodigo[codExacto]) comprasPorCodigo[codExacto] = []
    comprasPorCodigo[codExacto].push(entrada)
    if (!comprasPorCodigoNorm[codNorm]) comprasPorCodigoNorm[codNorm] = []
    comprasPorCodigoNorm[codNorm].push(entrada)
  }

  // 5. Agrupar OC items por código, ordenar por fecha (FIFO: más antiguo primero)
  const itemsPorCodigo = {}
  for (const item of itemsPend) {
    const cod = String(item.codigo || '').trim()
    if (!cod) continue
    if (!itemsPorCodigo[cod]) itemsPorCodigo[cod] = []
    itemsPorCodigo[cod].push(item)
  }
  for (const cod of Object.keys(itemsPorCodigo)) {
    itemsPorCodigo[cod].sort((a, b) => {
      const fA = parseFecha(fechaOrdenMap[a.orden_id])
      const fB = parseFecha(fechaOrdenMap[b.orden_id])
      if (!fA && !fB) return 0; if (!fA) return 1; if (!fB) return -1
      return fA - fB
    })
  }

  // 6. Match FIFO
  const actualizaciones = []
  for (const cod of Object.keys(itemsPorCodigo)) {
    const codNorm = cod.toUpperCase()
    const comprasBase = comprasPorCodigo[cod] || comprasPorCodigoNorm[codNorm]
    if (!comprasBase || comprasBase.length === 0) {
      res.sin_match += itemsPorCodigo[cod].length
      continue
    }
    const disponibles = [...comprasBase].sort((a, b) => a.fecha - b.fecha).map(c => ({ ...c, restante: c.cantidad }))
    for (const item of itemsPorCodigo[cod]) {
      const fechaOrden = parseFecha(fechaOrdenMap[item.orden_id])
      if (!fechaOrden) { res.ignorados_por_fecha++; continue }
      const fechaOrdenDia = new Date(fechaOrden); fechaOrdenDia.setUTCHours(0, 0, 0, 0)
      const cantOrdenada = parseFloat(item.cantidad_ordenada) || 0
      let cantRecibida = 0, fechaRecep = null
      for (const disp of disponibles) {
        if (disp.fecha < fechaOrdenDia) continue
        if (disp.restante <= 0) continue
        if (cantRecibida >= cantOrdenada) break
        const consumir = Math.min(disp.restante, cantOrdenada - cantRecibida)
        cantRecibida += consumir; disp.restante -= consumir
        if (!fechaRecep || disp.fecha > fechaRecep) fechaRecep = disp.fecha
      }
      if (cantRecibida === 0) { res.sin_match++; continue }
      const nuevoEstado = cantRecibida >= cantOrdenada ? 'completo' : 'parcial'
      res[nuevoEstado === 'completo' ? 'completados' : 'parciales']++
      actualizaciones.push({ id: item.id, cantidad_recibida: cantRecibida, estado_item: nuevoEstado, fecha_recepcion: fechaRecep ? fechaRecep.toISOString() : null })
    }
  }

  const BATCH = 500
  for (let i = 0; i < actualizaciones.length; i += BATCH)
    await getDb().from('ordenes_compra_items').upsert(actualizaciones.slice(i, i + BATCH), { onConflict: 'id' })

  return res
}
