import { createClient } from '@supabase/supabase-js'

let _sb;
function getDb() { if (!_sb) _sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); return _sb; }

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    const nombre = formData.get('nombre')
    if (!file) return Response.json({ error: 'No file' }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const { error } = await getDb().storage
      .from('oc-pdfs')
      .upload(nombre, buffer, {
        contentType: 'application/pdf',
        upsert: true
      })

    if (error) return Response.json({ error: error.message }, { status: 500 })

    const { data } = getDb().storage.from('oc-pdfs').getPublicUrl(nombre)
    return Response.json({ ok: true, url: data.publicUrl })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
