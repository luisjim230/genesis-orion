import { NextResponse } from 'next/server';
import { getBovedaActor, getBovedaDb } from '../../../lib/boveda-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Listar accesos (sin claves). Cualquier miembro de la bóveda.
export async function GET() {
  const actor = await getBovedaActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { data, error } = await getBovedaDb().rpc('boveda_listar');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    accesos: data || [],
    actor: { nombre: actor.nombre, admin: actor.admin },
  });
}

// Crear acceso. Cualquier miembro.
export async function POST(req) {
  const actor = await getBovedaActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b.titulo || !String(b.titulo).trim()) {
    return NextResponse.json({ error: 'El título es obligatorio' }, { status: 400 });
  }

  const { data, error } = await getBovedaDb().rpc('boveda_crear', {
    p_titulo: String(b.titulo),
    p_categoria: b.categoria || null,
    p_usuario: b.usuario || null,
    p_correo: b.correo || null,
    p_clave: b.clave || null,
    p_descripcion: b.descripcion || null,
    p_actor_id: actor.id,
    p_actor_nombre: actor.nombre,
    p_fecha_pago: b.fecha_pago || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data });
}

// Editar acceso. SOLO admin (Luis).
export async function PATCH(req) {
  const actor = await getBovedaActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  if (!actor.admin) return NextResponse.json({ error: 'Solo Luis puede editar accesos' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  // clave: solo se cambia si vino con texto. Vacío → se conserva la actual.
  const p_clave = b.clave && String(b.clave).length ? String(b.clave) : null;

  const { error } = await getBovedaDb().rpc('boveda_editar', {
    p_id: b.id,
    p_titulo: b.titulo || null,
    p_categoria: b.categoria || null,
    p_usuario: b.usuario || null,
    p_correo: b.correo || null,
    p_clave,
    p_descripcion: b.descripcion || null,
    p_actor_id: actor.id,
    p_actor_nombre: actor.nombre,
    p_fecha_pago: b.fecha_pago || null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Borrar acceso. SOLO admin (Luis).
export async function DELETE(req) {
  const actor = await getBovedaActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  if (!actor.admin) return NextResponse.json({ error: 'Solo Luis puede borrar accesos' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const { error } = await getBovedaDb().rpc('boveda_borrar', {
    p_id: id,
    p_actor_id: actor.id,
    p_actor_nombre: actor.nombre,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
