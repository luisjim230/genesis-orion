import { sb, jsonError } from '../_lib.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

export async function POST() {
  try {
    const t0 = Date.now();
    const { error } = await sb().rpc('refresh_profecias_panel');
    if (error) throw error;
    return Response.json({ ok: true, ms: Date.now() - t0 });
  } catch (e) {
    return jsonError(e.message);
  }
}

export async function GET() {
  return POST();
}
