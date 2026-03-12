import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const { email, password, nombre, rol, permisos_extra } = await req.json();
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
    if (authError) return NextResponse.json({ ok:false, error: authError.message });
    const { error: dbError } = await supabaseAdmin.from('genesis_usuarios').insert([{ user_id: authData.user.id, email, nombre, rol, permisos_extra: permisos_extra||{}, activo:true }]);
    if (dbError) return NextResponse.json({ ok:false, error: dbError.message });
    return NextResponse.json({ ok:true });
  } catch(e) { return NextResponse.json({ ok:false, error: e.message }); }
}
