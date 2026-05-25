import { NextResponse } from 'next/server';
import { getBovedaActor, getBovedaDb } from '../../../../lib/boveda-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Revelar / copiar una clave. Devuelve el texto en claro y deja registro en la
// bitácora (quién y cuándo). Cualquier miembro de la bóveda.
export async function POST(req) {
  const actor = await getBovedaActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { id, accion } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const { data, error } = await getBovedaDb().rpc('boveda_revelar', {
    p_id: id,
    p_actor_id: actor.id,
    p_actor_nombre: actor.nombre,
    p_accion: accion === 'copiar' ? 'copiar' : 'revelar',
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ clave: data });
}
