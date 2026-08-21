import { NextResponse } from 'next/server';
import { getClubActor, getClubDb } from '../../../../lib/club-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CLAVES_OK = new Set([
  'digitos_factura', 'tolerancia_monto_pct', 'colones_por_accion',
  'bono_patrocinador_mult', 'bono_web_mult', 'vendedor_web', 'fecha_corte', 'activa',
]);

// Actualiza una perilla de configuración de la rifa.
export async function PATCH(req) {
  const actor = await getClubActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const clave = String(body?.clave || '').trim();
  if (!CLAVES_OK.has(clave)) return NextResponse.json({ error: 'Clave de configuración no permitida' }, { status: 400 });
  const valor = body?.valor == null ? '' : String(body.valor);

  const db = getClubDb();
  const { error } = await db.from('rifa_config').update({ valor }).eq('clave', clave);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
