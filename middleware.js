import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

// Dominio del acortador público (CNAME → vercel-dns.com, agregado en Vercel).
// Configurable por env var SHORTENER_DOMAIN por si en el futuro se cambia.
const SHORTENER_HOST = (process.env.SHORTENER_DOMAIN || 'go.depositojimenezcr.com').toLowerCase();

// URL del e-commerce público — se usa como fallback cuando hay un slug
// inexistente o la ruta raíz.
const PUBLIC_SITE = 'https://depositojimenezcr.com';

// Subdominio público dedicado del Club del Enchapador. Su raíz sirve la página
// del club y TODO lo servido bajo este host es público (nunca pasa por el guard
// de sesión de SOL). Configurable por env var CLUB_DOMAIN.
const CLUB_HOST = (process.env.CLUB_DOMAIN || 'club.depositojimenez.com').toLowerCase();

// Subdominio público dedicado de la Rifa de Motos. Igual que el Club: su raíz
// sirve la página pública de la rifa y NUNCA pasa por el guard de sesión de SOL,
// para que el link que se comparte con clientes no exponga el dominio interno.
// Configurable por env var RIFA_DOMAIN.
const RIFA_HOST = (process.env.RIFA_DOMAIN || 'rifa.depositojimenez.com').toLowerCase();

// ────────────────────────────────────────────────────────────────────────────
// GUARD DE /api — segunda capa de defensa (la primera es requirePermiso /
// requireUserOrMachine dentro de cada route, ver lib/auth-server.js).
//
// Cubre cualquier ruta que hoy o mañana se olvide del guard. Verifica el JWT
// de la sesión LOCALMENTE con getClaims (JWKS, llaves asimétricas ES256), sin
// llamar a GoTrue por request, así no reaparece el rate limit / 504 que motivó
// dejar /api sin candado en el middleware.
//
// Reglas:
//  - Rutas públicas explícitas (login, página /marcar-interno) → pasan.
//  - Llamada de máquina (header x-sol-key o Authorization: Bearer <llave>) →
//    pasa al route, que valida la llave contra Supabase (esLlamadaDeMaquina).
//    Una llave falsa no sirve: el route la rechaza igual.
//  - Todo lo demás → sesión de SOL válida o 401.
// ────────────────────────────────────────────────────────────────────────────
const API_PUBLICAS = new Set([
  '/api/login',                          // así entra la gente a SOL
  '/api/metricas-web/mark-internal',     // página pública /marcar-interno
  '/api/metricas-web/internal-devices',  // página pública /marcar-interno
]);

function apiNoAutorizado() {
  return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
}

function traeLlaveDeMaquina(req) {
  const key = req.headers.get('x-sol-key')
    || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return !!key && key.length >= 40;
}

// ¿La request trae una sesión de SOL válida? Verificación local del JWT.
async function tieneSesionValida(req) {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { cookies: { getAll() { return req.cookies.getAll(); }, setAll() { /* solo lectura */ } } }
    );
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return false;
    const { data, error } = await supabase.auth.getClaims(session.access_token);
    return !error && !!data?.claims?.sub;
  } catch {
    return false;
  }
}

async function guardApi(req, pathname) {
  const pasar = () => NextResponse.next({ request: { headers: req.headers } });
  if (API_PUBLICAS.has(pathname)) return pasar();
  if (traeLlaveDeMaquina(req)) return pasar();
  return (await tieneSesionValida(req)) ? pasar() : apiNoAutorizado();
}

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

  // La página pública del Club se identifica por su ruta exacta (/club o /club/*).
  // La calculamos antes que nada porque el bloque del acortador trata CUALQUIER
  // path como slug: hay que exceptuar /club para que go.depositojimenezcr.com/club
  // sirva la página del club en vez de buscarla como link corto.
  const clubPath = req.nextUrl.pathname === '/club' || req.nextUrl.pathname.startsWith('/club/');
  // La Gran Rifa de Motos (/rifa o /rifa/*) es también una página PÚBLICA, con el
  // mismo tratamiento que el Club: sin sesión y sin el chrome de SOL.
  const rifaPath = req.nextUrl.pathname === '/rifa' || req.nextUrl.pathname.startsWith('/rifa/');

  if (host === SHORTENER_HOST && !clubPath && !rifaPath) {
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
  // RESTO DEL MIDDLEWARE.
  // Rutas que NO requieren chequeo de sesión: salimos antes de tocar Supabase
  // Auth. Es clave para /api y /_next, que se piden con mucha frecuencia
  // (polling del sidebar, prefetch de Next, assets). Llamar a getSession() en
  // cada una de esas requests dispara refresh de token contra GoTrue y, con
  // varios usuarios concurrentes, su rate limit ("Too many requests") hacía
  // que el middleware fallara y la app entera respondiera 504.
  // (Nota: /api nunca estuvo protegido por el middleware; cada route maneja su
  // propia auth, así que saltearlo acá no cambia la seguridad.)
  // ────────────────────────────────────────────────────────────────────────
  const { pathname } = req.nextUrl;

  // ────────────────────────────────────────────────────────────────────────
  // CLUB DEL ENCHAPADOR — página PÚBLICA.
  // /club (en cualquier dominio) y todo el subdominio club.depositojimenez.com
  // NO requieren sesión: el enchapador nunca debe ver el login. Marcamos la
  // respuesta con x-club-public para que el layout raíz la renderice sin el
  // chrome de SOL. En el subdominio, la raíz "/" se reescribe a /club (así no
  // dependemos de un rewrite en next.config).
  // OJO: /club es coincidencia EXACTA (clubPath) — el panel admin (/club-admin)
  // NO entra acá y queda protegido por el guard de abajo.
  // ────────────────────────────────────────────────────────────────────────
  if (host === CLUB_HOST || host === RIFA_HOST || clubPath || rifaPath) {
    // La rifa pública vive en su subdominio propio. Si alguien entra por /rifa en
    // CUALQUIER otro host (ej. sol.depositojimenez.com/rifa), lo mandamos al
    // subdominio para que el dominio interno de SOL nunca aparezca.
    if (rifaPath && host !== RIFA_HOST) {
      return NextResponse.redirect(new URL('/', `https://${RIFA_HOST}`), 307);
    }
    const h = new Headers(req.headers);
    h.set('x-club-public', '1');
    if (host === CLUB_HOST && (pathname === '/' || pathname === '')) {
      const url = req.nextUrl.clone();
      url.pathname = '/club';
      return NextResponse.rewrite(url, { request: { headers: h } });
    }
    if (host === RIFA_HOST && (pathname === '/' || pathname === '')) {
      const url = req.nextUrl.clone();
      url.pathname = '/rifa';
      return NextResponse.rewrite(url, { request: { headers: h } });
    }
    return NextResponse.next({ request: { headers: h } });
  }

  // Login: es una página PÚBLICA (no requiere sesión) pero, a diferencia del
  // resto, NO debe mostrar el chrome de SOL (sidebar/menú mobile). En pantallas
  // anchas (iPad en horizontal) el sidebar quedaba visible al costado del login
  // y, si había una sesión vieja todavía en cookies, listaba todos los módulos
  // y dejaba entrar sin volver a autenticarse. Marcamos la respuesta con
  // x-sol-login para que el layout raíz la renderice a pantalla completa, igual
  // que la página pública del Club.
  if (pathname.startsWith('/login')) {
    const h = new Headers(req.headers);
    h.set('x-sol-login', '1');
    return NextResponse.next({ request: { headers: h } });
  }

  // /api: sesión (o llave de máquina) obligatoria, con excepciones explícitas.
  if (pathname.startsWith('/api')) {
    return guardApi(req, pathname);
  }

  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/marcar-interno') ||
    pathname.startsWith('/s/')
  ) {
    return NextResponse.next({ request: { headers: req.headers } });
  }

  // Solo para páginas protegidas: validamos sesión (y de paso refrescamos las
  // cookies de sesión en la respuesta).
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
  // Techo de tiempo para Supabase Auth. Sin esto, si GoTrue tarda (rate limit,
  // o el disco de Supabase throttleado como el 4/9/2026), el middleware queda
  // colgado, se pasa del límite de 25s de Vercel y la app ENTERA responde 504:
  // pantalla gris para todo el equipo, en TODAS las pantallas a la vez.
  //
  // Ante demora dejamos pasar a propósito. No abre ninguna puerta: la página en
  // sí no trae datos, cada /api valida su propia sesión y la base tiene RLS.
  // El costo de dejar pasar es nulo; el de colgarse es la empresa parada.
  const TECHO_AUTH_MS = 3000;
  let session = null;
  try {
    const r = await Promise.race([
      supabase.auth.getSession(),
      new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('auth-lento')), TECHO_AUTH_MS)),
    ]);
    session = r?.data?.session ?? null;
  } catch {
    return res; // Auth no contestó a tiempo: que siga, la app se defiende sola.
  }
  if (!session) return NextResponse.redirect(new URL('/login', req.url));
  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-touch-icon.png).*)'],
};
