'use client'
import Link from 'next/link'

const GOLD = '#c8a84b'
const GOLD_DIM = 'rgba(200,168,75,0.12)'
const GOLD_BORDER = 'rgba(200,168,75,0.22)'

const MODULES = [
  { group: 'INVENTARIO', items: [
    { href:'/inventario',   icon:'🪐', title:'Saturno – Inventario',     desc:'Stock, alertas y generación de órdenes de compra por proveedor.' },
    { href:'/trazabilidad', icon:'🔴', title:'Nehemías – Trazabilidad',   desc:'Historial de órdenes enviadas vs compras recibidas desde NEO.' },
    { href:'/reportes',     icon:'🌟', title:'Ezequiel – Reportes NEO',   desc:'Cargá reportes del ERP directo a la nube. Detección automática.' },
    { href:'/helios',       icon:'☀️', title:'Helios – Inteligencia',     desc:'Cruces de ventas, rentabilidad y stock para mejores decisiones.' },
  ]},
  { group: 'IMPORTACIONES', items: [
    { href:'/cif',          icon:'☀️', title:'Éxodo – Calculadora CIF',   desc:'Costo aterrizado de importaciones. Prorrateo, impuestos y precio sugerido.' },
    { href:'/contenedores', icon:'🔵', title:'Jonás – Contenedores',      desc:'Seguimiento de envíos: ETA, pagos, impuestos y estado.' },
    { href:'/mercado',      icon:'⭐', title:'Isaías – Mercado',          desc:'Tipo de cambio BAC/Davivienda, materiales y fletes Asia.' },
  ]},
  { group: 'GESTIÓN', items: [
    { href:'/finanzas',     icon:'💫', title:'Números – Finanzas',        desc:'Cuentas por pagar y cobrar, flujo de caja y movimientos contables.' },
    { href:'/tareas',       icon:'✨', title:'Matusalén – Tareas',        desc:'Pendientes, recurrentes mensuales, calendario y completadas.' },
    { href:'/redes',        icon:'🌙', title:'Crónicas – Redes Sociales', desc:'KPIs Facebook e Instagram, demografía y tendencias diarias.' },
  ]},
]

function SectionSep({ label }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, margin:'28px 0 16px' }}>
      <div style={{ flex:1, height:1, background:'#e8eaed' }} />
      <span style={{ fontSize:'0.62rem', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'#b0b8cc', whiteSpace:'nowrap' }}>{label}</span>
      <div style={{ flex:1, height:1, background:'#e8eaed' }} />
    </div>
  )
}

function ModuleCard({ href, icon, title, desc }) {
  return (
    <Link href={href} style={{ textDecoration:'none' }}>
      <div style={{
        background:'#ffffff', border:'1px solid #e8eaed', borderRadius:14,
        padding:'20px 22px 18px', cursor:'pointer', transition:'all 0.18s ease',
        height:'100%',
      }}
        onMouseEnter={e => { e.currentTarget.style.borderColor=GOLD_BORDER; e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.08)'; e.currentTarget.style.transform='translateY(-2px)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor='#e8eaed'; e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='translateY(0)' }}
      >
        <div style={{ fontSize:'1.45rem', marginBottom:10, lineHeight:1 }}>{icon}</div>
        <div style={{ fontSize:'0.93rem', fontWeight:700, color:'#1a1d24', marginBottom:5, letterSpacing:'-0.01em' }}>{title}</div>
        <div style={{ fontSize:'0.79rem', color:'#6a7288', lineHeight:1.55 }}>{desc}</div>
        <div style={{ display:'inline-flex', alignItems:'center', gap:4, marginTop:12, padding:'2px 9px', borderRadius:100, fontSize:'0.62rem', fontWeight:700, letterSpacing:'0.06em', textTransform:'uppercase', background:'rgba(5,150,105,0.07)', border:'1px solid rgba(5,150,105,0.18)', color:'#059669' }}>
          ● Activo
        </div>
      </div>
    </Link>
  )
}

export default function Home() {
  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:'0.7rem', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:GOLD, marginBottom:4 }}>
          Corporación Rojimo S.A. · 2026
        </div>
        <h1 style={{ fontSize:'1.7rem', fontWeight:700, color:'#1a1d24', letterSpacing:'-0.03em', lineHeight:1.2, marginBottom:4 }}>
          Bienvenido, Luis 👋
        </h1>
        <p style={{ fontSize:'0.875rem', color:'#6a7288' }}>Seleccioná un módulo para comenzar.</p>
      </div>

      {/* Cosmos featured card */}
      <Link href="/" style={{ textDecoration:'none' }}>
        <div style={{
          background:'linear-gradient(135deg,#1c1f26 0%,#252932 100%)',
          border:`1px solid ${GOLD_BORDER}`,
          borderRadius:18, padding:'20px 24px', marginBottom:28,
          display:'flex', alignItems:'center', gap:18,
          boxShadow:'0 4px 20px rgba(200,168,75,0.08)',
          cursor:'pointer',
        }}>
          <div style={{ width:48, height:48, background:'linear-gradient(135deg,#c8a84b,#a8882e)', borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.4rem', flexShrink:0 }}>🌌</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:'1rem', fontWeight:700, color:'#eef0f4', marginBottom:3 }}>Cosmos – Dashboard ejecutivo</div>
            <div style={{ fontSize:'0.78rem', color:'#4a5268' }}>KPIs consolidados · Alertas de stock · Posición de caja · Contenedores activos</div>
          </div>
          <div style={{ color:GOLD, fontSize:'1.1rem' }}>→</div>
        </div>
      </Link>

      {/* Módulos */}
      {MODULES.map(({ group, items }) => (
        <div key={group}>
          <SectionSep label={group} />
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))', gap:14 }}>
            {items.map(m => <ModuleCard key={m.href} {...m} />)}
          </div>
        </div>
      ))}
    </div>
  )
}