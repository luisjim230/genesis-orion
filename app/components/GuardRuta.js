'use client';
// Candado de pantalla, para TODA la app.
//
// Antes el sidebar solo escondía el link de los módulos sin permiso, pero
// escribiendo la dirección a mano (ej. /contabilidad) la pantalla se abría
// igual: solo 7 de 44 pantallas chequeaban permiso. Este componente vive en el
// layout, mira en qué ruta está el usuario, la traduce al módulo que le
// corresponde y bloquea si no lo tiene concedido. Así alcanza con dar de alta
// el módulo en nav-modules.js para que quede protegido.
//
// Es la capa de comodidad (mensaje lindo en pantalla). Quien de verdad guarda
// los datos es la base (RLS) y el guard de las APIs: aunque alguien saltee esto,
// no recibe información.

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '../../lib/useAuth';
import { ALL_NAV_FLAT } from '../nav-modules';

// Módulos con permiso propio que no están en el menú.
const RUTAS_EXTRA = [
  { href: '/rotacion', key: 'rotacion' },
  { href: '/vendedores', key: 'vendedores' },
  { href: '/contabilidad', key: 'contabilidad' },
];

// Rutas que NO exigen permiso de módulo: son públicas o le sirven a cualquiera
// que ya esté logueado.
const LIBRES = ['/login', '/club', '/rifa', '/marcar-interno', '/s/'];

const RUTAS = [...ALL_NAV_FLAT.map(i => ({ href: i.href, key: i.key })), ...RUTAS_EXTRA]
  // Primero las más largas, para que /finanzas/bancos gane sobre /finanzas.
  .sort((a, b) => b.href.length - a.href.length);

export function moduloDeRuta(pathname) {
  if (!pathname) return null;
  if (pathname === '/') return 'dashboard';
  const m = RUTAS.find(r => r.href !== '/' && (pathname === r.href || pathname.startsWith(r.href + '/')));
  return m ? m.key : null;
}

const caja = {
  minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 32, textAlign: 'center',
};
const tarjeta = {
  background: '#fff', borderRadius: 16, padding: '32px 28px', maxWidth: 420,
  boxShadow: '0 8px 30px rgba(0,0,0,.08)',
};

export default function GuardRuta({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, perfil, loading, error, reintentar, puedeVer } = useAuth();

  const libre = LIBRES.some(p => pathname === p || pathname?.startsWith(p));
  const modulo = libre ? null : moduloDeRuta(pathname);

  // La mitad del equipo tiene el Dashboard desactivado a propósito. Como la
  // dirección de entrada de SOL es justamente el Dashboard, esa gente entraba
  // y se topaba con un cartel de "no tenés acceso": para ellos era, en los
  // hechos, no poder entrar. En vez de bloquear, se los manda a la primera
  // pantalla que sí tengan.
  const inicioAlternativo = (!loading && user && modulo === 'dashboard' && !puedeVer('dashboard'))
    ? (ALL_NAV_FLAT.find(i => i.href !== '/' && !i.adminOnly && !i.bovedaOnly && puedeVer(i.key))?.href || null)
    : null;

  useEffect(() => {
    if (inicioAlternativo) router.replace(inicioAlternativo);
  }, [inicioAlternativo, router]);

  if (libre) return children;
  if (!modulo) return children; // ruta sin módulo asociado: la maneja la propia pantalla
  if (inicioAlternativo) {
    return <div style={caja}><div style={{ color: '#64748b' }}>Abriendo tu pantalla de inicio…</div></div>;
  }

  if (loading) {
    return <div style={caja}><div style={{ color: '#64748b' }}>Cargando…</div></div>;
  }

  // La base no contestó. Antes esto dejaba a SOL en "Cargando…" para siempre;
  // ahora se avisa y se puede reintentar sin recargar. Va ANTES del cartel de
  // permisos: sin perfil cargado, "no tenés acceso" sería mentira.
  if (error && !perfil) {
    return (
      <div style={caja}>
        <div style={tarjeta}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>📡</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, color: '#0f172a' }}>No pude cargar tu usuario</h2>
          <p style={{ margin: '0 0 18px', color: '#64748b', fontSize: 14 }}>
            La base no respondió. No es un problema de permisos: probá de nuevo en unos segundos.
          </p>
          <button onClick={reintentar}
            style={{ background: '#ED6E2E', color: '#fff', padding: '10px 20px', borderRadius: 10, border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={caja}>
        <div style={tarjeta}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔒</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, color: '#0f172a' }}>Tenés que iniciar sesión</h2>
          <p style={{ margin: '0 0 18px', color: '#64748b', fontSize: 14 }}>Entrá con tu usuario para ver esta pantalla.</p>
          <a href="/login" style={{ display: 'inline-block', background: '#ED6E2E', color: '#fff', padding: '10px 20px', borderRadius: 10, textDecoration: 'none', fontWeight: 600 }}>Ir al login</a>
        </div>
      </div>
    );
  }

  if (!puedeVer(modulo)) {
    return (
      <div style={caja}>
        <div style={tarjeta}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🚫</div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, color: '#0f172a' }}>No tenés acceso a este módulo</h2>
          <p style={{ margin: '0 0 4px', color: '#64748b', fontSize: 14 }}>
            {perfil?.nombre ? `${perfil.nombre}, este` : 'Este'} módulo no está habilitado para tu usuario.
          </p>
          <p style={{ margin: 0, color: '#94a3b8', fontSize: 13 }}>Si lo necesitás, pedíselo a un administrador.</p>
        </div>
      </div>
    );
  }

  return children;
}
