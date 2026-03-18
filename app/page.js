'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'

const GOLD = '#c8a84b'

function fmt_usd(val) {
  const n = parseFloat(val)
  if (isNaN(n)) return '—'
  return '$' + n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmt_crc(val) {
  if (!val && val !== 0) return '—'
  const n = parseFloat(val)
  if (isNaN(n)) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}₡${(abs/1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}₡${(abs/1_000).toFixed(0)}K`
  return `${sign}₡${abs.toFixed(0)}`
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

function WelcomePage({ perfil }) {
  const ROL_COLOR = { admin:'#ED6E2E', bodega:'#63b3ed', ventas:'#68d391', finanzas:'#c8a84b', logistica:'#b794f4' }
  const color = ROL_COLOR[perfil?.rol] || '#888'
  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 18 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
      <div style={{ fontSize: '3rem', marginBottom: 16 }}>☀️</div>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: GOLD, marginBottom: 8 }}>
        Sistema de Operaciones y Logística
      </div>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#1a1d24', letterSpacing: '-0.03em', margin: '0 0 8px' }}>
        {saludo}, {perfil?.nombre?.split(' ')[0] || 'bienvenido'}
      </h1>
      <p style={{ fontSize: '0.92rem', color: '#6a7288', marginBottom: 28, maxWidth: 420 }}>
        Usá el menú de la izquierda para acceder a los módulos disponibles para tu cuenta.
      </p>
      <span style={{
        background: color + '22', color, border: `1px solid ${color}55`,
        borderRadius: 20, padding: '4px 16px', fontSize: '0.78rem', fontWeight: 600
      }}>
        Rol: {perfil?.rol}
      </span>
    </div>
  )
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState({})
  const [alertas, setAlertas] = useState([])
  const [contenedores, setContenedores] = useState([])
  const [tareas, setTareas] = useState([])
  const [recurrentesHoy, setRecurrentesHoy] = useState([])
  const { perfil, loading: authLoading } = useAuth()

  const esAdmin = perfil?.rol === 'admin'

  useEffect(() => {
    if (!esAdmin) { setLoading(false); return }
    async function cargar() {
      try {
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

        const { data: envios } = await supabase
          .from('neptuno_envios')
          .select('*')
          .eq('archivado', false)
          .order('eta', { ascending: true })
          .limit(10)

        const { data: tareasData } = await supabase
          .from('vega_tareas')
          .select('*')
          .eq('estado', 'activa')
          .order('creada', { ascending: false })
          .limit(8)

        const { data: pagos } = await supabase
          .from('fin_cuentas_pagar')
          .select('*')
          .limit(2000)

        const totalPagar = (pagos || []).reduce((sum, r) => {
          const v = parseFloat(r['saldo_actual'] || r['Saldo actual'] || 0)
          return sum + (isNaN(v) ? 0 : v)
        }, 0)

        const { data: cobros } = await supabase
          .from('fin_cuentas_cobrar')
          .select('*')
          .limit(2000)

        const totalCobrar = (cobros || []).reduce((sum, r) => {
          const v = parseFloat(r['saldo_actual'] || r['Saldo actual'] || 0)
          return sum + (isNaN(v) ? 0 : v)
        }, 0)

        // Tipo de cambio BCCR (venta, indicador 318)
        let tcVenta = 520 // fallback
        try {
          const hoy = new Date().toLocaleDateString('es-CR',{day:'2-digit',month:'2-digit',year:'numeric'})
          const bccrRes = await fetch(
            'https://gee.bccr.fi.cr/Indicadores/Suscripciones/WS/wsindicadoreseconomicos.asmx/ObtenerIndicadoresEconomicos?' +
            new URLSearchParams({Indicador:'318',FechaInicio:hoy,FechaFinal:hoy,Nombre:'genesis',SubNiveles:'N',CorreoElectronico:'genesis@rojimo.com',Token:'OJXUWSTM2J'})
          )
          const bccrTxt = await bccrRes.text()
          const match = bccrTxt.match(/<NUM_VALOR>([\d.,]+)<\/NUM_VALOR>/)
          if (match) tcVenta = parseFloat(match[1].replace(',','.'))
        } catch(e) { /* usar fallback */ }

        const { data: bancosData } = await supabase
          .from('fin_bancos')
          .select('saldo, moneda')

        const totalBancosCRC = (bancosData || [])
          .filter(b => b.moneda === 'CRC')
          .reduce((sum, b) => sum + Number(b.saldo || 0), 0)

        const totalBancosUSD = (bancosData || [])
          .filter(b => b.moneda === 'USD')
          .reduce((sum, b) => sum + Number(b.saldo || 0), 0)

        const { data: enviosData } = await supabase
          .from('neptuno_envios')
          .select('adelanto_monto,adelanto_pago,final_monto,final_pago,flete_monto,flete_pago,impuestos_monto,impuestos_pago,transporte_local_monto,transporte_local_pago')
          .eq('archivado', false)

        let importTotalUSD = 0
        let importPorPagarUSD = 0
        const campos = [
          ['adelanto_monto','adelanto_pago'],
          ['final_monto','final_pago'],
          ['flete_monto','flete_pago'],
          ['impuestos_monto','impuestos_pago'],
          ['transporte_local_monto','transporte_local_pago'],
        ]
        ;(enviosData || []).forEach(e => {
          campos.forEach(([m, p]) => {
            const v = Number(e[m] || 0)
            importTotalUSD += v
            if (!e[p]) importPorPagarUSD += v
          })
        })

        setKpis({
          stockCritico: criticos.length,
          contenedoresActivos: (envios || []).length,
          tareasPendientes: (tareasData || []).length,
          totalPagar,
          totalCobrar,
          posicionCaja: totalCobrar - totalPagar + totalBancosCRC + (totalBancosUSD * tcVenta) - (importPorPagarUSD * tcVenta),
          totalBancosCRC,
          totalBancosUSD,
          importTotalUSD,
          importPorPagarUSD,
        })
        setAlertas(criticos.slice(0, 5).map(i => ({
          icon: '⚠️',
          text: `${i.nombre} — Existencias: ${i.existencias} (mín. ${i.minimo})`,
          color: '#f43f5e',
        })))
        setContenedores(envios || [])
        setTareas(tareasData || [])
        const hoyDia = new Date().getDate()
        const { data: recData } = await supabase.from('vega_recurrentes').select('*')
        setRecurrentesHoy((recData || []).filter(r => r.dia === hoyDia))
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    cargar()
  }, [esAdmin])

  // Esperar a que cargue el perfil antes de decidir qué mostrar
  if (authLoading) return null

  // No admin → pantalla de bienvenida
  if (!esAdmin) return <WelcomePage perfil={perfil} />

  const posPositiva = kpis.posicionCaja >= 0

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: GOLD, marginBottom: 4, display: 'block' }}>
          Dashboard ejecutivo
        </span>
        <h1 style={{ fontSize: '1.7rem', fontWeight: 700, color: '#1a1d24', letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 4 }}>
          ☀️ SOL
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#6a7288' }}>Visión consolidada del negocio en tiempo real.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14, marginBottom: 8 }}>
        <KpiCard icon="🚢" label="Contenedores"   value={kpis.contenedoresActivos ?? '—'} sub="en tránsito activos"   color="#0284c7" loading={loading} />
        <KpiCard icon="✨" label="Tareas"         value={kpis.tareasPendientes ?? '—'}    sub="pendientes hoy"        color="#7c3aed" loading={loading} />
        <KpiCard icon="💸" label="Por pagar"      value={fmt_crc(kpis.totalPagar)}        sub="cuentas a proveedores" color="#f43f5e" loading={loading} />
        <KpiCard icon="📥" label="Por cobrar"     value={fmt_crc(kpis.totalCobrar)}       sub="cuentas a clientes"    color="#0d9488" loading={loading} />
        <KpiCard
          icon={posPositiva ? '🟢' : '🔴'}
          label="Posición neta"
          value={fmt_crc(kpis.posicionCaja)}
          sub={posPositiva ? 'Flujo positivo' : 'Revisar pagos'}
          color={posPositiva ? '#059669' : '#f43f5e'}
          loading={loading}
        />
        <KpiCard
          icon="🏦"
          label="Bancos CRC"
          value={fmt_crc(kpis.totalBancosCRC)}
          sub="saldo total colones"
          color="#5E2733"
          loading={loading}
        />
        <KpiCard
          icon="💵"
          label="Bancos USD"
          value={fmt_usd(kpis.totalBancosUSD)}
          sub="saldo total dolares"
          color="#5E2733"
          loading={loading}
        />
        <KpiCard
          icon="📦"
          label="Import. total"
          value={fmt_usd(kpis.importTotalUSD)}
          sub="comprometido en transito"
          color="#0284c7"
          loading={loading}
        />
        <KpiCard
          icon="⏳"
          label="Import. x pagar"
          value={fmt_usd(kpis.importPorPagarUSD)}
          sub="pendiente de pago"
          color="#f59e0b"
          loading={loading}
        />
      </div>

      <SectionTitle>ALERTAS Y OPERACIONES</SectionTitle>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>


        <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1a1d24', marginBottom: 14 }}>🚢 Contenedores activos</div>
          {loading
            ? <div style={{ color: '#ccc', fontSize: '0.82rem' }}>Cargando...</div>
            : contenedores.length === 0
              ? <div style={{ color: '#9ba3b5', fontSize: '0.82rem' }}>No hay contenedores activos</div>
              : contenedores.map((e, i) => <ContenedorRow key={i} envio={e} />)
          }
        </div>

        <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1a1d24', marginBottom: 14 }}>✨ Tareas pendientes</div>
          {loading
            ? <div style={{ color: '#ccc', fontSize: '0.82rem' }}>Cargando...</div>
            : tareas.length === 0
              ? <div style={{ color: '#9ba3b5', fontSize: '0.82rem' }}>No hay tareas pendientes</div>
              : tareas.map((t, i) => <TareaRow key={i} tarea={t} />)
          }
        </div>
        {recurrentesHoy.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #e8eaed', borderRadius: 14, padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1a1d24', marginBottom: 14 }}>⚡ Tareas recurrentes hoy</div>
            {recurrentesHoy.map((r, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #f0f2f5', fontSize: '0.84rem', color: '#1a1d24' }}>
                <span style={{ marginRight: 8 }}>🔁</span>{r.titulo}
                {r.notas && <div style={{ fontSize: '0.75rem', color: '#9ba3b5', marginTop: 2 }}>{r.notas}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, fontSize: '0.7rem', color: '#b0b8cc', textAlign: 'right' }}>
        Actualizado: {new Date().toLocaleString('es-CR')}
      </div>
    </div>
  )
}
