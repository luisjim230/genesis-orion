import { NextResponse } from 'next/server';
import { getClubActor, getClubDb } from '../../../../lib/club-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Registrar un canje: inserta en club_canjes (resta puntos del saldo, que la
// vista club_saldos recalcula). Valida saldo suficiente antes de insertar.
// Body: { cedula, premio, puntos, nota? }
export async function POST(req) {
  const actor = await getClubActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const cedula = b.cedula && String(b.cedula).trim();
  const premio = b.premio && String(b.premio).trim();
  const puntos = Number(b.puntos);

  if (!cedula) return NextResponse.json({ error: 'La cédula es obligatoria' }, { status: 400 });
  if (!premio) return NextResponse.json({ error: 'El premio es obligatorio' }, { status: 400 });
  if (Number.isNaN(puntos) || puntos <= 0) {
    return NextResponse.json({ error: 'Los puntos deben ser mayores a cero' }, { status: 400 });
  }

  const db = getClubDb();

  // Validar que el miembro exista y tenga saldo suficiente.
  const { data: saldo, error: saldoErr } = await db
    .from('club_saldos')
    .select('cedula,nombre,puntos')
    .eq('cedula', cedula)
    .maybeSingle();

  if (saldoErr) return NextResponse.json({ error: saldoErr.message }, { status: 500 });
  if (!saldo) return NextResponse.json({ error: 'No existe un miembro con esa cédula' }, { status: 400 });

  const disponibles = Number(saldo.puntos) || 0;
  if (puntos > disponibles) {
    return NextResponse.json({
      error: `Saldo insuficiente: ${saldo.nombre || cedula} tiene ${disponibles} puntos y el canje pide ${puntos}.`,
    }, { status: 400 });
  }

  const { error: insErr } = await db.from('club_canjes').insert({
    cedula,
    premio,
    puntos,
    nota: b.nota ? String(b.nota).trim() : null,
  });

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, saldo_restante: disponibles - puntos });
}
