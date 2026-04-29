// Redirect público de un short link.
// GET /s/{slug} → 302 Location: target_url + incrementa contador de clicks.
// Si el slug no existe, 404.
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

export async function GET(_req, { params }) {
  try {
    const { slug } = await params;
    if (!slug) return NextResponse.json({ error: 'slug requerido' }, { status: 400 });

    const { data, error } = await getAdmin()
      .from('short_links')
      .select('target_url')
      .eq('slug', slug)
      .maybeSingle();

    if (error) {
      return new NextResponse('Error', { status: 500 });
    }
    if (!data) {
      return new NextResponse(`Short link "${slug}" no encontrado.`, { status: 404 });
    }

    // Incrementar clicks de manera no bloqueante.
    getAdmin().rpc('increment_short_link_clicks', { p_slug: slug }).then(() => {}, () => {});

    return NextResponse.redirect(data.target_url, 302);
  } catch (e) {
    return new NextResponse(`Error: ${e.message}`, { status: 500 });
  }
}
