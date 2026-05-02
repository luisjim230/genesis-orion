'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/useAuth';

// Misma estructura que sidebar.js — key debe coincidir con la key del sidebar
const ALL_NAV = [
  { href: '/',                  icon: '⊞',  name: 'Dashboard', key: 'dashboard' },
  { href: '/inventario',        icon: '📦', name: 'Compras', key: 'inventario' },
  { href: '/trazabilidad',      icon: '🔴', name: 'Trazabilidad', key: 'trazabilidad' },
  { href: '/kronos',            icon: '📈', name: 'Proyección', key: 'kronos' },
  { href: '/reportes',          icon: '📊', name: 'Reportes', key: 'reportes' },
  { href: '/comercial',         icon: '💼', name: 'Comercial', key: 'comercial' },
  { href: '/comercial/seguimiento-proformas', icon: '📋', name: 'Seguimiento de Proformas', key: 'seguimiento-proformas' },
  { href: '/cif',               icon: '🧮', name: 'Importación', key: 'cif' },
  { href: '/contenedores',      icon: '🚢', name: 'Cargas', key: 'contenedores' },
  { href: '/aduana',            icon: '🛃', name: 'Aduana · TLC China', key: 'aduana' },
  { href: '/mercado',           icon: '⚡', name: 'Mercado', key: 'mercado' },
  { href: '/radar',             icon: '📡', name: 'RADAR', key: 'radar' },
  { href: '/campanas',          icon: '📣', name: 'Campañas', key: 'campanas' },
  { href: '/metricas-web',      icon: '📊', name: 'Métricas Web', key: 'metricas-web' },
  { href: '/cajas-aurora',      icon: '🌅', name: 'Cajas', key: 'cajas-aurora' },
  { href: '/entregas',          icon: '🚛', name: 'Entregas', key: 'entregas' },
  { href: '/finanzas',          icon: '💰', name: 'Finanzas', key: 'finanzas' },
  { href: '/finanzas/bancos',   icon: '🏦', name: 'Bancos', key: 'bancos' },
  { href: '/pagos',             icon: '💸', name: 'Pagos', key: 'pagos' },
  { href: '/tareas',            icon: '✅', name: 'Tareas', key: 'tareas' },
  { href: '/tareas-equipo',     icon: '📋', name: 'Tareas Equipo', key: 'tareas-equipo' },
  { href: '/social',            icon: '📱', name: 'Redes Sociales', key: 'social' },
  { href: '/kommo-proveedores', icon: '📲', name: 'WhatsApp Proveedores', key: 'kommo-proveedores' },
  { href: '/ponderacion',       icon: '⚖️', name: 'Ponderados', key: 'ponderacion' },
  { href: '/materiales',        icon: '🧱', name: 'Materiales', key: 'materiales' },
  { href: '/fichas-tecnicas',   icon: '📄', name: 'Fichas Técnicas', key: 'fichas-tecnicas' },
  { href: '/garantias',         icon: '🔄', name: 'Garantías', key: 'garantias' },
  { href: '/encomiendas',       icon: '📦', name: 'Encomiendas', key: 'encomiendas' },
  { href: '/rrhh',              icon: '👥', name: 'Recursos Humanos', key: 'rrhh' },
  { href: '/vendedores',        icon: '🏷️', name: 'Vendedores', key: 'vendedores' },
  { href: '/admin',             icon: '⚙️', name: 'Usuarios', key: 'admin', adminOnly: true },
];

// Quita tildes y pasa a minúscula para búsqueda fuzzy
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const pathname = usePathname();
  const { perfil, loading, puedeVer } = useAuth();

  // Filtrar por permisos del usuario — igual que el sidebar de desktop
  const NAV_PERMITIDOS = loading ? [] : ALL_NAV.filter(item => {
    if (item.adminOnly) return perfil?.rol === 'admin';
    return puedeVer(item.key);
  });

  // Filtrar por texto de búsqueda
  const q = norm(search.trim());
  const NAV = q ? NAV_PERMITIDOS.filter(i => norm(i.name).includes(q)) : NAV_PERMITIDOS;

  const current = NAV_PERMITIDOS.find(n => n.href === pathname || (n.href !== '/' && pathname?.startsWith(n.href)));

  // Cerrar drawer también limpia búsqueda
  const cerrarDrawer = () => { setOpen(false); setSearch(''); };

  return (
    <>
      <div id="mobile-topbar" style={{
        display: 'none',
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        background: '#5E2733', height: 52,
        alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width={28} height={24} viewBox="0 0 56 48">
            <rect x="0"  y="0"  width="16" height="9" rx="2" fill="rgba(255,255,255,0.90)"/>
            <rect x="20" y="0"  width="24" height="9" rx="2" fill="#ED6E2E"/>
            <rect x="0"  y="13" width="24" height="9" rx="2" fill="#ED6E2E"/>
            <rect x="28" y="13" width="16" height="9" rx="2" fill="#ED6E2E"/>
            <rect x="0"  y="26" width="10" height="9" rx="2" fill="#ED6E2E"/>
            <rect x="14" y="26" width="30" height="9" rx="2" fill="#ED6E2E"/>
          </svg>
          <span style={{ color: '#ED6E2E', fontWeight: 700, fontSize: '1rem', fontFamily: 'Rubik, sans-serif' }}>
            {current ? `${current.icon} ${current.name}` : 'SOL'}
          </span>
        </div>
        <button onClick={() => setOpen(true)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', gap: 4, padding: 6,
        }}>
          <span style={{ display: 'block', width: 22, height: 2, background: 'rgba(253,244,244,0.8)', borderRadius: 2 }}/>
          <span style={{ display: 'block', width: 22, height: 2, background: 'rgba(253,244,244,0.8)', borderRadius: 2 }}/>
          <span style={{ display: 'block', width: 22, height: 2, background: 'rgba(253,244,244,0.8)', borderRadius: 2 }}/>
        </button>
      </div>

      {open && (
        <div onClick={cerrarDrawer} style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.5)',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            position: 'absolute', top: 0, left: 0, bottom: 0, width: 280,
            background: '#5E2733', overflowY: 'auto',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <span style={{ color: '#ED6E2E', fontWeight: 900, fontSize: '1.2rem', fontFamily: 'Rubik, sans-serif' }}>SOL</span>
              <button onClick={cerrarDrawer} style={{
                background: 'none', border: 'none', color: 'rgba(253,244,244,0.6)',
                fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1,
              }}>✕</button>
            </div>
            <div style={{ padding: '10px 12px', flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Buscar módulo..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  autoFocus={false}
                  style={{
                    width: '100%',
                    padding: '9px 12px 9px 32px',
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    color: 'rgba(255,255,255,0.85)',
                    fontSize: '0.88rem',
                    fontFamily: 'Rubik, sans-serif',
                    outline: 'none',
                    boxSizing: 'border-box',
                    WebkitAppearance: 'none',
                  }}
                  onFocus={e => e.target.style.borderColor = 'rgba(237,110,46,0.5)'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
                <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }}>&#128269;</span>
                {search && (
                  <span onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: '0.78rem', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '4px 6px' }}>✕</span>
                )}
              </div>
            </div>
            <nav style={{ flex: 1, padding: '6px 0', overflowY: 'auto' }}>
              {NAV.length === 0 && (
                <div style={{ padding: '30px 20px', color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', textAlign: 'center', fontStyle: 'italic' }}>
                  Sin resultados para "{search}"
                </div>
              )}
              {NAV.map(item => {
                const isActive = item.href === pathname || (item.href !== '/' && pathname?.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href} onClick={cerrarDrawer} style={{ textDecoration: 'none', display: 'block' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '11px 20px',
                      borderLeft: isActive ? '3px solid #ED6E2E' : '3px solid transparent',
                      background: isActive ? 'rgba(237,110,46,0.12)' : 'transparent',
                    }}>
                      <span style={{ fontSize: '1rem', width: 22, textAlign: 'center' }}>{item.icon}</span>
                      <span style={{
                        fontSize: '0.88rem', fontFamily: 'Rubik, sans-serif',
                        color: isActive ? '#ED6E2E' : 'rgba(253,244,244,0.82)',
                        fontWeight: isActive ? 600 : 400,
                      }}>{item.name}</span>
                    </div>
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          #mobile-topbar { display: flex !important; }
          #sol-main { padding-top: 68px !important; }
        }
      `}</style>
    </>
  );
}
