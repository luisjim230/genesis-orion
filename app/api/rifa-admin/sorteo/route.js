import { requirePermiso } from '../../../../lib/auth-server'
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getClubActor, getClubDb } from '../../../../lib/club-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Fracción en [0,1) determinística a partir de una semilla (para sorteos
// verificables: se anuncia la semilla —ej. número de lotería— antes de sortear).
function fraccionDeSemilla(seed) {
  const h = crypto.createHash('sha256').update(String(seed)).digest();
  // 6 bytes → entero, normalizado a [0,1)
  const n = h.readUIntBE(0, 6);
  return n / 0x1000000000000; // 2^48
}

// Ejecuta un sorteo: elige un ganador ponderado por acciones entre los
// participantes elegibles (acciones > 0 y que no hayan ganado antes) y lo
// registra en rifa_ganadores (queda excluido de sorteos siguientes).
export async function POST(req) {
  const _g = await requirePermiso('rifa-admin'); if (_g.response) return _g.response;

  const actor = await getClubActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const premio = String(body?.premio || '').trim();
  if (!premio) return NextResponse.json({ error: 'Escribí el premio que se está sorteando.' }, { status: 400 });
  const ronda = body?.ronda != null && body.ronda !== '' ? Number(body.ronda) : null;
  const seed = body?.seed != null ? String(body.seed).trim() : '';
  const nota = body?.nota != null ? String(body.nota).trim() : '';

  const db = getClubDb();

  const { data: elegibles, error } = await db
    .from('rifa_saldos')
    .select('cedula,nombre,acciones,ya_gano')
    .gt('acciones', 0)
    .eq('ya_gano', false);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!elegibles || elegibles.length === 0) {
    return NextResponse.json({ error: 'No hay participantes elegibles (con acciones y sin premio previo).' }, { status: 400 });
  }

  const total = elegibles.reduce((a, e) => a + (Number(e.acciones) || 0), 0);
  const frac = seed ? fraccionDeSemilla(seed) : Math.random();
  let objetivo = frac * total; // punto en la tómbola

  let ganador = elegibles[elegibles.length - 1];
  for (const e of elegibles) {
    objetivo -= Number(e.acciones) || 0;
    if (objetivo < 0) { ganador = e; break; }
  }

  const { data: ins, error: insErr } = await db
    .from('rifa_ganadores')
    .insert({ cedula: ganador.cedula, nombre: ganador.nombre, premio, ronda, seed: seed || null, nota: nota || null })
    .select('id,fecha')
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    ganador: { id: ins.id, cedula: ganador.cedula, nombre: ganador.nombre, acciones: Number(ganador.acciones) || 0 },
    premio,
    total_elegibles: elegibles.length,
    total_acciones: total,
    fecha: ins.fecha,
  });
}

// Deshace un ganador (por si hubo un error). Vuelve a quedar elegible.
export async function DELETE(req) {
  const _g = await requirePermiso('rifa-admin'); if (_g.response) return _g.response;

  const actor = await getClubActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 });

  const db = getClubDb();
  const { error } = await db.from('rifa_ganadores').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
