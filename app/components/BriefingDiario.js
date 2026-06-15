'use client'
import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../../lib/supabase'

// Paleta de marca SOL / Depósito Jiménez
const NARANJA = '#ED6E2E'
const VINO    = '#5E2733'
const TEAL    = '#225F74'
const CREMA   = '#FDF4F4'

// Estilos "Liquid Glass" — mismos que el dashboard (app/page.js), modo claro.
const GLASS = {
  card: {
    background: 'rgba(255,255,255,0.55)',
    backdropFilter: 'blur(24px) saturate(1.8)',
    WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
    border: '1px solid rgba(255,255,255,0.6)',
    borderRadius: 20,
    boxShadow: '0 4px 30px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
  },
  cardInner: {
    background: 'rgba(255,255,255,0.4)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.5)',
    borderRadius: 14,
    boxShadow: '0 2px 12px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.7)',
  },
}

// ── Formato de colones ──────────────────────────────────────────────
function fmt_crc_full(val) {
  const n = parseFloat(val)
  if (isNaN(n)) return '—'
  return `₡${Math.round(n).toLocaleString('es-CR')}`
}
function fmt_crc_compact(val) {
  const n = parseFloat(val)
  if (isNaN(n)) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}₡${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}₡${(abs / 1_000).toFixed(0)}K`
  return `${sign}₡${Math.round(abs)}`
}
function fmt_pct(val) {
  const n = parseFloat(val)
  if (isNaN(n)) return '—'
  return `${n.toFixed(1)}%`
}

// ── Lógica de fechas (lun–sáb; domingo no opera) ────────────────────
// "Día anterior" = último día hábil con ventas.
//  - Mar a sáb: día calendario anterior.
//  - Lunes: el sábado (saltando el domingo).
//  - Domingo: el sábado anterior (estado neutro, sin operaciones).
function fechaYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function calcFechas(now = new Date()) {
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dow = hoy.getDay() // 0 dom … 6 sáb
  let back = 1
  if (dow === 1) back = 2 // lunes → sábado
  // domingo (0) → sábado es back=1; mar–sáb → back=1
  const diaAnterior = new Date(hoy)
  diaAnterior.setDate(hoy.getDate() - back)
  const mesDesde = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  return {
    esDomingo: dow === 0,
    diaAnterior,
    diaAnteriorYMD: fechaYMD(diaAnterior),
    mesDesdeYMD: fechaYMD(mesDesde),
    mesHastaYMD: fechaYMD(hoy),
  }
}
function fechaLabel(d) {
  // ej: "sábado 13 jun"
  const s = d.toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'short' })
  return s.replace('.', '')
}

// ── Sub-componentes ─────────────────────────────────────────────────
function StatTile({ label, value, sub, color }) {
  return (
    <div style={{ ...GLASS.cardInner, padding: '14px 16px', flex: '1 1 160px', minWidth: 140 }}>
      <div style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 700, color: color || 'rgba(0,0,0,0.85)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.4)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function Toggle({ options, value, onChange, accent }) {
  return (
    <div style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 12, background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.05)' }}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              border: 'none', cursor: 'pointer', borderRadius: 9, padding: '7px 14px',
              fontSize: '0.78rem', fontWeight: 700, fontFamily: 'inherit',
              transition: 'all 0.15s ease',
              background: active ? accent : 'transparent',
              color: active ? '#fff' : 'rgba(0,0,0,0.5)',
              boxShadow: active ? `0 2px 8px ${accent}55` : 'none',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function RankRow({ i, codigo, descripcion, valor, accent }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', ...GLASS.cardInner, marginBottom: 7 }}>
      <div style={{
        width: 24, height: 24, borderRadius: 7, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.72rem', fontWeight: 800,
        background: i < 3 ? accent : `${accent}22`,
        color: i < 3 ? '#fff' : accent,
      }}>{i + 1}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.83rem', fontWeight: 600, color: 'rgba(0,0,0,0.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{descripcion || '—'}</div>
        <div style={{ fontSize: '0.68rem', color: 'rgba(0,0,0,0.35)' }}>Cód. {codigo || '—'}</div>
      </div>
      <div style={{ fontSize: '0.86rem', fontWeight: 700, color: accent, flexShrink: 0 }}>{fmt_crc_compact(valor)}</div>
    </div>
  )
}

function TopList({ rows, metric, accent, loading, empty }) {
  const ordenadas = useMemo(() => {
    const key = metric === 'utilidad' ? 'utilidad' : 'ventas'
    return [...(rows || [])]
      .sort((a, b) => (parseFloat(b[key]) || 0) - (parseFloat(a[key]) || 0))
      .slice(0, 10)
  }, [rows, metric])

  if (loading) return <div style={{ color: 'rgba(0,0,0,0.25)', fontSize: '0.85rem', padding: '12px 0' }}>Cargando…</div>
  if (!ordenadas.length) return <div style={{ color: 'rgba(0,0,0,0.3)', fontSize: '0.85rem', padding: '12px 0' }}>{empty}</div>
  return (
    <div>
      {ordenadas.map((r, i) => (
        <RankRow key={`${r.codigo}-${i}`} i={i} codigo={r.codigo} descripcion={r.descripcion}
          valor={metric === 'utilidad' ? r.utilidad : r.ventas} accent={accent} />
      ))}
    </div>
  )
}

// ── Componente principal ────────────────────────────────────────────
export default function BriefingDiario() {
  const fechas = useMemo(() => calcFechas(), [])
  const [loading, setLoading] = useState(true)
  const [resumen, setResumen] = useState(null)
  const [topDia, setTopDia] = useState([])
  const [topMes, setTopMes] = useState([])

  const [scope, setScope] = useState('dia')        // 'dia' | 'mes'
  const [metric, setMetric] = useState('ventas')   // 'ventas' | 'utilidad'

  useEffect(() => {
    let activo = true
    async function cargar() {
      try {
        const [rRes, rDia, rMes] = await Promise.all([
          supabase.rpc('briefing_resumen', { p_desde: fechas.diaAnteriorYMD, p_hasta: fechas.diaAnteriorYMD }),
          supabase.rpc('briefing_top_productos', { p_desde: fechas.diaAnteriorYMD, p_hasta: fechas.diaAnteriorYMD, p_limit: 10 }),
          supabase.rpc('briefing_top_productos', { p_desde: fechas.mesDesdeYMD, p_hasta: fechas.mesHastaYMD, p_limit: 10 }),
        ])
        if (!activo) return
        setResumen(rRes.data?.[0] || null)
        setTopDia(rDia.data || [])
        setTopMes(rMes.data || [])
      } catch (e) {
        console.error('Briefing error', e)
      } finally {
        if (activo) setLoading(false)
      }
    }
    cargar()
    return () => { activo = false }
  }, [fechas])

  const ventas = parseFloat(resumen?.ventas) || 0
  const costo = parseFloat(resumen?.costo) || 0
  const utilidad = parseFloat(resumen?.utilidad) || 0
  const margen = ventas ? (utilidad / ventas) * 100 : 0
  const markup = costo ? (utilidad / costo) * 100 : 0
  const nFacturas = resumen?.n_facturas ?? 0

  const accent = metric === 'utilidad' ? TEAL : NARANJA
  const rows = scope === 'mes' ? topMes : topDia

  const mesLabel = fechas.diaAnterior.toLocaleDateString('es-CR', { month: 'long' })

  return (
    <div style={{ ...GLASS.card, padding: '20px 24px', marginTop: 8, marginBottom: 8 }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: NARANJA, marginBottom: 4 }}>
            📋 Briefing diario
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'rgba(0,0,0,0.85)', letterSpacing: '-0.02em', margin: 0 }}>
            Ventas del {fechaLabel(fechas.diaAnterior)}
          </h2>
          {fechas.esDomingo && (
            <div style={{ fontSize: '0.74rem', color: VINO, marginTop: 5, fontWeight: 600 }}>
              😴 Sin operaciones los domingos · mostrando el último briefing del sábado
            </div>
          )}
        </div>
      </div>

      {/* BLOQUE 1 — Resumen del día anterior */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 22 }}>
        <StatTile label="Ventas del día" value={loading ? '—' : fmt_crc_full(ventas)} sub="sin IVA" color={VINO} />
        <StatTile label="Utilidad del día" value={loading ? '—' : fmt_crc_full(utilidad)}
          sub={loading ? '' : `Margen ${fmt_pct(margen)} · Markup ${fmt_pct(markup)}`} color={TEAL} />
        <StatTile label="Facturas del día" value={loading ? '—' : nFacturas.toLocaleString('es-CR')}
          sub="documentos emitidos" color={NARANJA} />
      </div>

      {/* BLOQUE 2 y 3 — Top 10 con toggles Día/Mes y Volumen/Utilidad */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <Toggle
          accent={VINO}
          value={scope}
          onChange={setScope}
          options={[
            { value: 'dia', label: `Día (${fechaLabel(fechas.diaAnterior).split(' ').slice(0, 2).join(' ')})` },
            { value: 'mes', label: `Mes (${mesLabel})` },
          ]}
        />
        <Toggle
          accent={accent}
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'ventas', label: 'Por volumen' },
            { value: 'utilidad', label: 'Por utilidad' },
          ]}
        />
      </div>

      <div style={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.4)', marginBottom: 10 }}>
        Top 10 productos · {scope === 'mes' ? `acumulado de ${mesLabel}` : 'del día anterior'} · {metric === 'utilidad' ? 'ordenado por utilidad (₡)' : 'ordenado por volumen vendido (₡)'}
      </div>

      <TopList
        rows={rows}
        metric={metric}
        accent={accent}
        loading={loading}
        empty={scope === 'mes' ? 'Sin ventas registradas este mes' : 'Sin ventas registradas ese día'}
      />
    </div>
  )
}
