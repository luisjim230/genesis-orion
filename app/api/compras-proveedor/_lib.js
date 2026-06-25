// Helpers compartidos del módulo Compras a Proveedor.
// Todo el acceso a datos va por acá con el service_role key (bypassa RLS).
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const BUCKET = 'compras-proveedor'
export const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

let _sb
export function getDb() {
  if (!_sb) {
    _sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )
  }
  return _sb
}

export function ok(data, init) {
  return Response.json(data ?? { ok: true }, init)
}
export function bad(error, status = 400) {
  return Response.json({ error }, { status })
}
export function fail(error) {
  return Response.json({ error: String(error?.message || error) }, { status: 500 })
}

// Sube un PDF al bucket privado, calcula sha256, deduplica e inserta metadata
// en cp_archivos. Devuelve { archivo } o lanza { code, message }.
export async function subirPdf(file, { uploadedBy } = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new HttpError(400, 'Archivo PDF requerido.')
  }
  const tipo = file.type || ''
  const nombre = file.name || 'documento.pdf'
  if (tipo !== 'application/pdf' && !nombre.toLowerCase().endsWith('.pdf')) {
    throw new HttpError(400, 'El archivo debe ser un PDF.')
  }
  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.length === 0) throw new HttpError(400, 'El PDF está vacío.')
  if (buffer.length > MAX_BYTES) throw new HttpError(400, 'El PDF supera el máximo de 10 MB.')

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex')
  const db = getDb()

  // Defensa anti doble-carga: mismo contenido ya cargado.
  const { data: dup } = await db
    .from('cp_archivos')
    .select('id, nombre')
    .eq('sha256', sha256)
    .maybeSingle()
  if (dup) {
    throw new HttpError(409, `Este PDF ya fue cargado antes (archivo #${dup.id} · ${dup.nombre}).`)
  }

  const safe = nombre.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  const storagePath = `${new Date().getFullYear()}/${sha256.slice(0, 12)}_${safe}`

  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false })
  if (upErr) throw new HttpError(500, 'No se pudo subir el PDF: ' + upErr.message)

  const { data: archivo, error: insErr } = await db
    .from('cp_archivos')
    .insert({
      nombre,
      mime_type: 'application/pdf',
      tamano_bytes: buffer.length,
      storage_path: storagePath,
      sha256,
      uploaded_by: uploadedBy || null,
    })
    .select('*')
    .single()
  if (insErr) {
    // Rollback best-effort del objeto subido.
    await db.storage.from(BUCKET).remove([storagePath]).catch(() => {})
    throw new HttpError(500, 'No se pudo registrar el archivo: ' + insErr.message)
  }
  return archivo
}

// Sugerencia automática de match para una factura (sección 8.2 del spec).
// Devuelve { factura, sugerencia_fuerte, alternativas, todos_los_candidatos }.
export async function sugerenciasMatch(facturaId) {
  const db = getDb()
  const { data: factura } = await db.from('cp_facturas').select('*').eq('id', facturaId).maybeSingle()
  if (!factura) throw new HttpError(404, 'Factura no encontrada.')

  const desde = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
  const { data: pagos } = await db
    .from('cp_pagos')
    .select('id, monto, fecha_pago, referencia_bancaria, banco_origen, compra:cp_compras!inner(id,descripcion,cliente_nombre,proveedor_id), link:cp_factura_pago_link(id)')
    .eq('compra.proveedor_id', factura.proveedor_id)
    .gte('fecha_pago', desde)
    .order('fecha_pago', { ascending: false })

  const candidatos = (pagos || []).filter(p => !p.link || p.link.length === 0)
  const target = Number(factura.monto_total)

  let sugerencia_fuerte = null
  let alternativas = []
  const single = candidatos.find(p => Math.round(Number(p.monto) * 100) === Math.round(target * 100))
  if (single) {
    sugerencia_fuerte = [single.id]
  } else {
    const combos = combinacionesExactas(candidatos, target, 5)
    if (combos.length === 1) sugerencia_fuerte = combos[0]
    else if (combos.length > 1) alternativas = combos
  }
  return { factura, sugerencia_fuerte, alternativas, todos_los_candidatos: candidatos }
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// Envuelve un handler para convertir HttpError en respuesta JSON limpia.
export async function handle(fn) {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status })
    return fail(e)
  }
}

// Recalcula el estado de una compra vía la función SQL (atómico y reutilizable).
export async function recompute(compraId) {
  const { error } = await getDb().rpc('cp_recompute_estado', { p_compra_id: compraId })
  if (error) throw new HttpError(500, 'recompute_estado: ' + error.message)
}

// Subset-sum acotado: combinaciones de hasta `maxK` pagos cuya suma == target.
// Trabaja en centavos para evitar errores de punto flotante. Devuelve arrays
// de ids de pago.
export function combinacionesExactas(pagos, target, maxK = 5, maxResultados = 30) {
  const objetivo = Math.round(Number(target) * 100)
  const items = pagos.map(p => ({ id: p.id, c: Math.round(Number(p.monto) * 100) }))
  const out = []
  function rec(start, restantes, acumId, acumSum) {
    if (out.length >= maxResultados) return
    if (acumSum === objetivo && acumId.length > 0) { out.push([...acumId]); return }
    if (acumSum > objetivo || restantes === 0) return
    for (let i = start; i < items.length; i++) {
      const it = items[i]
      if (acumSum + it.c > objetivo) continue
      acumId.push(it.id)
      rec(i + 1, restantes - 1, acumId, acumSum + it.c)
      acumId.pop()
    }
  }
  rec(0, maxK, [], 0)
  return out
}
