import { NextResponse } from 'next/server';
import { getClubActor, getClubDb } from '../../../../lib/club-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAMPOS = ['nombre', 'tier', 'aporte_colones', 'neo_proveedor', 'detecta_credix', 'logo_url', 'activo', 'orden'];

// Crea un patrocinador nuevo.
export async function POST(req) {
  const actor = await getClubActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const nombre = String(body?.nombre || '').trim();
  if (!nombre) return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });

  const row = { nombre };
  for (const k of CAMPOS) if (k !== 'nombre' && body[k] !== undefined) row[k] = body[k];

  const db = getClubDb();
  const { data, error } = await db.from('rifa_patrocinadores').insert(row).select('id').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

// Actualiza campos de un patrocinador.
export async function PATCH(req) {
  const actor = await getClubActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });

  const patch = {};
  for (const k of CAMPOS) if (body[k] !== undefined) patch[k] = body[k] === '' ? null : body[k];
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 });

  const db = getClubDb();
  const { error } = await db.from('rifa_patrocinadores').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
