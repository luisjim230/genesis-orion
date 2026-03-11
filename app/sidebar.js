'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const nunitoStyle = `@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;800;900&display=swap');`;

const navGroups = [
  {
    label: 'Principal',
    items: [
      { href: '/',             icon: '⊞',  name: 'Dashboard' },
    ],
  },
  {
    label: 'Inventario',
    items: [
      { href: '/inventario',   icon: '📦', name: 'Compras' },
      { href: '/trazabilidad', icon: '🔴', name: 'Trazabilidad de inventario y compras' },
      { href: '/rotacion',     icon: '🔄', name: 'Rotación de productos' },
      { href: '/reportes',     icon: '📊', name: 'Carga de reportes' },
      // { href: '/helios',    icon: '💡', name: 'Inteligencia Comercial' },  // oculto
    ],
  },
  {
    label: 'Comercial',
    items: [
      { href: '/comercial', icon: '💼', name: 'Comercial' },
    ],
  },
  {
    label: 'Importaciones',
    items: [
      { href: '/cif',          icon: '🧮', name: 'Calculadora de importación' },
      { href: '/contenedores', icon: '🚢', name: 'Cargas en tránsito' },
      { href: '/mercado',      icon: '⚡', name: 'Mercado' },
    ],
  },
  {
    label: 'Gestión',
    items: [
      { href: '/finanzas',     icon: '💰', name: 'Finanzas' },
      { href: '/tareas',       icon: '✅', name: 'Tareas' },
      // { href: '/redes',     icon: '📱', name: 'Redes Sociales' },  // oculto
    ],
  },
  {
    label: 'Herramientas',
    items: [
      { href: '/ponderacion',  icon: '⚖️', name: 'Promedios ponderados' },
    ],
  },
];

function NavItem({ href, icon, name, collapsed }) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== '/' && pathname?.startsWith(href));

  return (
    <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px',
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
          <div style={{
            fontSize: '0.83rem',
            fontWeight: isActive ? 600 : 400,
            color: isActive ? '#ED6E2E' : 'rgba(253,244,244,0.80)',
            lineHeight: 1.3,
            fontFamily: "'Rubik', sans-serif",
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{name}</div>
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
          <svg width={collapsed ? 32 : 36} height={collapsed ? 32 : 36} viewBox="0 0 36 36" style={{ flexShrink: 0 }}>
            {/* Sol — círculo central */}
            <circle cx="18" cy="18" r="7" fill="#ED6E2E"/>
            {/* Rayos del sol — 8 rayos */}
            <line x1="18" y1="2"  x2="18" y2="8"  stroke="rgba(253,244,244,0.90)" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="18" y1="28" x2="18" y2="34" stroke="rgba(253,244,244,0.90)" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="2"  y1="18" x2="8"  y2="18" stroke="rgba(253,244,244,0.90)" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="28" y1="18" x2="34" y2="18" stroke="rgba(253,244,244,0.90)" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="6.1" y1="6.1"   x2="10.3" y2="10.3" stroke="#ED6E2E" strokeWidth="2.2" strokeLinecap="round" opacity="0.75"/>
            <line x1="25.7" y1="25.7" x2="29.9" y2="29.9" stroke="#ED6E2E" strokeWidth="2.2" strokeLinecap="round" opacity="0.75"/>
            <line x1="29.9" y1="6.1"  x2="25.7" y2="10.3" stroke="#ED6E2E" strokeWidth="2.2" strokeLinecap="round" opacity="0.75"/>
            <line x1="10.3" y1="25.7" x2="6.1"  y2="29.9" stroke="#ED6E2E" strokeWidth="2.2" strokeLinecap="round" opacity="0.75"/>
          </svg>
          {!collapsed && (
            <div style={{ lineHeight: 1 }}>
              <div style={{
                fontFamily: "'Nunito', sans-serif",
                fontWeight: 800,
                color: 'rgba(253,244,244,0.55)',
                fontSize: 6.5,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                marginBottom: 2,
              }}>SISTEMA DE OPERACIONES Y</div>
              <div style={{
                fontFamily: "'Nunito', sans-serif",
                fontWeight: 900,
                color: '#ED6E2E',
                fontSize: 19,
                letterSpacing: '0.02em',
                lineHeight: 1.05,
              }}>LOGÍSTICA</div>
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
              SOL v1.0 · 2026
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
