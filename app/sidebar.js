'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const nunitoStyle = `@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;800;900&display=swap');`;

const navGroups = [
  {
    label: 'Principal',
    items: [
      { href: '/',             icon: '⊞',  name: 'Cosmos',    sub: 'Dashboard' },
    ],
  },
  {
    label: 'Inventario',
    items: [
      { href: '/inventario',   icon: '📦', name: 'Saturno',   sub: 'Inventario' },
      { href: '/trazabilidad', icon: '🔴', name: 'Nehemías',  sub: 'Trazabilidad' },
      { href: '/reportes',     icon: '📊', name: 'Ezequiel',  sub: 'Centro de Datos' },
      // { href: '/helios',    icon: '💡', name: 'Helios',    sub: 'Inteligencia Comercial' },  // oculto
    ],
  },
  {
    label: 'Importaciones',
    items: [
      { href: '/cif',          icon: '🧮', name: 'Halley',    sub: 'Calculadora CIF' },
      { href: '/contenedores', icon: '🚢', name: 'Jonás',     sub: 'Contenedores' },
      { href: '/mercado',      icon: '⚡', name: 'Isaías',    sub: 'Mercado' },
    ],
  },
  {
    label: 'Gestión',
    items: [
      { href: '/finanzas',     icon: '💰', name: 'Números',   sub: 'Finanzas' },
      { href: '/tareas',       icon: '✅', name: 'Matusalén', sub: 'Tareas' },
      // { href: '/redes',     icon: '📱', name: 'Crónicas',  sub: 'Redes Sociales' },  // oculto
    ],
  },
  {
    label: 'Herramientas',
    items: [
      { href: '/ponderacion',  icon: '⚖️', name: 'Esdras',    sub: 'Ponderación' },
    ],
  },
];

function NavItem({ href, icon, name, sub, collapsed }) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== '/' && pathname?.startsWith(href));

  return (
    <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: collapsed ? '10px 16px' : '9px 16px',
        cursor: 'pointer',
        borderRadius: 8,
        margin: '1px 8px',
        borderLeft: isActive ? '3px solid #ED6E2E' : '3px solid transparent',
        background: isActive ? 'rgba(237,110,46,0.12)' : 'transparent',
        transition: 'all 0.12s ease',
      }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(253,244,244,0.06)'; }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
      >
        <span style={{ fontSize: '1rem', flexShrink: 0, width: 20, textAlign: 'center' }}>{icon}</span>
        {!collapsed && (
          <div style={{ overflow: 'hidden' }}>
            <div style={{
              fontSize: '0.83rem',
              fontWeight: isActive ? 600 : 400,
              color: isActive ? '#ED6E2E' : 'rgba(253,244,244,0.80)',
              lineHeight: 1.2,
              fontFamily: "'Rubik', sans-serif",
            }}>{name}</div>
            <div style={{
              fontSize: '0.68rem',
              color: isActive ? 'rgba(237,110,46,0.7)' : 'rgba(253,244,244,0.35)',
              marginTop: 1,
            }}>{sub}</div>
          </div>
        )}
      </div>
    </Link>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      <style>{nunitoStyle}</style>
      <aside style={{
        width: collapsed ? 64 : 240,
        background: '#5E2733',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        position: 'fixed',
        top: 0,
        left: 0,
        height: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
        transition: 'width 0.2s ease',
      }}>

        {/* Logo */}
        <div style={{
          padding: collapsed ? '16px 12px' : '18px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}>
          <svg width={collapsed ? 30 : 36} height={collapsed ? 26 : 32} viewBox="0 0 36 32" style={{ flexShrink: 0 }}>
            <rect x="0"  y="0"  width="10" height="9"  rx="2" fill="rgba(253,244,244,0.90)"/>
            <rect x="13" y="0"  width="23" height="9"  rx="2" fill="#ED6E2E"/>
            <rect x="0"  y="12" width="22" height="9"  rx="2" fill="rgba(253,244,244,0.90)"/>
            <rect x="25" y="12" width="11" height="9"  rx="2" fill="#ED6E2E"/>
            <rect x="0"  y="24" width="10" height="8"  rx="2" fill="#ED6E2E"/>
            <rect x="13" y="24" width="23" height="8"  rx="2" fill="#ED6E2E"/>
          </svg>

          {!collapsed && (
            <div style={{ lineHeight: 1 }}>
              <div style={{
                fontFamily: "'Nunito', sans-serif",
                fontWeight: 800,
                color: 'rgba(253,244,244,0.55)',
                fontSize: 8,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
                marginBottom: 2,
              }}>DEPÓSITO</div>
              <div style={{
                fontFamily: "'Nunito', sans-serif",
                fontWeight: 900,
                color: '#ED6E2E',
                fontSize: 19,
                letterSpacing: '0.02em',
                lineHeight: 1.05,
              }}>JIMÉNEZ</div>
            </div>
          )}
        </div>

        {/* Nav groups */}
        <nav style={{ flex: 1, padding: '10px 0', overflowY: 'auto' }}>
          {navGroups.map(group => (
            <div key={group.label} style={{ marginBottom: 4 }}>
              {!collapsed && (
                <div style={{
                  padding: '8px 20px 4px',
                  fontSize: '0.60rem',
                  fontWeight: 700,
                  color: 'rgba(253,244,244,0.25)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  fontFamily: "'Rubik', sans-serif",
                }}>
                  {group.label}
                </div>
              )}
              {group.items.map(item => (
                <NavItem key={item.href} {...item} collapsed={collapsed} />
              ))}
            </div>
          ))}
        </nav>

        {/* Footer / collapse */}
        <div style={{
          padding: '12px 8px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
        }}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{
              width: '100%',
              padding: '9px 12px',
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              borderRadius: 8,
              color: 'rgba(253,244,244,0.50)',
              cursor: 'pointer',
              fontSize: 12,
              fontFamily: "'Rubik', sans-serif",
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 8,
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.10)'}
            onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
          >
            <span style={{ fontSize: 14 }}>{collapsed ? '→' : '←'}</span>
            {!collapsed && <span>Colapsar</span>}
          </button>

          {!collapsed && (
            <div style={{ padding: '10px 12px 0', fontSize: '0.62rem', color: 'rgba(253,244,244,0.20)', fontFamily: "'Rubik', sans-serif" }}>
              Génesis Orión v3.0 · 2026
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
