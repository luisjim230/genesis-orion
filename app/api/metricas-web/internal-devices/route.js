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

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const includeRevoked = searchParams.get('include_revoked') === '1';
    let q = getAdmin().from('internal_team_devices').select('*').order('marked_at', { ascending: false });
    if (!includeRevoked) q = q.eq('revoked', false);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data: data || [] });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    const device_label = String(body?.device_label || '').trim() || null;
    const marked_by    = String(body?.marked_by || '').trim() || null;
    const client_id    = String(body?.client_id || '').trim() || null;
    const ua = req.headers.get('user-agent') || null;
    const { data, error } = await getAdmin()
      .from('internal_team_devices')
      .insert({ device_label, marked_by, client_id, user_agent: ua, revoked: false })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const body = await req.json();
    const id = body?.id;
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 });
    const update = {};
    if (typeof body?.revoked === 'boolean') update.revoked = body.revoked;
    const { error } = await getAdmin().from('internal_team_devices').update(update).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
