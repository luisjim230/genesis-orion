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

// Normaliza un texto a slug: lowercase, sin tildes, espacios → _, max 50 chars.
export function toSlug(input) {
  if (!input) return '';
  return String(input)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita tildes
    .replace(/[^a-z0-9\s_-]/g, '')                     // solo letras, números, espacios, guiones
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50);
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const includeArchived = searchParams.get('include_archived') === '1';
    let q = getAdmin().from('utm_campaigns').select('*').order('created_at', { ascending: false });
    if (!includeArchived) q = q.eq('archived', false);
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
    const name = String(body?.name || '').trim();
    const description = String(body?.description || '').trim() || null;
    const created_by = String(body?.created_by || '').trim() || null;
    if (!name) return NextResponse.json({ error: 'name requerido' }, { status: 400 });

    let slug = toSlug(name);
    if (!slug) return NextResponse.json({ error: 'slug inválido' }, { status: 400 });

    // Si el slug ya existe, agrega sufijo numérico.
    let candidate = slug;
    let n = 2;
    while (true) {
      const { data: dup } = await getAdmin()
        .from('utm_campaigns').select('id').eq('slug', candidate).maybeSingle();
      if (!dup) break;
      candidate = `${slug}_${n}`;
      n++;
      if (n > 50) return NextResponse.json({ error: 'no fue posible generar slug único' }, { status: 500 });
    }

    const { data, error } = await getAdmin()
      .from('utm_campaigns')
      .insert({ name, slug: candidate, description, created_by, archived: false })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
