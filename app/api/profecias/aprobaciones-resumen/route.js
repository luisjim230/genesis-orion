import { sb, jsonError } from '../_lib.js';

export const dynamic = 'force-dynamic';

// GET resumen rápido para badge del sidebar
export async function GET() {
  try {
    const { count, error } = await sb()
      .from('profecias_aprobaciones')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'aprobado');
    if (error) throw error;
    return Response.json({ ok: true, aprobados: count || 0 });
  } catch (e) {
    return jsonError(e.message);
  }
}
