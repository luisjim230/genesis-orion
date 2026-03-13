import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url)
    const username = searchParams.get('username')

    let query = supabaseAdmin
      .from('usuarios_sol')
      .select('*')
      .order('creado_en', { ascending: false })

    if (username) {
      query = query.eq('username', username.toLowerCase())
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    const body = await req.json()
    const { id, nueva_password, ...campos } = body

    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    // Si viene nueva_password, actualizarla en Auth
    if (nueva_password) {
      // Buscar auth_id del usuario
      const { data: usuario, error: fetchErr } = await supabaseAdmin
        .from('usuarios_sol')
        .select('auth_id')
        .eq('id', id)
        .single()

      if (fetchErr || !usuario?.auth_id) {
        return NextResponse.json({ error: 'No se encontró auth_id para este usuario' }, { status: 400 })
      }

      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(
        usuario.auth_id,
        { password: nueva_password }
      )
      if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

      // Si solo era cambio de password, retornar éxito
      if (Object.keys(campos).length === 0) {
        return NextResponse.json({ ok: true })
      }
    }

    // Actualizar campos en usuarios_sol
    const { error } = await supabaseAdmin
      .from('usuarios_sol')
      .update(campos)
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
