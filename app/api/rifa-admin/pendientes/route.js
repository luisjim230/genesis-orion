import { NextResponse } from 'next/server';
import { getClubActor, getClubDb } from '../../../../lib/club-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Corre el robot ahora mismo (procesa la cola de pendientes sin esperar al cron).
export async function POST() {
  const actor = await getClubActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const db = getClubDb();
  const { data, error } = await db.rpc('rifa_procesar_pendientes');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, resultado: data });
}

// Reintenta un pendiente fallido (vuelve a 'pendiente').
export async function PATCH(req) {
  const actor = await getClubActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });

  const db = getClubDb();
  const { error } = await db.from('rifa_pendientes').update({ estado: 'pendiente', intentos: 0, ultimo_error: null }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Elimina un pendiente.
export async function DELETE(req) {
  const actor = await getClubActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });

  const db = getClubDb();
  const { error } = await db.from('rifa_pendientes').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
