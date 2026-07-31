import crypto from 'crypto'
import { getDb, handle, HttpError, validarDevolucion, subirRecibo, registrarHistorial, BUCKET } from './_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// GET /api/devoluciones — lista con filtros.
// Query params: estado, metodo, moneda, desde, hasta, q (cliente / ref ERP).
export async function GET(request) {
  return handle(async () => {
    const sp = new URL(request.url).searchParams
    const db = getDb()
    let query = db.from('devoluciones').select('*')

    const estado = sp.get('estado')
    if (estado && estado !== 'todos') query = query.eq('estado', estado)
    const metodo = sp.get('metodo')
    if (metodo && metodo !== 'todos') query = query.eq('metodo', metodo)
    const moneda = sp.get('moneda')
    if (moneda && moneda !== 'todos') query = query.eq('moneda', moneda)
    const desde = sp.get('desde')
    if (desde) query = query.gte('creado_en', desde)
    const hasta = sp.get('hasta')
    if (hasta) query = query.lte('creado_en', hasta + 'T23:59:59')
    const q = (sp.get('q') || '').trim()
    if (q) query = query.or(`cliente_nombre.ilike.%${q}%,referencia_erp.ilike.%${q}%`)

    const { data, error } = await query.order('creado_en', { ascending: false })
    if (error) throw new HttpError(500, error.message)

    // Ordenar: pendientes primero, luego el resto por fecha desc (ya viene desc).
    const orden = { pendiente: 0, rechazada: 1, pagada: 2, anulada: 3 }
    const filas = (data || []).sort((a, b) => {
      const d = (orden[a.estado] ?? 9) - (orden[b.estado] ?? 9)
      if (d !== 0) return d
      return new Date(b.creado_en) - new Date(a.creado_en)
    })

    // Totales para las tarjetas de resumen.
    const inicioMes = new Date()
    inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)
    const resumen = {
      pendiente_crc: 0, pendiente_usd: 0, cant_pendientes: 0,
      pagado_mes_crc: 0, pagado_mes_usd: 0,
    }
    for (const d of filas) {
      if (d.estado === 'pendiente') {
        resumen.cant_pendientes++
        if (d.moneda === 'USD') resumen.pendiente_usd += Number(d.monto)
        else resumen.pendiente_crc += Number(d.monto)
      }
      if (d.estado === 'pagada' && d.pagado_en && new Date(d.pagado_en) >= inicioMes) {
        if (d.moneda === 'USD') resumen.pagado_mes_usd += Number(d.monto)
        else resumen.pagado_mes_crc += Number(d.monto)
      }
    }

    return Response.json({ ok: true, devoluciones: filas, resumen })
  })
}

// POST /api/devoluciones — crear devolución (contador). Multipart form-data.
export async function POST(request) {
  return handle(async () => {
    const form = await request.formData()
    const file = form.get('recibo')
    const actor = { nombre: form.get('actor_nombre') || null, id: form.get('actor_id') || null }

    const datos = validarDevolucion({
      cliente_nombre: form.get('cliente_nombre'),
      cliente_identificacion: form.get('cliente_identificacion'),
      titular_cuenta: form.get('titular_cuenta'),
      motivo: form.get('motivo'),
      monto: form.get('monto'),
      moneda: form.get('moneda'),
      metodo: form.get('metodo'),
      sinpe_numero: form.get('sinpe_numero'),
      iban: form.get('iban'),
      banco: form.get('banco'),
      referencia_erp: form.get('referencia_erp'),
      nota_credito: form.get('nota_credito'),
      notas: form.get('notas'),
    })

    const db = getDb()
    const id = crypto.randomUUID()

    // 1) Subir el PDF primero (si falla, no se crea el registro).
    const recibo = await subirRecibo(file, id)

    // 2) Insertar la fila. Si falla, limpiar el PDF ya subido.
    const { data, error } = await db.from('devoluciones').insert({
      id,
      ...datos,
      recibo_path: recibo.path,
      recibo_nombre: recibo.nombre,
      estado: 'pendiente',
      creado_por: actor.nombre,
      creado_por_id: actor.id,
    }).select('*').single()

    if (error) {
      await db.storage.from(BUCKET).remove([recibo.path]).catch(() => {})
      throw new HttpError(500, 'No se pudo registrar la devolución: ' + error.message)
    }

    await registrarHistorial(id, null, 'pendiente', 'Devolución creada', actor)
    return Response.json({ ok: true, devolucion: data })
  })
}
