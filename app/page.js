'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'

const GOLD = '#c8a84b'

// Liquid Glass shared styles — Light Mode
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
  pageBg: {
    background: 'linear-gradient(135deg, #e8ecf4 0%, #d5dde8 30%, #e0e7f0 60%, #edf1f7 100%)',
    minHeight: '100vh',
    padding: '28px 32px',
    fontFamily: 'Rubik, sans-serif',
  },
}

function fmt_usd(val) {
  const n = parseFloat(val)
  if (isNaN(n)) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  // Compact for large amounts to avoid card overflow
  if (abs >= 1_000_000) return `${sign}$${(abs/1_000_000).toFixed(1)}M`
  if (abs >= 10_000)    return `${sign}$${Math.round(abs/1_000)}K`
  if (abs >= 1_000)     return `${sign}$${(abs/1_000).toFixed(1)}K`
  return `${sign}$${abs.toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
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

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function prevMonth() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function KpiCard({ icon, label, value, sub, color, loading }) {
  return (
    <div style={{
      ...GLASS.card,
      padding: '18px 20px', display: 'flex', alignItems: 'flex-start', gap: 14,
      transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
        background: `linear-gradient(135deg, ${color}25, ${color}10)`,
        border: `1px solid ${color}30`,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem',
        boxShadow: `0 2px 8px ${color}15`,
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'rgba(0,0,0,0.85)', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
          {loading ? <span style={{ color: 'rgba(0,0,0,0.15)' }}>—</span> : value}
        </div>
        {sub && <div style={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.35)', marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0 16px' }}>
      <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.06)' }} />
      <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.3)' }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.06)' }} />
    </div>
  )
}

function AlertRow({ icon, text, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: `${color}15`, border: `1px solid ${color}30`, marginBottom: 8, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}>
      <span style={{ fontSize: '1rem' }}>{icon}</span>
      <span style={{ fontSize: '0.83rem', color: 'rgba(0,0,0,0.7)', flex: 1 }}>{text}</span>
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', ...GLASS.cardInner, marginBottom: 8 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}60` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(0,0,0,0.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{envio.nombre || envio.id}</div>
        <div style={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.35)' }}>{envio.estado}</div>
      </div>
      <div style={{ fontSize: '0.72rem', color: 'rgba(0,0,0,0.35)', flexShrink: 0 }}>ETA {eta}</div>
    </div>
  )
}

function TareaRow({ tarea }) {
  const colors = { '🔴 Alta': '#f43f5e', '🟡 Media': '#f59e0b', '🟢 Baja': '#10b981' }
  const color = colors[tarea.prioridad] || '#888'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', ...GLASS.cardInner, marginBottom: 7 }}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}60` }} />
      <div style={{ flex: 1, fontSize: '0.84rem', color: 'rgba(0,0,0,0.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tarea.titulo}</div>
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
    <div style={{ ...GLASS.pageBg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', textAlign: 'center' }}>
      <div style={{ ...GLASS.card, padding: '48px 40px', maxWidth: 480, width: '100%' }}>
        <div style={{ fontSize: '3rem', marginBottom: 16 }}>☀️</div>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: GOLD, marginBottom: 8 }}>
          Sistema de Operaciones y Logística
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, color: 'rgba(0,0,0,0.85)', letterSpacing: '-0.03em', margin: '0 0 8px' }}>
          {saludo}, {perfil?.nombre?.split(' ')[0] || 'bienvenido'}
        </h1>
        <p style={{ fontSize: '0.92rem', color: 'rgba(0,0,0,0.45)', marginBottom: 28, maxWidth: 420 }}>
          Usá el menú de la izquierda para acceder a los módulos disponibles para tu cuenta.
        </p>
        <span style={{
          background: `linear-gradient(135deg, ${color}30, ${color}15)`,
          color, border: `1px solid ${color}40`,
          borderRadius: 20, padding: '6px 18px', fontSize: '0.78rem', fontWeight: 600,
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        }}>
          Rol: {perfil?.rol}
        </span>
      </div>
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
          .limit(50)

        const { data: tareasData } = await supabase
          .from('vega_tareas')
          .select('*')
          .eq('estado', 'activa')
          .order('creada', { ascending: false })
          .limit(8)

        // Obtener solo la carga más reciente de cuentas por pagar
        const { data: fcPagar } = await supabase
          .from('fin_cuentas_pagar')
          .select('fecha_carga')
          .order('fecha_carga', { ascending: false })
          .limit(1)
        const fechaCargaPagar = fcPagar?.[0]?.fecha_carga
        let pagos = []
        if (fechaCargaPagar) {
          let off = 0
          while (true) {
            const { data } = await supabase.from('fin_cuentas_pagar').select('*').eq('fecha_carga', fechaCargaPagar).range(off, off + 999)
            if (!data?.length) break
            pagos = [...pagos, ...data]
            if (data.length < 1000) break
            off += 1000
          }
        }

        const totalPagar = pagos.reduce((sum, r) => {
          const v = parseFloat(r['saldo_actual'] || r['Saldo actual'] || 0)
          return sum + (isNaN(v) ? 0 : v)
        }, 0)

        // Obtener solo la carga más reciente de cuentas por cobrar
        const { data: fcCobrar } = await supabase
          .from('fin_cuentas_cobrar')
          .select('fecha_carga')
          .order('fecha_carga', { ascending: false })
          .limit(1)
        const fechaCargaCobrar = fcCobrar?.[0]?.fecha_carga
        let cobros = []
        if (fechaCargaCobrar) {
          let off2 = 0
          while (true) {
            const { data } = await supabase.from('fin_cuentas_cobrar').select('*').eq('fecha_carga', fechaCargaCobrar).range(off2, off2 + 999)
            if (!data?.length) break
            cobros = [...cobros, ...data]
            if (data.length < 1000) break
            off2 += 1000
          }
        }

        const totalCobrar = cobros.reduce((sum, r) => {
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

        // Ventas desde neo_informe_ventas_vendedor (ventas netas reales, última carga por mes)
        async function sumarInforme(mes) {
          const { data: fc } = await supabase
            .from('neo_informe_ventas_vendedor')
            .select('fecha_carga')
            .eq('periodo_reporte', mes)
            .order('fecha_carga', { ascending: false })
            .limit(1)
          if (!fc?.length) return { ventas: 0, utilidad: 0 }
          const { data: rows } = await supabase
            .from('neo_informe_ventas_vendedor')
            .select('ventas_netas, utilidad')
            .eq('periodo_reporte', mes)
            .eq('fecha_carga', fc[0].fecha_carga)
          const Nv = v => parseFloat(v) || 0
          return {
            ventas:   (rows || []).reduce((s, r) => s + Nv(r.ventas_netas), 0),
            utilidad: (rows || []).reduce((s, r) => s + Nv(r.utilidad),     0),
          }
        }
        const [infActual, infPrev] = await Promise.all([
          sumarInforme(currentMonth()),
          sumarInforme(prevMonth()),
        ])
        const ventasMes        = infActual.ventas
        const utilidadMes      = infActual.utilidad
        const ventasAnterior   = infPrev.ventas
        const utilidadAnterior = infPrev.utilidad

        // Valor inventario desde neo_lista_items (solo existencias > 0)
        let valorInventario = 0
        try {
          const { data: fcInv } = await supabase
            .from('neo_lista_items')
            .select('fecha_carga')
            .order('fecha_carga', { ascending: false })
            .limit(1)
          if (fcInv?.[0]?.fecha_carga) {
            const { data: invRows } = await supabase
              .from('neo_lista_items')
              .select('existencias, costo_sin_imp')
              .eq('fecha_carga', fcInv[0].fecha_carga)
              .gt('existencias', 0)
            valorInventario = (invRows || []).reduce((s, r) =>
              s + (parseFloat(r.existencias) || 0) * (parseFloat(r.costo_sin_imp) || 0), 0)
          }
        } catch(e) { /* no bloquear si falla */ }

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
          ventasMes,
          utilidadMes,
          ventasAnterior,
          utilidadAnterior,
          valorInventario,
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
    <div style={GLASS.pageBg}>
      <div style={{ marginBottom: 24 }}>
        <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: GOLD, marginBottom: 4, display: 'block' }}>
          Dashboard ejecutivo
        </span>
        <h1 style={{ fontSize: '1.7rem', fontWeight: 700, color: 'rgba(0,0,0,0.85)', letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 4 }}>
          ☀️ SOL
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'rgba(0,0,0,0.4)' }}>Visión consolidada del negocio en tiempo real.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14, marginBottom: 8 }}>
        <KpiCard icon="🚢" label="Contenedores"   value={kpis.contenedoresActivos ?? '—'} sub="en tránsito activos"   color="#0284c7" loading={loading} />
        <KpiCard icon="✨" label="Tareas"
          value={(kpis.tareasPendientes ?? 0) + recurrentesHoy.length}
          sub={`${kpis.tareasPendientes ?? 0} activas · ${recurrentesHoy.length} recurrentes hoy`}
          color="#7c3aed" loading={loading} />
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
        <KpiCard
          icon="📈"
          label="Ventas del mes"
          value={fmt_crc(kpis.ventasMes)}
          sub={`Utilidad: ${fmt_crc(kpis.utilidadMes)}`}
          color="#38A169"
          loading={loading}
        />
        <KpiCard
          icon="📅"
          label="Mes anterior"
          value={fmt_crc(kpis.ventasAnterior)}
          sub={`Utilidad: ${fmt_crc(kpis.utilidadAnterior)}`}
          color="#718096"
          loading={loading}
        />
        <KpiCard
          icon="🏪"
          label="Valor inventario"
          value={fmt_crc(kpis.valorInventario)}
          sub="a costo · solo existencias +"
          color="#8B5E3C"
          loading={loading}
        />
      </div>

      <SectionTitle>ALERTAS Y OPERACIONES</SectionTitle>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>

        <div style={{ ...GLASS.card, padding: '18px 20px' }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'rgba(0,0,0,0.8)', marginBottom: 14 }}>🚢 Contenedores activos</div>
          {loading
            ? <div style={{ color: 'rgba(0,0,0,0.15)', fontSize: '0.82rem' }}>Cargando...</div>
            : contenedores.length === 0
              ? <div style={{ color: 'rgba(0,0,0,0.3)', fontSize: '0.82rem' }}>No hay contenedores activos</div>
              : contenedores.map((e, i) => <ContenedorRow key={i} envio={e} />)
          }
        </div>

        <div style={{ ...GLASS.card, padding: '18px 20px' }}>
          <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'rgba(0,0,0,0.8)', marginBottom: 14 }}>✨ Tareas pendientes</div>
          {loading
            ? <div style={{ color: 'rgba(0,0,0,0.15)', fontSize: '0.82rem' }}>Cargando...</div>
            : tareas.length === 0
              ? <div style={{ color: 'rgba(0,0,0,0.3)', fontSize: '0.82rem' }}>No hay tareas pendientes</div>
              : tareas.map((t, i) => <TareaRow key={i} tarea={t} />)
          }
        </div>
        {recurrentesHoy.length > 0 && (
          <div style={{ ...GLASS.card, padding: '18px 20px' }}>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'rgba(0,0,0,0.8)', marginBottom: 14 }}>⚡ Tareas recurrentes hoy</div>
            {recurrentesHoy.map((r, i) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(0,0,0,0.06)', fontSize: '0.84rem', color: 'rgba(0,0,0,0.75)' }}>
                <span style={{ marginRight: 8 }}>🔁</span>{r.titulo}
                {r.notas && <div style={{ fontSize: '0.75rem', color: 'rgba(0,0,0,0.3)', marginTop: 2 }}>{r.notas}</div>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 24, fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)', textAlign: 'right' }}>
        Actualizado: {new Date().toLocaleString('es-CR')}
      </div>
    </div>
  )
}
