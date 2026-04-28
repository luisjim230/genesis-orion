import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

let _admin;
function getAdmin() {
  if (_admin) return _admin;
  _admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  return _admin;
}

// DELETE: archiva la campaña (no la borra).
export async function DELETE(_req, { params }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
    const { error } = await getAdmin()
      .from('utm_campaigns')
      .update({ archived: true })
      .eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH: archivar/desarchivar.
export async function PATCH(req, { params }) {
  try {
    const { id } = await params;
    const body = await req.json();
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
    const update = {};
    if (typeof body?.archived === 'boolean') update.archived = body.archived;
    if (typeof body?.name === 'string' && body.name.trim()) update.name = body.name.trim();
    if (typeof body?.description === 'string') update.description = body.description.trim() || null;
    const { error } = await getAdmin().from('utm_campaigns').update(update).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
