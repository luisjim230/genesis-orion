import { getDb, ok, handle } from '../../_lib'

export const dynamic = 'force-dynamic'

// PATCH /api/compras-proveedor/alertas/:id  (resuelta = true/false)
export async function PATCH(request, { params }) {
  return handle(async () => {
    const { id } = await params
    const b = await request.json().catch(() => ({}))
    const resuelta = b.resuelta !== false
    const { data, error } = await getDb()
      .from('cp_alertas')
      .update({ resuelta, resuelta_at: resuelta ? new Date().toISOString() : null })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return ok(data)
  })
}
