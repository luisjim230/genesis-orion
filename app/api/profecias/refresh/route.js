import { requirePermiso } from '../../../../lib/auth-server'
import { sb, jsonError } from '../_lib.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

export async function POST() {
  const _g = await requirePermiso('profecias'); if (_g.response) return _g.response;

  try {
    const t0 = Date.now();
    const { error } = await sb().rpc('refresh_profecias_panel');
    if (error) throw error;
    return Response.json({ ok: true, ms: Date.now() - t0 });
  } catch (e) {
    return jsonError(e.message);
  }
}

// Sin handler GET: el refresco de la vista no debe dispararse desde una
// navegación del navegador o un <img> (CSRF). La app lo llama con POST.
