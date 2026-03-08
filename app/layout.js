'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import './globals.css'

const NAV = [
  { group: 'Principal', items: [
    { href: '/',             icon: '🌌', label: 'Cosmos',    sub: 'Dashboard' },
  ]},
  { group: 'Inventario', items: [
    { href: '/inventario',   icon: '🪐', label: 'Saturno',   sub: 'Inventario' },
    { href: '/trazabilidad', icon: '🔴', label: 'Nehemías',  sub: 'Trazabilidad' },
    { href: '/reportes',     icon: '🌟', label: 'Ezequiel',  sub: 'Reportes NEO' },
    { href: '/helios',       icon: '☀️', label: 'Helios',    sub: 'Inteligencia' },
  ]},
  { group: 'Importaciones', items: [
    { href: '/cif',          icon: '☀️', label: 'Éxodo',     sub: 'Calculadora CIF' },
    { href: '/contenedores', icon: '🔵', label: 'Jonás',     sub: 'Contenedores' },
    { href: '/mercado',      icon: '⭐', label: 'Isaías',    sub: 'Mercado' },
  ]},
  { group: 'Gestión', items: [
    { href: '/finanzas',     icon: '💫', label: 'Números',   sub: 'Finanzas' },
    { href: '/tareas',       icon: '✨', label: 'Matusalén', sub: 'Tareas' },
    { href: '/redes',        icon: '🌙', label: 'Crónicas',  sub: 'Redes Sociales' },
  ]},
]

const S = {
  shell:   { display:'flex', height:'100vh', overflow:'hidden', fontFamily:"-apple-system,'Helvetica Neue',Arial,sans-serif" },
  sidebar: { width:240, minWidth:240, background:'#1c1f26', display:'flex', flexDirection:'column', height:'100vh', overflowY:'auto', borderRight:'1px solid rgba(255,255,255,0.04)' },
  logoWrap:{ padding:'18px 16px 14px', borderBottom:'1px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', gap:10 },
  logoMark:{ width:32, height:32, background:'linear-gradient(135deg,#c8a84b,#a8882e)', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, flexShrink:0 },
  logoName:{ fontSize:'0.92rem', fontWeight:700, color:'#eef0f4', letterSpacing:'-0.02em', lineHeight:1.2 },
  logoSub: { fontSize:'0.65rem', color:'#3a4258', lineHeight:1.3 },
  nav:     { flex:1, padding:'10px 8px', display:'flex', flexDirection:'column', gap:1 },
  grpLabel:{ fontSize:'0.58rem', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', color:'#2e3a52', padding:'10px 8px 3px', display:'block' },
  navItem: { display:'flex', alignItems:'center', gap:8, padding:'7px 9px', borderRadius:7, cursor:'pointer', textDecoration:'none', color:'#7a8299', fontSize:'0.83rem', fontWeight:400, transition:'all 0.15s ease', border:'1px solid transparent' },
  navActive:{ background:'#252d3a', color:'#d4b86a', borderColor:'rgba(200,168,75,0.2)', fontWeight:500 },
  navIcon: { fontSize:'0.95rem', width:20, textAlign:'center', flexShrink:0 },
  sideFooter:{ padding:'10px 12px', borderTop:'1px solid rgba(255,255,255,0.05)' },
  mainArea:{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'#f0f2f5' },
  topbar:  { height:54, minHeight:54, background:'#ffffff', borderBottom:'1px solid #e8eaed', display:'flex', alignItems:'center', padding:'0 24px', gap:16 },
  content: { flex:1, overflowY:'auto', padding:'28px 28px' },
}

function Sidebar({ pathname }) {
  return (
    <aside style={S.sidebar}>
      <div style={S.logoWrap}>
        <div style={S.logoMark}>⚡</div>
        <div>
          <div style={S.logoName}>Génesis</div>
          <div style={S.logoSub}>Depósito Jiménez</div>
        </div>
      </div>
      <nav style={S.nav}>
        {NAV.map(({ group, items }) => (
          <div key={group}>
            <span style={S.grpLabel}>{group}</span>
            {items.map(({ href, icon, label, sub }) => {
              const active = pathname === href
              return (
                <Link key={href} href={href} style={{ ...S.navItem, ...(active ? S.navActive : {}) }}>
                  <span style={S.navIcon}>{icon}</span>
                  <span style={{ flex:1, minWidth:0 }}>
                    <span style={{ display:'block', lineHeight:1.25 }}>{label}</span>
                    <span style={{ fontSize:'0.68rem', opacity:0.55, lineHeight:1 }}>{sub}</span>
                  </span>
                  {active && <span style={{ width:3, height:16, background:'#c8a84b', borderRadius:2, marginLeft:4, flexShrink:0 }} />}
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
      <div style={S.sideFooter}>
        <div style={{ fontSize:'0.65rem', color:'#3a4258', lineHeight:1.7 }}>
          <div style={{ color:'#5a6278', fontWeight:500, marginBottom:1 }}>Corporación Rojimo S.A.</div>
          <div>v3.0 · Génesis Orión</div>
        </div>
      </div>
    </aside>
  )
}

function Topbar({ pathname }) {
  const allItems = NAV.flatMap(g => g.items)
  const active = allItems.find(i => i.href === pathname) || allItems[0]
  return (
    <header style={S.topbar}>
      <span style={{ fontSize:'1rem' }}>{active.icon}</span>
      <span style={{ fontSize:'0.9rem', fontWeight:700, color:'#1a1d24' }}>{active.label}</span>
      <span style={{ color:'#c0c6d4', fontSize:'0.8rem' }}>/</span>
      <span style={{ fontSize:'0.8rem', color:'#8a91a5', flex:1 }}>{active.sub}</span>
      <div style={{ fontSize:'0.73rem', color:'#8a91a5', background:'#f7f8fa', border:'1px solid #e8eaed', borderRadius:7, padding:'4px 12px' }}>
        {new Date().toLocaleDateString('es-CR', { weekday:'short', day:'numeric', month:'short' })}
      </div>
    </header>
  )
}

export default function RootLayout({ children }) {
  const pathname = usePathname()
  return (
    <html lang="es">
      <head>
        <title>Génesis Orión · Depósito Jiménez</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin:0, padding:0 }}>
        <div style={S.shell}>
          <Sidebar pathname={pathname} />
          <div style={S.mainArea}>
            <Topbar pathname={pathname} />
            <main style={S.content}>{children}</main>
          </div>
        </div>
      </body>
    </html>
  )
}