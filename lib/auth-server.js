// Guard de sesión del lado del SERVIDOR para las rutas /api.
//
// Por qué existe: muchas rutas de SOL usan la service_role key, que ignora el
// RLS de la base. Sin este guard, cualquiera en internet que pegara la URL
// (/api/contabilidad/asientos, /api/admin/crear-usuario, …) recibía los datos
// o ejecutaba la acción sin estar logueado. El RLS no las protege: hay que
// validar la sesión acá.
//
// requireUser()          → hay sesión válida (JWT verificado contra Supabase)
// requirePermiso(modulo) → además, el usuario tiene ese módulo concedido
//
// Ambas devuelven { usuario } si pasa, o { response } con el 401/403 listo
// para devolver desde el route handler.

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { puedeVerModulo } from './permisos';

const NO_AUTORIZADO = { error: 'No autorizado' };

function denegar(status) {
  return Response.json(NO_AUTORIZADO, { status });
}

let _admin;
function admin() {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _admin;
}

// Lee la cookie de sesión y VERIFICA el token contra Supabase Auth.
// getUser() valida la firma del JWT en el servidor de auth: a diferencia de
// getSession(), no se puede falsificar desde el navegador.
export async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* los route handlers no refrescan cookies */ },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user || null;
}

// Perfil de SOL (rol + permisos_extra) del usuario autenticado. Se lee con
// service_role para que el RLS de usuarios_sol pueda quedar cerrado.
export async function getPerfilSol(user) {
  if (!user) return null;
  const db = admin();
  const porAuthId = await db.from('usuarios_sol').select('*').eq('auth_id', user.id).maybeSingle();
  if (porAuthId.data) return porAuthId.data;
  if (user.email) {
    const porEmail = await db.from('usuarios_sol').select('*').ilike('email', user.email).maybeSingle();
    if (porEmail.data) return porEmail.data;
  }
  return null;
}

// Exige sesión válida. Devuelve { usuario } o { response }.
export async function requireUser() {
  const user = await getAuthUser();
  if (!user) return { response: denegar(401) };
  const perfil = await getPerfilSol(user);
  if (!perfil) return { response: denegar(403) };
  if (perfil.activo === false) return { response: denegar(403) };
  return { usuario: { id: user.id, email: user.email, ...perfil } };
}

// Exige sesión válida Y permiso sobre el módulo. Devuelve { usuario } o { response }.
export async function requirePermiso(modulo) {
  const r = await requireUser();
  if (r.response) return r;
  if (!puedeVerModulo(r.usuario, modulo)) return { response: denegar(403) };
  return r;
}

// Exige que el usuario sea admin de SOL.
export async function requireAdmin() {
  const r = await requireUser();
  if (r.response) return r;
  if (r.usuario.rol !== 'admin') return { response: denegar(403) };
  return r;
}

// Azúcar para envolver un handler completo:
//   export const GET = conPermiso('contabilidad', async (req, ctx, usuario) => { … })
export function conPermiso(modulo, handler) {
  return async function (request, context) {
    const { usuario, response } = await requirePermiso(modulo);
    if (response) return response;
    return handler(request, context, usuario);
  };
}

export function conSesion(handler) {
  return async function (request, context) {
    const { usuario, response } = await requireUser();
    if (response) return response;
    return handler(request, context, usuario);
  };
}

// ── Llave de máquina ────────────────────────────────────────────────────────
// Algunas rutas las llaman procesos automáticos que no tienen sesión de
// usuario: el daemon de la Mac (/api/procesar-match, /api/refresh-all),
// el sync de Gmail (/api/contabilidad/procesar) y los workflows de GitHub
// (/api/*/alerts/daily). Esas no pueden pedir login, pero tampoco pueden quedar
// abiertas a internet: se identifican mandando la llave maestra en el header.
//
// La llave NO se compara contra una variable de entorno: cada lado la tiene
// guardada con otro nombre (SUPABASE_SERVICE_ROLE_KEY en Vercel y en la Mac,
// SUPABASE_SERVICE_KEY en GitHub Actions) y si los valores no coincidían, el
// proceso quedaba afuera con un 401. En vez de eso se PRUEBA contra Supabase:
// se usa la llave recibida para leer una tabla que solo la llave maestra puede
// leer. Si pasa, es una llave maestra válida de este proyecto, sin importar en
// qué variable esté guardada de cada lado.
//
// La respuesta se cachea 5 minutos para no pagar una consulta por request.

const CACHE_MS = 5 * 60 * 1000;
const cacheLlaves = new Map(); // llave → { valida, hasta }

function huella(k) {
  // Nunca guardamos la llave completa en memoria ni en logs.
  return k.slice(0, 12) + '…' + k.slice(-6);
}

async function llaveEsMaestra(llave) {
  const id = huella(llave);
  const cached = cacheLlaves.get(id);
  if (cached && cached.hasta > Date.now()) return cached.valida;

  let valida = false;
  try {
    // boveda_accesos tiene RLS activo y CERO políticas: solo la llave maestra
    // la lee. Cualquier otra llave recibe 401, así que sirve de piedra de toque.
    const r = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/boveda_accesos?select=id&limit=1`,
      { headers: { apikey: llave, Authorization: `Bearer ${llave}` }, cache: 'no-store' }
    );
    valida = r.ok;
  } catch {
    valida = false;
  }
  cacheLlaves.set(id, { valida, hasta: Date.now() + CACHE_MS });
  return valida;
}

export async function esLlamadaDeMaquina(request) {
  // Se lee del request si vino, y si no, de los headers de la request en curso.
  // El respaldo importa: varios handlers se declaran sin parámetro
  // (`export async function POST()`), y sin él el guard no veía la llave y
  // rechazaba al daemon con un 401.
  let h = request?.headers;
  if (!h || typeof h.get !== 'function') {
    try { h = await headers(); } catch { return false; }
  }
  const enviada = h.get('x-sol-key') || (h.get('authorization') || '').replace(/^Bearer\s+/i, '');
  // Un JWT de Supabase ronda los 200 caracteres; descartamos basura de entrada
  // sin gastar una consulta.
  if (!enviada || enviada.length < 40) return false;
  return llaveEsMaestra(enviada);
}

// Acepta sesión de usuario O llave de máquina. Para las rutas que usan las dos.
export async function requireUserOrMachine(request) {
  if (await esLlamadaDeMaquina(request)) {
    return { usuario: { id: 'maquina', rol: 'sistema', maquina: true } };
  }
  return requireUser();
}

export function conSesionOMaquina(handler) {
  return async function (request, context) {
    const { usuario, response } = await requireUserOrMachine(request);
    if (response) return response;
    return handler(request, context, usuario);
  };
}
