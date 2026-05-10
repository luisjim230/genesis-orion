import { sb, jsonError } from '../_lib.js';

export const dynamic = 'force-dynamic';

// POST aprobar VARIOS SKUs en un solo INSERT batch.
// Body: { items: [{ codigo_interno, cantidad_aprobada, costo_unitario_estimado? }, ...], notas?, aprobado_por? }
export async function POST(req) {
  try {
    const body = await req.json();
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return jsonError('items vacío', 400);

    const limpios = items
      .map((i) => ({
        codigo_interno: String(i.codigo_interno || '').trim(),
        cantidad_aprobada: parseFloat(i.cantidad_aprobada),
        costo_in: i.costo_unitario_estimado != null && i.costo_unitario_estimado !== '' ? parseFloat(i.costo_unitario_estimado) : null,
      }))
      .filter((i) => i.codigo_interno && Number.isFinite(i.cantidad_aprobada) && i.cantidad_aprobada > 0);
    if (!limpios.length) return jsonError('Ningún item válido (cantidad debe ser > 0)', 400);

    const codigos = [...new Set(limpios.map((i) => i.codigo_interno))];

    const { data: panelRows, error: ePanel } = await sb()
      .from('profecias_panel')
      .select('codigo_interno, ultimo_proveedor, madurez, velocidad_30d, velocidad_90d, velocidad_ajustada_30d, velocidad_ajustada_90d, existencias, cantidad_sugerida, ultimo_costo, clasificacion_manual, semaforo')
      .in('codigo_interno', codigos);
    if (ePanel) throw ePanel;
    const panelMap = new Map((panelRows || []).map((p) => [p.codigo_interno, p]));

    const noEncontrados = codigos.filter((c) => !panelMap.has(c));
    if (noEncontrados.length) return jsonError(`SKUs no encontrados: ${noEncontrados.join(', ')}`, 400);

    const ahora = new Date().toISOString();
    const aprobaciones = limpios.map((i) => {
      const p = panelMap.get(i.codigo_interno);
      const costo = i.costo_in != null ? i.costo_in : (parseFloat(p.ultimo_costo) || 0);
      const inv = i.cantidad_aprobada * costo;
      return {
        codigo_interno: i.codigo_interno,
        proveedor: p.ultimo_proveedor,
        estado: 'aprobado',
        cantidad_sugerida_original: p.cantidad_sugerida,
        cantidad_aprobada: i.cantidad_aprobada,
        costo_unitario_estimado: costo,
        inversion_estimada: inv,
        madurez_al_momento: p.madurez,
        velocidad_observada: p.velocidad_ajustada_90d ?? p.velocidad_90d ?? p.velocidad_ajustada_30d ?? p.velocidad_30d ?? null,
        existencias_al_momento: p.existencias,
        semaforo_al_momento: p.semaforo,
        clasificacion_manual_al_momento: p.clasificacion_manual,
        aprobado_por: body.aprobado_por || null,
        aprobado_en: ahora,
        notas: body.notas || null,
      };
    });

    // INSERT batch (Supabase lo trata como una transacción única)
    const { data: insertadas, error: eIns } = await sb()
      .from('profecias_aprobaciones')
      .insert(aprobaciones)
      .select();
    if (eIns) throw eIns;

    // Historial paralelo (best-effort, no bloquea respuesta)
    const decisiones = aprobaciones.map((a) => ({
      codigo_interno: a.codigo_interno,
      fecha_decision: ahora.slice(0, 10),
      proveedor: a.proveedor,
      madurez_al_momento: a.madurez_al_momento,
      velocidad_observada: a.velocidad_observada,
      existencias_al_momento: a.existencias_al_momento,
      cantidad_sugerida: a.cantidad_sugerida_original,
      cantidad_firmada: a.cantidad_aprobada,
      costo_unitario_estimado: a.costo_unitario_estimado,
      inversion_estimada: a.inversion_estimada,
      clasificacion_manual_al_momento: a.clasificacion_manual_al_momento,
      notas: a.notas,
    }));
    await sb().from('profecias_historial_decisiones').insert(decisiones);

    sb().rpc('refresh_profecias_panel').then(() => {}, () => {});

    return Response.json({
      ok: true,
      count: insertadas.length,
      ids: insertadas.map((r) => r.id),
    });
  } catch (e) {
    return jsonError(e.message);
  }
}
