import { NextResponse } from 'next/server';
import { getClubActor, getClubDb } from '../../../../lib/club-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Actualizar un producto participante: activar/desactivar y/o cambiar los
// puntos por unidad. Body: { codigo_interno, activo?, puntos_por_unidad? }
export async function PATCH(req) {
  const actor = await getClubActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const b = await req.json().catch(() => ({}));
  const codigo = b.codigo_interno && String(b.codigo_interno).trim();
  if (!codigo) return NextResponse.json({ error: 'codigo_interno requerido' }, { status: 400 });

  const patch = {};
  if (typeof b.activo === 'boolean') patch.activo = b.activo;
  if (b.puntos_por_unidad !== undefined && b.puntos_por_unidad !== null && b.puntos_por_unidad !== '') {
    const n = Number(b.puntos_por_unidad);
    if (Number.isNaN(n) || n < 0) return NextResponse.json({ error: 'puntos_por_unidad inválido' }, { status: 400 });
    patch.puntos_por_unidad = n;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 });
  }

  const { data, error } = await getClubDb()
    .from('club_productos_participan')
    .update(patch)
    .eq('codigo_interno', codigo)
    .select('codigo_interno,descripcion,puntos_por_unidad,activo')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, producto: data });
}
