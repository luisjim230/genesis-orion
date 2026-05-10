import { sb, jsonError } from '../_lib.js';

export const dynamic = 'force-dynamic';

// POST aprobar UN SKU
// Body: { codigo_interno, cantidad_aprobada, costo_unitario_estimado?, notas?, aprobado_por? }
export async function POST(req) {
  try {
    const body = await req.json();
    const codigo_interno = String(body.codigo_interno || '').trim();
    const cantidad_aprobada = parseFloat(body.cantidad_aprobada);
    if (!codigo_interno) return jsonError('codigo_interno requerido', 400);
    if (!Number.isFinite(cantidad_aprobada) || cantidad_aprobada <= 0) return jsonError('cantidad_aprobada debe ser > 0', 400);

    const { data: panel, error: ePanel } = await sb()
      .from('profecias_panel')
      .select('*')
      .eq('codigo_interno', codigo_interno)
      .maybeSingle();
    if (ePanel) throw ePanel;
    if (!panel) return jsonError('SKU no encontrado en profecias_panel', 404);

    const costo = parseFloat(body.costo_unitario_estimado || panel.ultimo_costo || 0) || 0;
    const inversion = cantidad_aprobada * costo;
    const ahora = new Date().toISOString();

    const aprobacion = {
      codigo_interno,
      proveedor: panel.ultimo_proveedor,
      estado: 'aprobado',
      cantidad_sugerida_original: panel.cantidad_sugerida,
      cantidad_aprobada,
      costo_unitario_estimado: costo,
      inversion_estimada: inversion,
      madurez_al_momento: panel.madurez,
      velocidad_observada: panel.velocidad_ajustada_90d ?? panel.velocidad_90d ?? panel.velocidad_ajustada_30d ?? panel.velocidad_30d ?? null,
      existencias_al_momento: panel.existencias,
      semaforo_al_momento: panel.semaforo,
      clasificacion_manual_al_momento: panel.clasificacion_manual,
      aprobado_por: body.aprobado_por || null,
      aprobado_en: ahora,
      notas: body.notas || null,
    };

    const { data: aprIns, error: eAp } = await sb()
      .from('profecias_aprobaciones')
      .insert(aprobacion)
      .select()
      .single();
    if (eAp) throw eAp;

    // Audit en historial permanente
    await sb().from('profecias_historial_decisiones').insert({
      codigo_interno,
      fecha_decision: ahora.slice(0, 10),
      proveedor: panel.ultimo_proveedor,
      madurez_al_momento: panel.madurez,
      velocidad_observada: aprobacion.velocidad_observada,
      existencias_al_momento: panel.existencias,
      cantidad_sugerida: panel.cantidad_sugerida,
      cantidad_firmada: cantidad_aprobada,
      costo_unitario_estimado: costo,
      inversion_estimada: inversion,
      clasificacion_manual_al_momento: panel.clasificacion_manual,
      notas: body.notas || null,
    });

    sb().rpc('refresh_profecias_panel').then(() => {}, () => {});

    return Response.json({ ok: true, id: aprIns.id, aprobacion: aprIns });
  } catch (e) {
    return jsonError(e.message);
  }
}
