'use client';
import { createBrowserClient } from '@supabase/ssr';
import { useEffect, useState } from 'react';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const PERMISOS_ROL = {
  admin:     ['dashboard','inventario','trazabilidad','rotacion','kronos','reportes','comercial','cif','contenedores','mercado','finanzas','tareas','ponderacion','social','admin'],
  bodega:    ['dashboard','inventario','trazabilidad','rotacion','kronos','contenedores'],
  ventas:    ['dashboard','trazabilidad','comercial','reportes'],
  finanzas:  ['dashboard','contenedores','mercado','ponderacion','finanzas'],
  logistica: ['dashboard','contenedores','cif','mercado','reportes'],
};

export function useAuth() {
  const [user, setUser]       = useState(null);
  const [perfil, setPerfil]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) cargarPerfil(session.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (session?.user) cargarPerfil(session.user.id);
      else { setPerfil(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function cargarPerfil(userId) {
    // Primero intentar en usuarios_sol por auth_id
    const { data: perfilSol } = await supabase
      .from('usuarios_sol')
      .select('*')
      .eq('auth_id', userId)
      .maybeSingle();

    if (perfilSol) {
      setPerfil(perfilSol);
      setLoading(false);
      return;
    }

    // Fallback: tabla legacy genesis_usuarios
    const { data: perfilLegacy } = await supabase
      .from('genesis_usuarios')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    setPerfil(perfilLegacy ?? null);
    setLoading(false);
  }

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  function puedeVer(modulo) {
    if (!perfil) return false;
    if (perfil.rol === 'admin') return true;
    if (perfil.permisos_extra && perfil.permisos_extra[modulo] !== undefined) return perfil.permisos_extra[modulo];
    return (PERMISOS_ROL[perfil.rol] || ['dashboard']).includes(modulo);
  }

  return { user, perfil, loading, logout, puedeVer };
}
