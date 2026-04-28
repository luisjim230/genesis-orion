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
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);
    const source = searchParams.get('source') || '';
    const campaign = searchParams.get('campaign') || '';
    const search = searchParams.get('search') || '';
    let q = getAdmin()
      .from('utm_links_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (source) q = q.eq('utm_source', source);
    if (campaign) q = q.eq('utm_campaign', campaign);
    if (search) q = q.ilike('product_name', `%${search}%`);
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
    const required = ['base_url', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'final_url'];
    for (const k of required) {
      if (!body?.[k]) return NextResponse.json({ error: `${k} requerido` }, { status: 400 });
    }
    const row = {
      base_url:     String(body.base_url).trim(),
      utm_source:   String(body.utm_source).trim(),
      utm_medium:   String(body.utm_medium).trim(),
      utm_campaign: String(body.utm_campaign).trim(),
      utm_content:  String(body.utm_content).trim(),
      final_url:    String(body.final_url).trim(),
      created_by:   body.created_by ? String(body.created_by).trim() : null,
      product_name: body.product_name ? String(body.product_name).trim() : null,
    };
    const { data, error } = await getAdmin()
      .from('utm_links_history').insert(row).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
