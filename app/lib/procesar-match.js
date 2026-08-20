import { createClient } from '@supabase/supabase-js'
import { DIAS_LIMITE_OC } from '../../lib/transito.js'

let _sb
function getDb() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL)
    throw new Error('CONFIG: falta NEXT_PUBLIC_SUPABASE_URL en env vars de Vercel')
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error('CONFIG: falta SUPABASE_SERVICE_ROLE_KEY en env vars de Vercel — sin esta var los upserts fallan en silencio por RLS')
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

// Trae TODAS las filas de una tabla paginando de a 1000 (el límite por defecto
// de PostgREST/Supabase). Sin esto, cualquier tabla con >1000 filas se trunca en
// silencio. Fue exactamente el bug de "compras que no se actualizan": con >1000
// órdenes, las más nuevas quedaban fuera de fechaOrdenMap, sus ítems perdían la
// fecha_orden, caían en `ignorados_por_fecha` y nunca se marcaban como recibidos,
// quedando "en tránsito" para siempre aunque la compra ya estuviera cargada.
async function traerTodo(tabla, columnas, filtro) {
  const PAGE = 1000
  let filas = [], offset = 0
  while (true) {
    let q = getDb().from(tabla).select(columnas)
    if (filtro) q = filtro(q)
    // Orden estable por id para que la paginación no repita ni saltee filas.
    q = q.order('id', { ascending: true }).range(offset, offset + PAGE - 1)
    const { data, error } = await q
    if (error) throw new Error(`traerTodo(${tabla}) falló: ${error.message}`)
    if (!data || data.length === 0) break
    filas = filas.concat(data)
    if (data.length < PAGE) break
    offset += PAGE
  }
  return filas
}

// Da por perdida toda OC pendiente/parcial con más de DIAS_LIMITE_OC días: el
// ítem pasa a 'cancelado', sale de Trazabilidad, deja de contar como tránsito y
// el producto vuelve a quedar libre para pedir. La orden queda en el historial.
//
// Corre con la service key desde el servidor (no depende de que alguien abra la
// pantalla de Trazabilidad) y se dispara en cada corrida del match, o sea en
// cada carga de Inventario, Sugerencias y Trazabilidad.
export async function autoCancelarVencidas(fechaOrdenMap) {
  let mapa = fechaOrdenMap
  if (!mapa) {
    mapa = {}
    const ordenes = await traerTodo('ordenes_compra', 'id, fecha_orden')
    for (const o of (ordenes || [])) if (o.id && o.fecha_orden) mapa[o.id] = o.fecha_orden
  }

  const abiertos = await traerTodo(
    'ordenes_compra_items',
    'id, orden_id, codigo, cantidad_ordenada, cantidad_recibida',
    q => q.in('estado_item', ['pendiente', 'parcial']),
  )

  const ahora = Date.now()
  const vencidos = []
  for (const item of (abiertos || [])) {
    const fechaOrden = parseFecha(mapa[item.orden_id])
    if (!fechaOrden) continue
    const dias = Math.floor((ahora - fechaOrden.getTime()) / 86400000)
    if (dias >= DIAS_LIMITE_OC) vencidos.push(item)
  }
  if (!vencidos.length) return { cancelados: 0, unidades: 0 }

  const ids = vencidos.map(v => v.id)
  for (let i = 0; i < ids.length; i += 100) {
    const { error } = await getDb()
      .from('ordenes_compra_items')
      .update({ estado_item: 'cancelado' })
      .in('id', ids.slice(i, i + 100))
    if (error) throw new Error(`autoCancelarVencidas falló: ${error.message}`)
  }

  const unidades = vencidos.reduce(
    (s, v) => s + Math.max((parseFloat(v.cantidad_ordenada) || 0) - (parseFloat(v.cantidad_recibida) || 0), 0),
    0,
  )
  return { cancelados: vencidos.length, unidades }
}

export async function ejecutarMatch() {
  // Cargar fechas de órdenes por separado (no depender de joins FK).
  // Paginado: hay >1000 órdenes y sin esto las más nuevas se perdían.
  const todasOrdenes = await traerTodo('ordenes_compra', 'id, fecha_orden')
  const fechaOrdenMap = {}
  for (const o of (todasOrdenes || [])) {
    if (o.id && o.fecha_orden) fechaOrdenMap[o.id] = o.fecha_orden
  }

  // 1. Revertir matchs inválidos (paginado: hay >1000 ítems completos/parciales)
  const itemsConFecha = await traerTodo(
    'ordenes_compra_items',
    'id, fecha_recepcion, orden_id',
    q => q.in('estado_item', ['parcial', 'completo']),
  )

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
      // Revertir si la "recepción" de NEO es anterior al timestamp real de la OC
      // (típicamente la entrada de NEO del mismo día está a las 00:00 — antes de
      // la OC que se hizo más tarde — y NO es una recepción real, es el upload).
      if (fRecep < fOrden) {
        aRevertir.push({ id: item.id, cantidad_recibida: 0, estado_item: 'pendiente', fecha_recepcion: null })
        revertidos++
      }
    }
    if (aRevertir.length > 0)
      await getDb().from('ordenes_compra_items').upsert(aRevertir, { onConflict: 'id' })
  }

  // 1b. Dar por perdidas las OC de más de DIAS_LIMITE_OC días. Va después del
  // revert para que un ítem que acaba de volver a 'pendiente' y ya es viejo se
  // cancele en la misma corrida.
  const autoCancel = await autoCancelarVencidas(fechaOrdenMap)

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
  if (todos.length === 0) return { ok: false, error: 'Sin datos en neo_items_comprados', auto_cancelados: autoCancel.cancelados, auto_cancelados_unidades: autoCancel.unidades }

  // 3. Ítems pendientes/parciales (paginado por si algún día superan las 1000)
  const itemsPend = await traerTodo(
    'ordenes_compra_items',
    'id, orden_id, codigo, cantidad_ordenada, cantidad_recibida, estado_item, creado_en',
    q => q.in('estado_item', ['pendiente', 'parcial']),
  )

  // 3b. Ítems que YA tienen mercadería acreditada. Sin esto, cada corrida
  // volvía a "gastar" las mismas compras de NEO: la compra de 30 unidades del
  // 04/08 se le acreditaba primero a una OC, y en la corrida siguiente —como
  // esa OC ya no estaba en la lista de pendientes— las mismas 30 unidades se
  // le acreditaban a la OC siguiente. Resultado: órdenes marcadas "completo"
  // sin que llegara nada, que desaparecían de tránsito y se volvían a pedir.
  // Se reservan 'completo' y 'cancelado' (este último puede traer recepción
  // parcial real). Los 'parcial' NO: siguen en la lista de pendientes y vuelven
  // a matchear su propia mercadería en esta misma corrida — reservarla acá los
  // dejaría trabados sin poder completarse nunca.
  const itemsAcreditados = await traerTodo(
    'ordenes_compra_items',
    'id, codigo, cantidad_recibida, fecha_recepcion, estado_item',
    q => q.in('estado_item', ['completo', 'cancelado']),
  )

  const res = { ok: true, completados: 0, parciales: 0, sin_match: 0, ignorados_por_fecha: 0, revertidos, reservados: 0, auto_cancelados: autoCancel.cancelados, auto_cancelados_unidades: autoCancel.unidades }
  if (!itemsPend || itemsPend.length === 0) return res

  // 4. Agrupar compras por código (clave normalizada: NEO devuelve el mismo
  // código con distinta caja según el reporte)
  const comprasPorCodigo = {}
  let fechaNeoMin = null
  for (const c of todos) {
    const cod = String(c.codigo_interno || '').trim().toUpperCase()
    if (!cod) continue
    const fechaCompra = parseFecha(c.fecha)
    if (!fechaCompra) continue
    if (!fechaNeoMin || fechaCompra < fechaNeoMin) fechaNeoMin = fechaCompra
    if (!comprasPorCodigo[cod]) comprasPorCodigo[cod] = []
    comprasPorCodigo[cod].push({ cantidad: parseFloat(c.cantidad_comprada) || 0, fecha: fechaCompra })
  }

  // 4b. Lo ya acreditado, por código: se reserva antes de repartir nada nuevo.
  // Solo cuenta lo recibido DENTRO de la ventana que cubre neo_items_comprados
  // (hoy es una ventana móvil, no el histórico completo): una recepción de mayo
  // no puede consumir una compra de agosto.
  const acreditadoPorCodigo = {}
  for (const item of (itemsAcreditados || [])) {
    const cant = parseFloat(item.cantidad_recibida) || 0
    if (cant <= 0) continue
    const cod = String(item.codigo || '').trim().toUpperCase()
    if (!cod) continue
    const fRecep = parseFecha(item.fecha_recepcion)
    if (!fRecep) continue
    if (fechaNeoMin && fRecep < fechaNeoMin) continue
    if (!acreditadoPorCodigo[cod]) acreditadoPorCodigo[cod] = []
    acreditadoPorCodigo[cod].push({ cantidad: cant, fecha: fRecep })
  }

  // 5. Agrupar OC items por código, ordenar por fecha (FIFO: más antiguo primero)
  const itemsPorCodigo = {}
  for (const item of itemsPend) {
    const cod = String(item.codigo || '').trim().toUpperCase()
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
    const comprasBase = comprasPorCodigo[cod]
    if (!comprasBase || comprasBase.length === 0) {
      res.sin_match += itemsPorCodigo[cod].length
      continue
    }
    const disponibles = [...comprasBase].sort((a, b) => a.fecha - b.fecha).map(c => ({ ...c, restante: c.cantidad }))

    // Reservar lo que ya se le acreditó a otras OC en corridas anteriores.
    // Se consume en el mismo orden FIFO con el que se había repartido.
    const yaAcreditado = [...(acreditadoPorCodigo[cod] || [])].sort((a, b) => a.fecha - b.fecha)
    for (const ac of yaAcreditado) {
      let porReservar = ac.cantidad
      for (const disp of disponibles) {
        if (porReservar <= 0) break
        if (disp.restante <= 0) continue
        if (disp.fecha > ac.fecha) break // esa compra entró después de la recepción
        const usar = Math.min(disp.restante, porReservar)
        disp.restante -= usar
        porReservar -= usar
        res.reservados += usar
      }
    }

    for (const item of itemsPorCodigo[cod]) {
      const fechaOrden = parseFecha(fechaOrdenMap[item.orden_id])
      if (!fechaOrden) { res.ignorados_por_fecha++; continue }
      const cantOrdenada = parseFloat(item.cantidad_ordenada) || 0
      let cantRecibida = 0, fechaRecep = null
      for (const disp of disponibles) {
        // Comparar con el timestamp completo de la OC: si NEO registró la
        // compra antes del momento real de la OC, no puede ser su recepción
        // (es típicamente el upload de la OC a NEO, que NEO registra como
        // compra del mismo día a las 00:00).
        if (disp.fecha < fechaOrden) continue
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

  const BATCH = 100
  res.persistidos = 0
  for (let i = 0; i < actualizaciones.length; i += BATCH) {
    const lote = actualizaciones.slice(i, i + BATCH)
    const results = await Promise.all(lote.map(a =>
      getDb().from('ordenes_compra_items')
        .update({ cantidad_recibida: a.cantidad_recibida, estado_item: a.estado_item, fecha_recepcion: a.fecha_recepcion })
        .eq('id', a.id)
    ))
    for (const { error } of results) {
      if (error) {
        console.error('[procesar-match] update falló:', error.message)
        throw new Error(`UPDATE falló: ${error.message}`)
      }
    }
    res.persistidos += lote.length
  }

  return res
}
