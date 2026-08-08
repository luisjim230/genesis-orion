'use client'
import { useEffect, useState, useCallback } from 'react'

// ── Paleta Depósito Jiménez ──────────────────────────────────────────────────
export const C = {
  naranja: '#ED6E2E',
  vino: '#5E2733',
  petroleo: '#225F74',
  crema: '#FDF4F4',
  verde: '#15803d',
  rojo: '#b91c1c',
  ambar: '#b45309',
  ambarBg: '#fef3c7',
  gris: '#6b7280',
  grisClaro: '#9ca3af',
  borde: 'rgba(94,39,51,0.12)',
  bordeFuerte: 'rgba(94,39,51,0.25)',
}

export const fontTitulo = "'Bungee', cursive"
export const fontMono = "'Rubik', ui-monospace, monospace"

// ── Formato de moneda: ₡16.025,00 (colón, miles con punto, decimales con coma)
export function fmtCRC(n, moneda = 'CRC') {
  const v = Number(n) || 0
  const s = v.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const simbolo = moneda === 'USD' ? '$' : '₡'
  return simbolo + s
}
export function fmtNum(n, dec = 0) {
  return (Number(n) || 0).toLocaleString('es-CR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}
export function fmtFecha(d) {
  if (!d) return '—'
  const s = String(d)
  const dt = new Date(s.length <= 10 ? s + 'T00:00:00' : s)
  return isNaN(dt) ? s : dt.toLocaleDateString('es-CR')
}
export function fmtFechaHora(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt) ? String(d) : dt.toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'short' })
}
export function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}
export function r2(n) { return Math.round((Number(n) || 0) * 100) / 100 }

// ── Detección de Mac para mostrar ⌘ o Ctrl ───────────────────────────────────
export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '')
export const MOD = isMac ? '⌘' : 'Ctrl'

// ── Fetch helper ─────────────────────────────────────────────────────────────
const API = '/api/contabilidad'
export async function api(path, opts = {}) {
  const res = await fetch(API + path, opts)
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) {
    if (!res.ok) throw new Error(`Error ${res.status}`)
    return res
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`)
  return data
}

// ── Hook de catálogos (cuentas, centros, proveedores, reglas, plantillas, rol)
export function useCatalogos(email) {
  const [cat, setCat] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const recargar = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await api('/catalogos' + (email ? `?email=${encodeURIComponent(email)}` : ''))
      setCat(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [email])

  useEffect(() => { recargar() }, [recargar])
  return { cat, loading, error, recargar }
}

// ── Índice de cuentas: mapa código -> cuenta, y agrupación por título padre ───
export function indexCuentas(cuentas) {
  const porCodigo = new Map()
  for (const c of cuentas || []) porCodigo.set(c.codigo, c)
  return porCodigo
}

// Nombre del título padre imputable de una cuenta (para agrupar en el combobox)
export function tituloPadre(porCodigo, cuenta) {
  let cur = cuenta
  let guard = 0
  while (cur && cur.codigo_padre && guard++ < 10) {
    const padre = porCodigo.get(cur.codigo_padre)
    if (!padre) break
    if (!padre.imputable) return padre.nombre
    cur = padre
  }
  return cuenta?.tipo || 'Otras'
}

export function nombreCuenta(porCodigo, codigo) {
  const c = porCodigo.get(codigo)
  return c ? `${c.codigo} · ${c.nombre}` : (codigo || '—')
}

// Cuenta placeholder para gasto sin clasificar (imputable=false).
export const CUENTA_SIN_CLASIFICAR = '00-SIN-CLASIFICAR'

// ── Constructores de items para los comboboxes ───────────────────────────────
// Este módulo es SOLO para gastos: solo se ofrecen cuentas
// imputable=true AND activa=true AND permitida_en_gastos=true.
// priority = códigos "más usados" por el proveedor (van arriba).
export function buildItemsCuentas(cuentas, priority = []) {
  const porCodigo = indexCuentas(cuentas)
  const prio = new Set(priority.filter(Boolean))
  return (cuentas || [])
    .filter((c) => c.imputable && c.activa && c.permitida_en_gastos)
    .map((c) => {
      const grupo = tituloPadre(porCodigo, c)
      return {
        value: c.codigo,
        main: c.nombre,                                   // 1ª línea: el nombre (se envuelve)
        sub: `${c.codigo} · ${c.tipo}${grupo ? ' · ' + grupo : ''}`, // 2ª línea: apoyo
        display: `${c.codigo} · ${c.nombre}`,             // texto del disparador
        group: grupo,
        keywords: c.codigo + ' ' + c.nombre + ' ' + (c.tipo || ''),
        priority: prio.has(c.codigo) ? 10 : 0,
        veces: 0,
      }
    })
}
export function buildItemsCentros(centros, priority = []) {
  const prio = new Set(priority.filter(Boolean))
  return (centros || [])
    .filter((c) => c.activo)
    .map((c) => ({
      value: c.id,
      main: c.nombre_neo,
      sub: c.cedula ? `Cédula ${c.cedula}` : '',
      keywords: c.nombre_neo + ' ' + (c.cedula || ''),
      priority: prio.has(c.id) ? 10 : 0,
      veces: 0,
    }))
}
export function buildItemsProveedores(proveedores, priority = []) {
  const prio = new Set(priority.filter(Boolean))
  return (proveedores || []).map((p) => ({
    value: p.id,
    main: p.nombre,
    sub: `${p.cedula || 'sin cédula'} · ${p.cuenta_sugerida || 'sin cuenta'} · visto ${p.veces_visto || 0} veces`,
    keywords: p.nombre + ' ' + (p.cedula || ''),
    priority: prio.has(p.id) ? 10 : 0,
    veces: p.veces_visto || 0,
  }))
}

// ── Estados / semáforo ───────────────────────────────────────────────────────
export const ESTADO_META = {
  borrador:     { label: 'Borrador',     icon: '📝', color: C.gris },
  aprobado:     { label: 'Aprobado',     icon: '⏳', color: C.petroleo, hint: 'esperando al robot' },
  enviando:     { label: 'Enviando',     icon: '🔄', color: C.naranja, hint: 'el robot está subiéndolo' },
  sincronizado: { label: 'En NEO',       icon: '📤', color: C.petroleo, hint: 'el robot lo subió a NEO' },
  conciliado:   { label: 'Conciliado',   icon: '✅', color: C.verde, hint: 'confirmado como Aplicado en NEO' },
  rechazado:    { label: 'Rechazado',    icon: '❌', color: C.rojo, hint: 'anulado en NEO' },
  error:        { label: 'Error',        icon: '⚠️', color: C.ambar, hint: 'falló el envío' },
  descartado:   { label: 'Descartado',   icon: '🗑️', color: C.grisClaro },
}
