import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// POST /api/admin/crear-usuario
export async function POST(req) {
  try {
    const { nombre, email, password, rol, modulos } = await req.json()

    if (!nombre?.trim() || !email?.trim() || !password?.trim()) {
      return NextResponse.json({ error: 'nombre, email y password son requeridos' }, { status: 400 })
    }

    // Verificar que no exista ya ese email
    const { data: existe } = await supabase
      .from('usuarios_sol')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (existe) {
      return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })
    }

    // Si vienen módulos personalizados los guardamos como permisos_extra explícitos
    // (todos los módulos con true/false según lo seleccionado)
    let permisos_extra = null
    if (modulos && typeof modulos === 'object') {
      permisos_extra = modulos
    }

    const { data, error } = await supabase
      .from('usuarios_sol')
      .insert([{
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        rol: rol || 'bodega',
        activo: true,
        permisos_extra,
        creado_en: new Date().toISOString(),
      }])
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })

  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
