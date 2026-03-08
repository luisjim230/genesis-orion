import { DM_Sans } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const dmSans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

export const metadata = {
  title: 'Génesis Orión – Corporación Rojimo S.A.',
  description: 'Sistema de gestión empresarial · Depósito Jiménez',
};

const navGroups = [
  {
    label: 'Principal',
    items: [
      { href: '/', icon: '🌌', name: 'Cosmos', sub: 'Dashboard' },
    ],
  },
  {
    label: 'Inventario',
    items: [
      { href: '/inventario', icon: '🪐', name: 'Saturno', sub: 'Inventario' },
      { href: '/trazabilidad', icon: '🔴', name: 'Nehemías', sub: 'Trazabilidad' },
      { href: '/reportes', icon: '🌟', name: 'Ezequiel', sub: 'Centro de Datos' },
      { href: '/helios', icon: '☀️', name: 'Helios', sub: 'Inteligencia Comercial' },
    ],
  },
  {
    label: 'Importaciones',
    items: [
      { href: '/cif', icon: '💫', name: 'Halley', sub: 'Calculadora CIF' },
      { href: '/contenedores', icon: '🌊', name: 'Jonás', sub: 'Contenedores' },
      { href: '/mercado', icon: '⚡', name: 'Isaías', sub: 'Mercado' },
    ],
  },
  {
    label: 'Gestión',
    items: [
      { href: '/finanzas', icon: '💰', name: 'Números', sub: 'Finanzas' },
      { href: '/tareas', icon: '✨', name: 'Matusalén', sub: 'Tareas' },
      { href: '/redes', icon: '🌙', name: 'Crónicas', sub: 'Redes Sociales' },
    ],
  },
  {
    label: 'Herramientas',
    items: [
      { href: '/ponderacion', icon: '⚖️', name: 'Esdras', sub: 'Ponderación' },
    ],
  },
];

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
      </head>
      <body className={dmSans.className} style={{ margin: 0, display: 'flex', background: '#0f1115', minHeight: '100vh' }}>
        <Sidebar />
        <main style={{ flex: 1, marginLeft: '230px', minHeight: '100vh', background: '#0f1115' }}>
          {children}
        </main>
      </body>
    </html>
  );
}

function Sidebar() {
  return (
    <aside style={{
      width: '230px',
      background: '#1c1f26',
      borderRight: '1px solid #252a35',
      position: 'fixed',
      top: 0,
      left: 0,
      height: '100vh',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 100,
      fontFamily: 'DM Sans, sans-serif',
    }}>
      <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid #252a35' }}>
        <div style={{ fontSize: '1.15em', fontWeight: 800, color: '#c8a84b', letterSpacing: '-0.02em' }}>
          🌌 Génesis Orión
        </div>
        <div style={{ fontSize: '0.72em', color: '#5a6a80', marginTop: '3px', letterSpacing: '0.05em' }}>
          Corporación Rojimo S.A.
        </div>
      </div>
      <nav style={{ flex: 1, padding: '12px 0' }}>
        {navGroups.map(group => (
          <div key={group.label} style={{ marginBottom: '8px' }}>
            <div style={{ padding: '6px 20px 4px', fontSize: '0.65em', fontWeight: 700, color: '#3a4455', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              {group.label}
            </div>
            {group.items.map(item => (
              <NavItem key={item.href} {...item} />
            ))}
          </div>
        ))}
      </nav>
      <div style={{ padding: '12px 20px', borderTop: '1px solid #252a35' }}>
        <div style={{ fontSize: '0.68em', color: '#3a4455' }}>Génesis Orión v3.0</div>
        <div style={{ fontSize: '0.65em', color: '#3a4455', marginTop: '1px' }}>Depósito Jiménez · 2026</div>
      </div>
    </aside>
  );
}

function NavItem({ href, icon, name, sub }) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 20px', cursor: 'pointer', borderLeft: '3px solid transparent' }}
        onMouseEnter={e => { e.currentTarget.style.background = '#252a35'; e.currentTarget.style.borderLeftColor = '#c8a84b'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderLeftColor = 'transparent'; }}
      >
        <span style={{ fontSize: '1em', flexShrink: 0 }}>{icon}</span>
        <div>
          <div style={{ fontSize: '0.85em', fontWeight: 600, color: '#c9d1e0', lineHeight: 1.2 }}>{name}</div>
          <div style={{ fontSize: '0.68em', color: '#5a6a80' }}>{sub}</div>
        </div>
      </div>
    </Link>
  );
}
