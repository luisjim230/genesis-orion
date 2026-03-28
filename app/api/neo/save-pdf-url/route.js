import { createClient } from '@supabase/supabase-js'

let _sb;
function getDb() { if (!_sb) _sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); return _sb; }

export async function POST(req) {
  const { numero_sol, pdf_url } = await req.json()
  if (!numero_sol || !pdf_url) return Response.json({ error: 'faltan datos' }, { status: 400 })
  const { error } = await getDb().from('cola_neo_uploads').update({ pdf_url }).eq('numero_sol', numero_sol)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
