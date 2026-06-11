import { NextResponse } from 'next/server';
import { getBovedaActor, getBovedaDb } from '../../../../lib/boveda-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Listar licencias (sin claves). Cualquier miembro de la bóveda.
export async function GET() {
  const actor = await getBovedaActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { data, error } = await getBovedaDb().rpc('boveda_licencias_listar');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ licencias: data || [] });
}

// Crear licencia. Cualquier miembro.
export async function POST(req) {
  const actor = await getBovedaActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b.software || !String(b.software).trim()) {
    return NextResponse.json({ error: 'El nombre del software es obligatorio' }, { status: 400 });
  }

  const { data, error } = await getBovedaDb().rpc('boveda_licencias_crear', {
    p_software: String(b.software),
    p_tipo: b.tipo || null,
    p_usuario: b.usuario || null,
    p_correo: b.correo || null,
    p_clave: b.clave || null,
    p_asignado_a: b.asignado_a || null,
    p_fecha_pago: b.fecha_pago || null,
    p_costo: b.costo || null,
    p_notas: b.notas || null,
    p_actor_id: actor.id,
    p_actor_nombre: actor.nombre,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data });
}

// Editar licencia. Cualquier miembro de la bóveda (datos operativos del inventario).
export async function PATCH(req) {
  const actor = await getBovedaActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  // clave: solo se cambia si vino con texto. Vacío → se conserva la actual.
  const p_clave = b.clave && String(b.clave).length ? String(b.clave) : null;

  const { error } = await getBovedaDb().rpc('boveda_licencias_editar', {
    p_id: b.id,
    p_software: b.software || null,
    p_tipo: b.tipo || null,
    p_usuario: b.usuario || null,
    p_correo: b.correo || null,
    p_clave,
    p_asignado_a: b.asignado_a || null,
    p_fecha_pago: b.fecha_pago || null,
    p_costo: b.costo || null,
    p_notas: b.notas || null,
    p_actor_id: actor.id,
    p_actor_nombre: actor.nombre,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Borrar licencia. SOLO admin (Luis).
export async function DELETE(req) {
  const actor = await getBovedaActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  if (!actor.admin) return NextResponse.json({ error: 'Solo Luis puede borrar' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const { error } = await getBovedaDb().rpc('boveda_licencias_borrar', {
    p_id: id, p_actor_id: actor.id, p_actor_nombre: actor.nombre,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
