// Helpers compartidos del módulo Devoluciones (control de devoluciones de
// dinero a clientes). Todo el acceso a datos va por acá con el service_role
// key (bypassa RLS). Las tablas tienen datos bancarios, por eso el navegador
// nunca las consulta directo: siempre pasa por estas rutas.
import { createClient } from '@supabase/supabase-js'

export const BUCKET = 'recibos-devoluciones'
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

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export function bad(error, status = 400) {
  return Response.json({ error }, { status })
}
export function fail(error) {
  return Response.json({ error: String(error?.message || error) }, { status: 500 })
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

// ── Normalización y validación de los datos bancarios ────────────────────
export function limpiarSinpe(v) {
  return String(v || '').replace(/[\s\-()]/g, '')
}
export function limpiarIban(v) {
  return String(v || '').replace(/\s/g, '').toUpperCase()
}

// Valida y normaliza el payload de una devolución. Devuelve el objeto limpio o
// lanza HttpError con el primer problema encontrado. `parcial` permite editar
// sin re-enviar todos los campos (no se usa hoy, se valida siempre completo).
export function validarDevolucion(input) {
  const out = {}

  const nombre = String(input.cliente_nombre || '').trim()
  if (nombre.length < 3) throw new HttpError(400, 'El nombre del cliente debe tener al menos 3 caracteres.')
  out.cliente_nombre = nombre

  out.cliente_identificacion = String(input.cliente_identificacion || '').trim() || null

  // Titular de la cuenta / SINPE al que se hace el reintegro. Obligatorio: es el
  // dato que Marcela necesita para saber a nombre de quién sale la plata.
  const titular = String(input.titular_cuenta || '').trim()
  if (titular.length < 3) throw new HttpError(400, 'Indicá el nombre del titular de la cuenta o SINPE (mínimo 3 caracteres).')
  out.titular_cuenta = titular

  // Motivo explícito de la devolución. Obligatorio.
  const motivo = String(input.motivo || '').trim()
  if (motivo.length < 5) throw new HttpError(400, 'Indicá el motivo de la devolución (mínimo 5 caracteres).')
  out.motivo = motivo

  const monto = Number(input.monto)
  if (!Number.isFinite(monto) || monto <= 0) throw new HttpError(400, 'El monto debe ser mayor a 0.')
  // Máximo 2 decimales.
  if (Math.round(monto * 100) !== Number((monto * 100).toFixed(4))) {
    throw new HttpError(400, 'El monto no puede tener más de 2 decimales.')
  }
  out.monto = Math.round(monto * 100) / 100

  const moneda = String(input.moneda || 'CRC').toUpperCase()
  if (!['CRC', 'USD'].includes(moneda)) throw new HttpError(400, 'Moneda inválida (solo CRC o USD).')
  out.moneda = moneda

  const metodo = String(input.metodo || '')
  if (!['sinpe_movil', 'transferencia'].includes(metodo)) {
    throw new HttpError(400, 'Método de reintegro inválido.')
  }
  out.metodo = metodo

  if (metodo === 'sinpe_movil') {
    const sinpe = limpiarSinpe(input.sinpe_numero)
    if (!/^\d{8}$/.test(sinpe)) throw new HttpError(400, 'El número SINPE Móvil debe tener exactamente 8 dígitos.')
    out.sinpe_numero = sinpe
    out.iban = null
    out.banco = null
  } else {
    const iban = limpiarIban(input.iban)
    if (!/^CR\d{20}$/.test(iban)) throw new HttpError(400, 'La cuenta IBAN debe ser CR seguido de 20 dígitos.')
    out.iban = iban
    out.sinpe_numero = null
    out.banco = String(input.banco || '').trim() || null
  }

  out.referencia_erp = String(input.referencia_erp || '').trim() || null
  // Número de Nota de Crédito (NC) asociada, si aplica. Opcional.
  out.nota_credito = String(input.nota_credito || '').trim() || null
  out.notas = String(input.notas || '').trim() || null

  return out
}

// Sube un PDF al bucket privado. Devuelve { path, nombre } o lanza HttpError.
export async function subirRecibo(file, devolucionId) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new HttpError(400, 'Debés adjuntar el PDF del recibo.')
  }
  const tipo = file.type || ''
  const nombre = file.name || 'recibo.pdf'
  if (tipo !== 'application/pdf' && !nombre.toLowerCase().endsWith('.pdf')) {
    throw new HttpError(400, 'El recibo debe ser un archivo PDF.')
  }
  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.length === 0) throw new HttpError(400, 'El PDF está vacío.')
  if (buffer.length > MAX_BYTES) throw new HttpError(400, 'El PDF supera el máximo de 10 MB.')

  const safe = nombre.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  const stamp = `${new Date().toISOString().replace(/[:.]/g, '-')}`
  const path = `${devolucionId}/${stamp}-${safe}`

  const { error } = await getDb().storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: 'application/pdf', upsert: false })
  if (error) throw new HttpError(500, 'No se pudo subir el PDF: ' + error.message)

  return { path, nombre }
}

// Registra un cambio de estado en el historial (auditoría). Best-effort.
export async function registrarHistorial(devolucionId, anterior, nuevo, detalle, actor) {
  await getDb().from('devoluciones_historial').insert({
    devolucion_id: devolucionId,
    estado_anterior: anterior,
    estado_nuevo: nuevo,
    detalle: detalle || null,
    usuario: actor?.nombre || null,
    usuario_id: actor?.id || null,
  })
}

// Formatea un monto con símbolo de moneda para mensajes (Telegram, etc.).
export function fmtMoneda(monto, moneda) {
  try {
    return new Intl.NumberFormat('es-CR', { style: 'currency', currency: moneda }).format(Number(monto))
  } catch {
    return `${moneda} ${Number(monto).toFixed(2)}`
  }
}
