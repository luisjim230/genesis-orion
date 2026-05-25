// Tránsito = mercadería pedida (OC) que todavía no llegó. Se resta de lo que
// el sistema sugiere reordenar. Problema: a veces el proveedor nunca despacha
// y esa OC queda "en tránsito" para siempre, ocultando que en realidad hay que
// volver a pedir el ítem. Por eso, pasado DIAS_MAX_TRANSITO desde la fecha de
// la orden, dejamos de contarla como tránsito (la OC NO se borra; sigue en
// Trazabilidad para recibirla o cancelarla a mano).
export const DIAS_MAX_TRANSITO = 8;

// Solo estos estados cuentan como tránsito. 'completo'/'cancelado' no.
const ESTADOS_TRANSITO = ['pendiente', 'parcial'];

// Calcula el tránsito vigente desde ordenes_compra_items + ordenes_compra.
// `db` es un cliente supabase-js (sirve el del cliente y el del servidor).
// Devuelve:
//   tMap[codigo]    → unidades pendientes en tránsito dentro del corte
//                     (clave = codigo.trim())
//   diasMap[CODIGO] → días en tránsito de la orden vigente más nueva
//                     (clave = codigo.trim().toUpperCase())
export async function calcularTransito(db) {
  const { data: items } = await db
    .from('ordenes_compra_items')
    .select('codigo, cantidad_ordenada, cantidad_recibida, orden_id, estado_item')
    .in('estado_item', ESTADOS_TRANSITO);

  const ordenIds = [...new Set((items || []).map(i => i.orden_id).filter(Boolean))];
  const fechaPorOrden = {};
  if (ordenIds.length) {
    const { data: ordenes } = await db
      .from('ordenes_compra')
      .select('id, fecha_orden')
      .in('id', ordenIds);
    for (const o of (ordenes || [])) {
      if (o.fecha_orden) fechaPorOrden[o.id] = o.fecha_orden;
    }
  }

  const ahora = Date.now();
  const tMap = {}, diasMap = {};
  for (const i of (items || [])) {
    const pendiente = Math.max(
      (parseFloat(i.cantidad_ordenada) || 0) - (parseFloat(i.cantidad_recibida) || 0),
      0,
    );
    if (pendiente <= 0) continue;
    const cod = String(i.codigo || '').trim();
    if (!cod) continue;

    const fo = fechaPorOrden[i.orden_id];
    if (fo) {
      const dias = Math.floor((ahora - new Date(fo).getTime()) / 86400000);
      if (dias >= DIAS_MAX_TRANSITO) continue; // tránsito vencido → ya no cuenta
      const codU = cod.toUpperCase();
      if (diasMap[codU] === undefined || dias < diasMap[codU]) diasMap[codU] = dias;
    }
    // Si la orden no tiene fecha_orden no podemos calcular antigüedad: la
    // contamos igual (sin badge de días) para no perder tránsito legítimo.
    tMap[cod] = (tMap[cod] || 0) + pendiente;
  }
  return { tMap, diasMap };
}
