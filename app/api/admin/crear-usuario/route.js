import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req) {
  try {
    const { nombre, email, username, password, rol } = await req.json()

    if (!nombre?.trim() || !password?.trim())
      return NextResponse.json({ error: 'nombre y password son requeridos' }, { status: 400 })
    if (!email?.trim() && !username?.trim())
      return NextResponse.json({ error: 'ingresá al menos email o username' }, { status: 400 })

    const authEmail = email?.trim()
      ? email.trim().toLowerCase()
      : `${username.trim().toLowerCase()}@sol.internal`
    const usernameClean = username?.trim().toLowerCase() || null

    // Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: password.trim(),
      email_confirm: true,
    })

    if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })

    const auth_id = authData.user.id

    // Insertar en usuarios_sol
    const { data, error } = await supabaseAdmin
      .from('usuarios_sol')
      .insert([{
        nombre: nombre.trim(),
        email: authEmail,
        username: usernameClean,
        auth_id,
        rol: rol || 'bodega',
        activo: true,
        creado_en: new Date().toISOString(),
      }])
      .select()
      .single()

    if (error) {
      // Rollback: borrar de Auth si falla la inserción
      await supabaseAdmin.auth.admin.deleteUser(auth_id)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
