import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Login de SOL, resuelto entero del lado del servidor.
//
// Antes la pantalla de login, para dejar entrar con usuario en vez de correo,
// le pedía el correo a /api/admin/usuarios. Cuando esa ruta pasó a exigir
// permiso de administrador (como corresponde), el login se quedó sin poder
// traducir el usuario y mostraba "Usuario no encontrado" a todo el que no
// escribiera su correo completo.
//
// La solución no es reabrir aquella ruta: devolver el correo de alguien a quien
// todavía no se identificó permite ir probando nombres y armarse la lista de
// correos del equipo. Acá el correo nunca sale: se resuelve adentro, se valida
// la contraseña y solo entonces se devuelve la sesión.
//
// El mensaje de error es SIEMPRE el mismo, exista el usuario o no, para que
// tampoco se pueda averiguar quién trabaja acá probando nombres.

let _admin
function admin() {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
  }
  return _admin
}

const RECHAZO = { error: 'Usuario o contraseña incorrectos.' }

export async function POST(request) {
  const { usuario, password } = await request.json().catch(() => ({}))
  const ingresado = String(usuario || '').trim()
  if (!ingresado || !password) return Response.json(RECHAZO, { status: 400 })

  // Si vino un correo se usa tal cual; si vino un nombre de usuario, se busca
  // su correo con la llave maestra (nunca se lo devolvemos a quien pregunta).
  let email = ingresado.toLowerCase()
  if (!ingresado.includes('@')) {
    const { data } = await admin()
      .from('usuarios_sol')
      .select('email, activo')
      .ilike('username', ingresado)
      .maybeSingle()
    if (!data?.email || data.activo === false) return Response.json(RECHAZO, { status: 401 })
    email = data.email
  }

  const { data: sesion, error } = await createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  ).auth.signInWithPassword({ email, password })

  if (error || !sesion?.session) return Response.json(RECHAZO, { status: 401 })

  // El navegador toma estos dos valores y arma la sesión (setSession), que es
  // lo que deja las cookies listas para el resto de SOL.
  return Response.json({
    access_token: sesion.session.access_token,
    refresh_token: sesion.session.refresh_token,
  })
}
