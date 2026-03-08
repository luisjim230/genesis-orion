'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const GOLD = '#c8a84b'
const GOLD_DIM = 'rgba(200,168,75,0.12)'
const GOLD_BORDER = 'rgba(200,168,75,0.22)'

function fmt_crc(val) {
  if (!val && val !== 0) return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return '—'
  if (n >= 1_000_000) return `₡${(n/1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `₡${(n/1_000).toFixed(0)}K`
  return `₡${n.toFixed(0)}`
}

function KpiCard({ icon, label, value, sub, color, loading }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e8eaed', borderRadius: 14,
      padding: '18px 20px', display: 'flex', alignItems: 'flex-start', gap: 14,
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem',
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#9ba3b5', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1a1d24', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
          {loading ? <span style={{ color: '#ddd' }}>—</span> : value}
        </div>
        {sub && <div style={{ fontSize: '0.72rem', color: '#9ba3b5', marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 16px' }}>
      <div style={{ flex: 1, height: 1, background: '#e8eaed' }} />
      <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#b0b8cc' }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: '#e8eaed' }} />
    </div>
  )
}

function AlertRow({ icon, text, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 9, background: color + '0d', border: `1px solid ${color}22`, marginBottom: 8 }}>
      <span style={{ fontSize: '1rem' }}>{icon}</span>
      <span style={{ fontSize: '0.83rem', color: '#2a3040', flex: 1 }}>{text}</span>
    </div>
  )
}

function ContenedorRow({ envio }) {
  const estados = {
    '🏭 En producción': '#9B59B6',
    '⏳ Esperando despacho': '#F39C12',
    '🚢 En el mar': '#2980B9',
    '🏝️ En puerto de destino': '#16A085',
    '🚛 En aduana': '#E67E22',
    '✅ Entregado': '#27AE60',
  }
  const color = estados[envio.estado] || '#888'
  const eta = envio.eta ? new Date(envio.eta).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' }) : '—'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 9, background: '#f7f8fa', border: '1px solid #e8eaed', marginBottom: 8 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1a1d24', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{envio.nombre || envio.id}</div>
        <div style={{ fontSize: '0.72rem', color: '#8a91a5' }}>{envio.estado}</div>
      </div>
      <div style={{ fontSize: '0.72rem', color: '#8a91a5', flexShrink: 0 }}>ETA {eta}</div>
    </div>
  )
}

function TareaRow({ tarea }) {
  const colors = { '🔴 Alta': '#f43f5e', '🟡 Media': '#f59e0b', '🟢 Baja': '#10b981' }
  const color = colors[tarea.prioridad] || '#888'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 9, background: '#f7f8fa', border: '1px solid #e8eaed', marginBottom: 7 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: '0.84rem', color: '#1a1d24', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tarea.titulo}</div>
      <div style={{ fontSize: '0.68rem', fontWeight: 700, color: color, flexShrink: 0 }}>{tarea.prioridad?.replace('🔴 ', '').replace('🟡 ', '').replace('🟢 ', '')}</div>
    </div>
  )
}

export default function CosmosPage() {
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState({})
  const [alertas, setAlertas] = useState([])
  const [contenedores, setContenedores] = useState([])
  const [tareas, setTareas] = useState([])

  useEffect(() => {
    async function cargar() {
      try {
        // 1. Stock crítico (bajo mínimo)
        const { data: stock } = await supabase
          .from('neo_minimos_maximos')
          .select('nombre, existencias, minimo, promedio_mensual')
          .order('fecha_carga', { ascending: false })
          .limit(500)

        const criticos = (stock || []).filter(i => {
          const exist = parseFloat(i.existencias) || 0
          const min = parseFloat(i.minimo) || 0
          return exist < min && min > 0
        })

        // 2. Contenedores activos
        const { data: envios } = await supabase
          .from('neptuno_envios')
          .select('*')
          .eq('archivado', false)
          .order('eta', { ascending: true })
          .limit(10)

        // 3. Tareas pendientes
        const { data: tareasData } = await supabase
          .from('vega_tareas')
          .select('*')
          .eq('estado', 'activa')
          .order('creada', { ascending: false })
          .limit(8)

        // 4. Cuentas por pagar
        const { data: pagos } = await supabase
          .from('fin_cuentas_pagar')
          .select('Saldo actual')
          .limit(1000)

        const totalPagar = (pagos || []).reduce((sum, r) => sum + (parseFloat(r['Saldo actual']) || 0), 0)

        // 5. Cuentas por cobrar
        const { data: cobros } = await supabase
          .from('fin_cuentas_cobrar')
          .select('Saldo actual')
          .limit(1000)

        const totalCobrar = (cobros || []).reduce((sum, r) => sum + (parseFloat(r['Saldo actual']) || 0), 0)

        // Alertas de stock crítico
        const alertasStock = criticos.slice(0, 5).map(i => ({
          icon: '⚠️',
          text: `${i.nombre} — Existencias: ${i.existencias} (mín. ${i.minimo})`,
          color: '#f43f5e',
        }))

        setKpis({
          stockCritico: criticos.length,
          contenedoresActivos: (envios || []).length,
          tareasPendientes: (tareasData || []).length,
          totalPagar,
          totalCobrar,
          posicionCaja: totalCobrar - totalPagar,
        })
        setAlertas(alertasStock)
        setContenedores(envios || [])
        setTareas(tareasData || [])
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [])

  const posPositiva = kpis.posicionCaja >= 0

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: GOLD, marginBottom: 4, display: 'block' }}>
          Dashboard ejecutivo
        </span>
        <h1 style={{ fontSize: '1.7rem', fontWeight: 700, color: '#1a1d24', letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 4 }}>
          🌌 Cosmos
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6a7288' }}>
          Visión consolidada del negocio en tiempo real.
        </p>
      </div>

      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14, marginBottom: 8 }}>
        <KpiCard icon="⚠️" label="Stock crítico" value={kpis.stockCritico ?? '—'} sub="ítems bajo mínimo" color="#f43f5e" loading={loading} />
        <KpiCard icon="🚢" label="Contenedores" value={kpis.contenedoresActivos ?? '—'} sub="en tránsito activos" color="#0284c7" loading={loading} />
        <KpiCard icon="✨" label="Tareas" value={kpis.tareasPendientes ?? '—'} sub="pendientes hoy" color="#7c3aed" loading={loading} />
        <KpiCard icon="💸" label="Por pagar" value={fmt_crc(kpis.totalPagar)} sub="cuentas a proveedores" color="#f43f5e" loading={loading} />
        <KpiCard icon="📥" label="Por cobrar" value={fmt_crc(kpis.totalCobrar)} sub="cuentas a clientes" color="#0d9488" loading={loading} />
        <KpiCard
          icon={posPositiva ? '🟢' : '🔴'}
          label="Posición neta"
          value={fmt_crc(kpis.posicionCaja)}
          sub={posPositiva ? 'Flujo positivo' : 'Revisar pagos'}
          color={posPositiva ? '#059669' : '#f43f5e'}
          loading={loading}
        />
      </div>

      {/* Alertas + Contenedores + Tareas */}
      <SectionTitle>ALERTAS Y OPERACIONES</SectionTitle>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>

        {/* Alertas de stock */}
        <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1a1d24', marginBottom: 14 }}>⚠️ Stock crítico</div>
          {loading ? <div style={{ color: '#ccc', fontSize: '0.82rem' }}>Cargando...</div>
            : alertas.length === 0
              ? <div style={{ color: '#9ba3b5', fontSize: '0.82rem' }}>✅ Sin alertas de stock</div>
              : alertas.map((a, i) => <AlertRow key={i} {...a} />)
          }
          {!loading && kpis.stockCritico > 5 && (
            <div style={{ fontSize: '0.72rem', color: '#9ba3b5', marginTop: 8 }}>
              +{kpis.stockCritico - 5} ítems más en Saturno
            </div>
          )}
        </div>

        {/* Contenedores */}
        <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1a1d24', marginBottom: 14 }}>🚢 Contenedores activos</div>
          {loading ? <div style={{ color: '#ccc', fontSize: '0.82rem' }}>Cargando...</div>
            : contenedores.length === 0
              ? <div style={{ color: '#9ba3b5', fontSize: '0.82rem' }}>No hay contenedores activos</div>
              : contenedores.map((e, i) => <ContenedorRow key={i} envio={e} />)
          }
        </div>

        {/* Tareas */}
        <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1a1d24', marginBottom: 14 }}>✨ Tareas pendientes</div>
          {loading ? <div style={{ color: '#ccc', fontSize: '0.82rem' }}>Cargando...</div>
            : tareas.length === 0
              ? <div style={{ color: '#9ba3b5', fontSize: '0.82rem' }}>No hay tareas pendientes</div>
              : tareas.map((t, i) => <TareaRow key={i} tarea={t} />)
          }
        </div>

      </div>

      {/* Timestamp */}
      <div style={{ marginTop: 24, fontSize: '0.7rem', color: '#b0b8cc', textAlign: 'right' }}>
        Actualizado: {new Date().toLocaleString('es-CR')}
      </div>
    </div>
  )
}