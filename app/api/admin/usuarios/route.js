import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req) {
  try {
    const { nombre, email, username, password, rol, modulos } = await req.json()
    if (!nombre?.trim() || !password?.trim() || (!email?.trim() && !username?.trim()))
      return NextResponse.json({ error: 'nombre, password y email o username son requeridos' }, { status: 400 })

    const authEmail = email?.trim()
      ? email.trim().toLowerCase()
      : `${username.trim().toLowerCase()}@sol.internal`
    const usernameClean = username?.trim().toLowerCase() || null

    if (usernameClean) {
      const { data: existe } = await supabaseAdmin.from('usuarios_sol').select('id').eq('username', usernameClean).maybeSingle()
      if (existe) return NextResponse.json({ error: 'Ese nombre de usuario ya existe' }, { status: 409 })
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password,
      email_confirm: true,
      user_metadata: { nombre: nombre.trim(), username: usernameClean }
    })
    if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })

    const auth_id = authData.user.id
    const { data, error } = await supabaseAdmin.from('usuarios_sol').insert([{
      auth_id, nombre: nombre.trim(), email: authEmail,
      username: usernameClean, rol: rol || 'bodega',
      activo: true, permisos_extra: modulos || null,
      creado_en: new Date().toISOString(),
    }]).select().single()

    if (error) {
      await supabaseAdmin.auth.admin.deleteUser(auth_id)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
