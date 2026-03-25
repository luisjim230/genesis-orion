'use client';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/',                  icon: '⊞',  name: 'Dashboard' },
  { href: '/inventario',        icon: '📦', name: 'Compras' },
  { href: '/trazabilidad',      icon: '🔴', name: 'Trazabilidad' },
  { href: '/kronos',            icon: '📈', name: 'Proyección' },
  { href: '/reportes',          icon: '📊', name: 'Reportes' },
  { href: '/comercial',         icon: '💼', name: 'Comercial' },
  { href: '/cif',               icon: '🧮', name: 'Importación' },
  { href: '/contenedores',      icon: '🚢', name: 'Cargas' },
  { href: '/mercado',           icon: '⚡', name: 'Mercado' },
  { href: '/cajas-aurora',      icon: '🌅', name: 'Cajas' },
  { href: '/entregas',          icon: '🚛', name: 'Entregas' },
  { href: '/finanzas',          icon: '💰', name: 'Finanzas' },
  { href: '/finanzas/bancos',   icon: '🏦', name: 'Bancos' },
  { href: '/pagos',             icon: '💸', name: 'Pagos' },
  { href: '/tareas',            icon: '✅', name: 'Tareas' },
  { href: '/social',            icon: '📱', name: 'Redes Sociales' },
  { href: '/kommo-proveedores', icon: '📲', name: 'WhatsApp Proveedores' },
  { href: '/ponderacion',       icon: '⚖️', name: 'Ponderados' },
  { href: '/materiales',        icon: '🧱', name: 'Materiales' },
  { href: '/garantias',         icon: '🔄', name: 'Garantías' },
  { href: '/vendedores',        icon: '🏷️', name: 'Vendedores' },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const current = NAV.find(n => n.href === pathname || (n.href !== '/' && pathname?.startsWith(n.href)));

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
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.5)',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            position: 'absolute', top: 0, left: 0, bottom: 0, width: 260,
            background: '#5E2733', overflowY: 'auto',
            display: 'flex', flexDirection: 'column',
          }}>
            <div style={{
              padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ color: '#ED6E2E', fontWeight: 900, fontSize: '1.2rem', fontFamily: 'Rubik, sans-serif' }}>SOL</span>
              <button onClick={() => setOpen(false)} style={{
                background: 'none', border: 'none', color: 'rgba(253,244,244,0.6)',
                fontSize: '1.4rem', cursor: 'pointer', lineHeight: 1,
              }}>✕</button>
            </div>
            <nav style={{ flex: 1, padding: '10px 0' }}>
              {NAV.map(item => {
                const isActive = item.href === pathname || (item.href !== '/' && pathname?.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href} onClick={() => setOpen(false)} style={{ textDecoration: 'none', display: 'block' }}>
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
