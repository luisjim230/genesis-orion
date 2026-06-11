import { NextResponse } from 'next/server';
import { getBovedaActor, getBovedaDb } from '../../../../../lib/boveda-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Revelar / copiar la clave (serial) de una licencia. Queda registrado en la
// bitácora. Cualquier miembro de la bóveda.
export async function POST(req) {
  const actor = await getBovedaActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
  const accion = b.accion === 'copiar' ? 'copiar' : 'revelar';

  const { data, error } = await getBovedaDb().rpc('boveda_licencias_revelar', {
    p_id: b.id, p_actor_id: actor.id, p_actor_nombre: actor.nombre, p_accion: accion,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ clave: data });
}
