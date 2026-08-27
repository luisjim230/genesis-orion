import { requirePermiso } from '../../../../../../lib/auth-server'
import { ok, handle, sugerenciasMatch } from '../../../_lib'

export const dynamic = 'force-dynamic'

// GET /api/compras-proveedor/facturas/:id/sugerencias-match
export async function GET(_request, { params }) {
  const _g = await requirePermiso('compras-proveedor'); if (_g.response) return _g.response;

  return handle(async () => {
    const { id } = await params
    const sug = await sugerenciasMatch(id)
    return ok(sug)
  })
}
