// Acortador de URLs propio.
// POST con body { target_url, utm_source?, utm_medium?, utm_campaign?, utm_content?,
//                 product_name?, created_by? }
// Devuelve { ok, slug, short_url, target_url }.
//
// El slug es un string alfanumérico de 6 caracteres. Si colisiona, se reintenta
// hasta 5 veces con slugs nuevos.
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

const ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789'; // sin 0,O,1,l,i para evitar confusión visual.
function genSlug(len = 6) {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const target_url = String(body?.target_url || '').trim();
    if (!target_url) return NextResponse.json({ error: 'target_url requerido' }, { status: 400 });

    // Validación mínima de URL.
    try { new URL(target_url); } catch {
      return NextResponse.json({ error: 'target_url inválido' }, { status: 400 });
    }

    const meta = {
      utm_source:   body?.utm_source   ? String(body.utm_source).trim()   : null,
      utm_medium:   body?.utm_medium   ? String(body.utm_medium).trim()   : null,
      utm_campaign: body?.utm_campaign ? String(body.utm_campaign).trim() : null,
      utm_content:  body?.utm_content  ? String(body.utm_content).trim()  : null,
      product_name: body?.product_name ? String(body.product_name).trim() : null,
      created_by:   body?.created_by   ? String(body.created_by).trim()   : null,
    };

    // Reintentar hasta 5 veces con slugs nuevos si colisiona.
    let slug = '';
    let inserted = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      slug = genSlug(6);
      const { data, error } = await getAdmin()
        .from('short_links')
        .insert({ slug, target_url, ...meta })
        .select()
        .single();
      if (!error) { inserted = data; break; }
      // 23505 = unique violation.
      if (error.code !== '23505') {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
    if (!inserted) return NextResponse.json({ error: 'no fue posible generar slug único' }, { status: 500 });

    // Construcción del short_url:
    // - Por default, dominio del acortador go.depositojimenezcr.com (CNAME en Vercel).
    // - Si por algún motivo SHORTENER_DOMAIN no está configurado, usamos el host de
    //   la request actual (típicamente sol.depositojimenez.com con prefijo /s/).
    //   Esto mantiene compatibilidad histórica con cualquier consumidor previo.
    const shortenerDomain = (process.env.SHORTENER_DOMAIN || 'go.depositojimenezcr.com').trim();
    let short_url;
    if (shortenerDomain) {
      short_url = `https://${shortenerDomain}/${inserted.slug}`;
    } else {
      const origin = req.headers.get('x-forwarded-host')
        ? `https://${req.headers.get('x-forwarded-host')}`
        : new URL(req.url).origin;
      short_url = `${origin}/s/${inserted.slug}`;
    }
    return NextResponse.json({
      ok: true,
      slug: inserted.slug,
      short_url,
      target_url: inserted.target_url,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
