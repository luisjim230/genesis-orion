import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

// Dominio del acortador público (CNAME → vercel-dns.com, agregado en Vercel).
// Configurable por env var SHORTENER_DOMAIN por si en el futuro se cambia.
const SHORTENER_HOST = (process.env.SHORTENER_DOMAIN || 'go.depositojimenezcr.com').toLowerCase();

// URL del e-commerce público — se usa como fallback cuando hay un slug
// inexistente o la ruta raíz.
const PUBLIC_SITE = 'https://depositojimenezcr.com';

export async function middleware(req) {
  // ────────────────────────────────────────────────────────────────────────
  // CHECK ESPECIAL: dominio del acortador.
  // Si el host es go.depositojimenezcr.com, manejamos el path como un slug
  // y redirigimos al target. Esto se evalúa ANTES de cualquier otra lógica
  // de la app interna, así no hay riesgo de afectar sol.depositojimenez.com.
  // Para CUALQUIER otro host, este bloque no hace nada y cae al middleware
  // existente que sigue idéntico abajo.
  // ────────────────────────────────────────────────────────────────────────
  const host = (req.headers.get('host') || '').toLowerCase().split(':')[0];
  if (host === SHORTENER_HOST) {
    const pathname = req.nextUrl.pathname;

    // Path raíz → e-commerce.
    if (pathname === '/' || pathname === '') {
      return NextResponse.redirect(`${PUBLIC_SITE}/`, 302);
    }

    // Primer segmento del path = slug.
    const slug = pathname.slice(1).split('/')[0].trim();
    if (!slug) {
      return NextResponse.redirect(`${PUBLIC_SITE}/?error=link_invalido`, 302);
    }

    // Lookup en short_links via Supabase REST. Usamos el service role para
    // evitar el RLS de la tabla (igual que la ruta /s/[slug] existente).
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceKey) {
        return NextResponse.redirect(`${PUBLIC_SITE}/?error=link_invalido`, 302);
      }

      const lookupUrl = `${supabaseUrl}/rest/v1/short_links?slug=eq.${encodeURIComponent(slug)}&select=target_url&limit=1`;
      const r = await fetch(lookupUrl, {
        cache: 'no-store',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
        },
      });
      if (!r.ok) {
        return NextResponse.redirect(`${PUBLIC_SITE}/?error=link_invalido`, 302);
      }
      const data = await r.json();
      const target = Array.isArray(data) && data[0]?.target_url;
      if (!target) {
        return NextResponse.redirect(`${PUBLIC_SITE}/?error=link_invalido`, 302);
      }

      // Best-effort: incrementar contador de clicks. No bloqueamos el redirect.
      fetch(`${supabaseUrl}/rest/v1/rpc/increment_short_link_clicks`, {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_slug: slug }),
      }).catch(() => {});

      return NextResponse.redirect(target, 302);
    } catch {
      return NextResponse.redirect(`${PUBLIC_SITE}/?error=link_invalido`, 302);
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // RESTO DEL MIDDLEWARE: lógica original sin cambios.
  // Aplica a sol.depositojimenez.com y a cualquier otro host (preview, dev).
  // ────────────────────────────────────────────────────────────────────────
  let res = NextResponse.next({ request: { headers: req.headers } });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return req.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          res = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
        },
      },
    }
  );
  const { data: { session } } = await supabase.auth.getSession();
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/login') || pathname.startsWith('/_next') || pathname.startsWith('/api') || pathname.startsWith('/marcar-interno') || pathname.startsWith('/s/')) return res;
  if (!session) return NextResponse.redirect(new URL('/login', req.url));
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-touch-icon.png).*)'],
};
