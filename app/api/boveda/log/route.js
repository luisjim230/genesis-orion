import { NextResponse } from 'next/server';
import { getBovedaActor, getBovedaDb } from '../../../../lib/boveda-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Bitácora de actividad. SOLO admin (Luis).
export async function GET() {
  const actor = await getBovedaActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  if (!actor.admin) return NextResponse.json({ error: 'Solo Luis puede ver la bitácora' }, { status: 403 });

  const { data, error } = await getBovedaDb().rpc('boveda_log_listar', { p_limit: 200 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ log: data || [] });
}
