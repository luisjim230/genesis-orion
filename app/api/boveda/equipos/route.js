import { NextResponse } from 'next/server';
import { getBovedaActor, getBovedaDb } from '../../../../lib/boveda-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Listar equipos. Cualquier miembro de la bóveda.
export async function GET() {
  const actor = await getBovedaActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const { data, error } = await getBovedaDb().rpc('boveda_equipos_listar');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ equipos: data || [] });
}

// Crear equipo. Cualquier miembro.
export async function POST(req) {
  const actor = await getBovedaActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b.nombre || !String(b.nombre).trim()) {
    return NextResponse.json({ error: 'El nombre del equipo es obligatorio' }, { status: 400 });
  }

  const { data, error } = await getBovedaDb().rpc('boveda_equipos_crear', {
    p_nombre: String(b.nombre),
    p_tipo: b.tipo || null,
    p_marca: b.marca || null,
    p_modelo: b.modelo || null,
    p_serie: b.serie || null,
    p_asignado_a: b.asignado_a || null,
    p_ubicacion: b.ubicacion || null,
    p_estado: b.estado || null,
    p_fecha_compra: b.fecha_compra || null,
    p_notas: b.notas || null,
    p_ip: b.ip || null,
    p_mantenimiento: b.mantenimiento || null,
    p_acceso_remoto: b.acceso_remoto || null,
    p_clave_acceso: b.clave_acceso || null,
    p_clave_remoto: b.clave_remoto || null,
    p_actor_id: actor.id,
    p_actor_nombre: actor.nombre,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data });
}

// Editar equipo. Cualquier miembro de la bóveda (datos operativos del inventario).
export async function PATCH(req) {
  const actor = await getBovedaActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  if (!b.id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  // claves: solo se cambian si vinieron con texto. Vacío → se conservan.
  const p_clave_acceso = b.clave_acceso && String(b.clave_acceso).length ? String(b.clave_acceso) : null;
  const p_clave_remoto = b.clave_remoto && String(b.clave_remoto).length ? String(b.clave_remoto) : null;

  const { error } = await getBovedaDb().rpc('boveda_equipos_editar', {
    p_id: b.id,
    p_nombre: b.nombre || null,
    p_tipo: b.tipo || null,
    p_marca: b.marca || null,
    p_modelo: b.modelo || null,
    p_serie: b.serie || null,
    p_asignado_a: b.asignado_a || null,
    p_ubicacion: b.ubicacion || null,
    p_estado: b.estado || null,
    p_fecha_compra: b.fecha_compra || null,
    p_notas: b.notas || null,
    p_ip: b.ip || null,
    p_mantenimiento: b.mantenimiento || null,
    p_acceso_remoto: b.acceso_remoto || null,
    p_clave_acceso,
    p_clave_remoto,
    p_actor_id: actor.id,
    p_actor_nombre: actor.nombre,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Borrar equipo. SOLO admin (Luis).
export async function DELETE(req) {
  const actor = await getBovedaActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  if (!actor.admin) return NextResponse.json({ error: 'Solo Luis puede borrar' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });

  const { error } = await getBovedaDb().rpc('boveda_equipos_borrar', {
    p_id: id, p_actor_id: actor.id, p_actor_nombre: actor.nombre,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
