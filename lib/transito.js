// Tránsito = mercadería pedida (OC) que todavía no llegó. Se resta de lo que
// el sistema sugiere reordenar. Problema: a veces el proveedor nunca despacha
// y esa OC queda "en tránsito" para siempre, ocultando que en realidad hay que
// volver a pedir el ítem.
//
// Regla: a los DIAS_LIMITE_OC días de la fecha de la orden se da por perdida.
// El ítem se auto-cancela (sale de Trazabilidad y deja de contar como tránsito)
// y el producto vuelve a quedar disponible para pedir. La OC sigue en el
// historial: no se borra nada, solo deja de bloquear la recompra.
export const DIAS_LIMITE_OC = 10;

// Mismo número: lo que ya está auto-cancelado no puede seguir contando como
// tránsito. Si los dos valores no coinciden queda una ventana ciega en la que
// la OC sigue abierta pero invisible, y el ítem se pide dos veces.
export const DIAS_MAX_TRANSITO = DIAS_LIMITE_OC;

// Solo estos estados cuentan como tránsito. 'completo'/'cancelado' no.
const ESTADOS_TRANSITO = ['pendiente', 'parcial'];

// Los códigos se normalizan SIEMPRE a mayúsculas + trim. NEO devuelve el mismo
// código con distinta caja según el reporte (neo_lista_items vs
// neo_minimos_maximos vs items comprados); si la clave del tMap no está
// normalizada, el ítem "no tiene tránsito" y se vuelve a pedir. Es exactamente
// el mismo problema que ya estaba resuelto en procesar-match.js.
export function normCodigo(v) {
  return String(v || '').trim().toUpperCase();
}

// Trae TODAS las filas paginando de a 1000 (límite por defecto de PostgREST).
// Sin esto, con >1000 ítems pendientes las órdenes más nuevas se truncaban en
// silencio y su mercadería dejaba de contar como tránsito → se re-pedía.
async function traerTodo(db, tabla, columnas, filtro) {
  const PAGE = 1000;
  let filas = [], offset = 0;
  while (true) {
    let q = db.from(tabla).select(columnas);
    if (filtro) q = filtro(q);
    q = q.order('id', { ascending: true }).range(offset, offset + PAGE - 1);
    const { data, error } = await q;
    if (error) throw new Error(`transito/traerTodo(${tabla}) falló: ${error.message}`);
    if (!data || data.length === 0) break;
    filas = filas.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return filas;
}

// Calcula el tránsito vigente desde ordenes_compra_items + ordenes_compra.
// `db` es un cliente supabase-js (sirve el del cliente y el del servidor).
// Devuelve:
//   tMap[CODIGO]        → unidades pendientes en tránsito dentro del corte
//   tMapVencido[CODIGO] → unidades pendientes de OCs que ya pasaron el corte
//                         (no se restan de la sugerencia, pero SÍ se avisan)
//   diasMap[CODIGO]     → días en tránsito de la orden vigente más nueva
//   detalleMap[CODIGO]  → [{ pendiente, dias, fecha, proveedor, lote, vigente }]
//                         ordenado del pedido más viejo al más nuevo. Es lo que
//                         permite avisar "ya pediste 50 el 13/08" antes de
//                         mandar la misma OC dos veces.
// Todas las claves están normalizadas con normCodigo().
export async function calcularTransito(db) {
  const items = await traerTodo(
    db,
    'ordenes_compra_items',
    'id, codigo, cantidad_ordenada, cantidad_recibida, orden_id, estado_item, proveedor',
    q => q.in('estado_item', ESTADOS_TRANSITO),
  );

  const ordenIds = [...new Set((items || []).map(i => i.orden_id).filter(Boolean))];
  const ordenPorId = {};
  // Paginado en bloques de 200 ids: un .in() con miles de ids revienta el
  // largo máximo de la URL y devuelve error (o vacío) sin avisar.
  for (let i = 0; i < ordenIds.length; i += 200) {
    const bloque = ordenIds.slice(i, i + 200);
    const { data: ordenes } = await db
      .from('ordenes_compra')
      .select('id, fecha_orden, nombre_lote')
      .in('id', bloque);
    for (const o of (ordenes || [])) ordenPorId[o.id] = o;
  }

  const ahora = Date.now();
  const tMap = {}, tMapVencido = {}, diasMap = {}, detalleMap = {};
  for (const i of (items || [])) {
    const pendiente = Math.max(
      (parseFloat(i.cantidad_ordenada) || 0) - (parseFloat(i.cantidad_recibida) || 0),
      0,
    );
    if (pendiente <= 0) continue;
    const cod = normCodigo(i.codigo);
    if (!cod) continue;

    const orden = ordenPorId[i.orden_id] || {};
    const fo = orden.fecha_orden;
    // Si la orden no tiene fecha_orden no podemos calcular antigüedad: la
    // contamos igual (sin badge de días) para no perder tránsito legítimo.
    const dias = fo ? Math.floor((ahora - new Date(fo).getTime()) / 86400000) : null;
    const vigente = dias === null || dias < DIAS_MAX_TRANSITO;

    if (vigente) {
      tMap[cod] = (tMap[cod] || 0) + pendiente;
      if (dias !== null && (diasMap[cod] === undefined || dias < diasMap[cod])) diasMap[cod] = dias;
    } else {
      tMapVencido[cod] = (tMapVencido[cod] || 0) + pendiente;
    }

    if (!detalleMap[cod]) detalleMap[cod] = [];
    detalleMap[cod].push({
      pendiente,
      dias,
      fecha: fo || null,
      proveedor: i.proveedor || '',
      lote: orden.nombre_lote || '',
      vigente,
    });
  }
  for (const cod of Object.keys(detalleMap)) {
    detalleMap[cod].sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));
  }
  return { tMap, tMapVencido, diasMap, detalleMap };
}

// Consulta acotada: pendientes SOLO de los códigos pedidos. Se usa justo antes
// de mandar una OC para avisar si ya hay unidades pedidas y sin llegar.
// Devuelve el mismo formato que detalleMap, sin corte de antigüedad (acá
// interesa todo lo que sigue abierto, incluso lo atrasado).
export async function pendientesPorCodigo(db, codigos) {
  const cods = [...new Set((codigos || []).map(normCodigo).filter(Boolean))];
  if (!cods.length) return {};

  // El filtro por código se hace en memoria: los códigos de NEO vienen con
  // distinta caja/espacios y un .in() exacto se pierde justo los que importan.
  const set = new Set(cods);
  const todos = await traerTodo(
    db,
    'ordenes_compra_items',
    'id, codigo, cantidad_ordenada, cantidad_recibida, orden_id, proveedor',
    q => q.in('estado_item', ESTADOS_TRANSITO),
  );
  const items = todos.filter(r => set.has(normCodigo(r.codigo)));

  const ordenIds = [...new Set(items.map(i => i.orden_id).filter(Boolean))];
  const ordenPorId = {};
  for (let i = 0; i < ordenIds.length; i += 200) {
    const { data: ordenes } = await db
      .from('ordenes_compra')
      .select('id, fecha_orden, nombre_lote')
      .in('id', ordenIds.slice(i, i + 200));
    for (const o of (ordenes || [])) ordenPorId[o.id] = o;
  }

  const ahora = Date.now();
  const out = {};
  for (const i of items) {
    const pendiente = Math.max(
      (parseFloat(i.cantidad_ordenada) || 0) - (parseFloat(i.cantidad_recibida) || 0),
      0,
    );
    if (pendiente <= 0) continue;
    const cod = normCodigo(i.codigo);
    const orden = ordenPorId[i.orden_id] || {};
    const dias = orden.fecha_orden
      ? Math.floor((ahora - new Date(orden.fecha_orden).getTime()) / 86400000)
      : null;
    if (!out[cod]) out[cod] = [];
    out[cod].push({
      pendiente,
      dias,
      fecha: orden.fecha_orden || null,
      proveedor: i.proveedor || '',
      lote: orden.nombre_lote || '',
      vigente: dias === null || dias < DIAS_MAX_TRANSITO,
    });
  }
  for (const cod of Object.keys(out)) out[cod].sort((a, b) => (b.dias ?? -1) - (a.dias ?? -1));
  return out;
}
