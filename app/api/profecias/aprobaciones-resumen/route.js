import { requirePermiso } from '../../../../lib/auth-server'
import { sb, jsonError } from '../_lib.js';

export const dynamic = 'force-dynamic';

// GET resumen rápido para badge del sidebar
export async function GET() {
  const _g = await requirePermiso('profecias'); if (_g.response) return _g.response;

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
