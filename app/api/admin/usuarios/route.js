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

    if (nueva_password) {
      const { data: usuario, error: fetchErr } = await supabaseAdmin
        .from('usuarios_sol')
        .select('auth_id')
        .eq('id', id)
        .single()

      if (fetchErr || !usuario?.auth_id)
        return NextResponse.json({ error: 'No se encontró auth_id para este usuario' }, { status: 400 })

      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(
        usuario.auth_id,
        { password: nueva_password }
      )
      if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

      if (Object.keys(campos).length === 0) return NextResponse.json({ ok: true })
    }

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

export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    // Obtener auth_id antes de borrar
    const { data: usuario, error: fetchErr } = await supabaseAdmin
      .from('usuarios_sol')
      .select('auth_id')
      .eq('id', id)
      .single()

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

    // Borrar de la tabla
    const { error: delErr } = await supabaseAdmin
      .from('usuarios_sol')
      .delete()
      .eq('id', id)

    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

    // Borrar de Auth si tiene auth_id
    if (usuario?.auth_id) {
      await supabaseAdmin.auth.admin.deleteUser(usuario.auth_id)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
