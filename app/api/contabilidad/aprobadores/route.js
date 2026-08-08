import { getDb, ok, bad, handle, esAdmin, bitacoraCatalogo } from '../_lib'

export const dynamic = 'force-dynamic'

const ROLES = ['capturador', 'aprobador', 'admin']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// GET /api/contabilidad/aprobadores?actor=email  (solo admin)
export async function GET(request) {
  return handle(async () => {
    const actor = new URL(request.url).searchParams.get('actor')
    if (!(await esAdmin(actor))) return bad('Solo un admin puede ver los aprobadores.', 403)
    const { data, error } = await getDb().from('conta_aprobadores').select('*').order('nombre')
    if (error) throw error
    return ok(data || [])
  })
}

// POST /api/contabilidad/aprobadores
//   { actor, accion: 'crear'|'editar'|'toggle', ... }   (solo admin)
export async function POST(request) {
  return handle(async () => {
    const db = getDb()
    const b = await request.json().catch(() => ({}))
    if (!(await esAdmin(b.actor))) return bad('Solo un admin puede gestionar aprobadores.', 403)

    // Cuántos admin activos hay (para proteger al último)
    async function adminsActivos() {
      const { data } = await db.from('conta_aprobadores').select('id,email').eq('rol', 'admin').eq('activo', true)
      return data || []
    }

    if (b.accion === 'crear') {
      const email = (b.email || '').trim().toLowerCase()
      const nombre = (b.nombre || '').trim()
      const rol = b.rol
      if (!EMAIL_RE.test(email)) return bad('Email inválido.')
      if (!nombre) return bad('El nombre es obligatorio.')
      if (!ROLES.includes(rol)) return bad('Rol inválido.')
      const { data: dup } = await db.from('conta_aprobadores').select('id').eq('email', email).maybeSingle()
      if (dup) return bad('Ya existe un aprobador con ese email.')
      const { data, error } = await db.from('conta_aprobadores').insert({
        email, nombre, rol,
        monto_maximo: b.monto_maximo === '' || b.monto_maximo == null ? null : Number(b.monto_maximo),
        activo: b.activo !== false,
      }).select('*').single()
      if (error) throw error
      await bitacoraCatalogo('aprobador_creado', b.actor, { email, nombre, rol })
      return ok(data)
    }

    if (b.accion === 'editar') {
      const { data: actual } = await db.from('conta_aprobadores').select('*').eq('id', b.id).maybeSingle()
      if (!actual) return bad('Aprobador no encontrado.')
      const upd = {}
      if ('email' in b) {
        const email = (b.email || '').trim().toLowerCase()
        if (!EMAIL_RE.test(email)) return bad('Email inválido.')
        if (email !== actual.email) {
          const { data: dup } = await db.from('conta_aprobadores').select('id').eq('email', email).maybeSingle()
          if (dup) return bad('Ya existe un aprobador con ese email.')
        }
        upd.email = email
      }
      if ('nombre' in b) { if (!b.nombre?.trim()) return bad('El nombre es obligatorio.'); upd.nombre = b.nombre.trim() }
      if ('rol' in b) { if (!ROLES.includes(b.rol)) return bad('Rol inválido.'); upd.rol = b.rol }
      if ('monto_maximo' in b) upd.monto_maximo = b.monto_maximo === '' || b.monto_maximo == null ? null : Number(b.monto_maximo)
      if ('activo' in b) upd.activo = b.activo

      // Protecciones sobre el rol admin
      const quitaAdmin = actual.rol === 'admin' && (('rol' in b && b.rol !== 'admin') || ('activo' in b && b.activo === false))
      if (quitaAdmin) {
        if (actual.email === (b.actor || '').toLowerCase()) return bad('No podés quitarte a vos mismo el rol admin.')
        const admins = await adminsActivos()
        if (admins.length <= 1 && admins.some((a) => a.id === actual.id)) return bad('No se puede dejar el sistema sin admin activo.')
      }

      const { data, error } = await db.from('conta_aprobadores').update(upd).eq('id', b.id).select('*').single()
      if (error) throw error
      await bitacoraCatalogo('aprobador_editado', b.actor, { id: b.id, cambios: upd })
      return ok(data)
    }

    if (b.accion === 'toggle') {
      const { data: actual } = await db.from('conta_aprobadores').select('*').eq('id', b.id).maybeSingle()
      if (!actual) return bad('Aprobador no encontrado.')
      const nuevo = b.activo !== false
      if (!nuevo && actual.rol === 'admin') {
        if (actual.email === (b.actor || '').toLowerCase()) return bad('No podés desactivarte a vos mismo.')
        const admins = await adminsActivos()
        if (admins.length <= 1 && admins.some((a) => a.id === actual.id)) return bad('No se puede desactivar el último admin activo.')
      }
      const { data, error } = await db.from('conta_aprobadores').update({ activo: nuevo }).eq('id', b.id).select('*').single()
      if (error) throw error
      await bitacoraCatalogo(nuevo ? 'aprobador_activado' : 'aprobador_desactivado', b.actor, { id: b.id, email: actual.email })
      return ok(data)
    }

    return bad('Acción no reconocida.')
  })
}
