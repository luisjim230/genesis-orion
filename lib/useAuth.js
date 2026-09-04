'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabase';
import { puedeVerModulo } from './permisos';

// Cuánto esperamos a que la base conteste antes de soltar el spinner igual.
// El 4/9/2026 Supabase quedó saturado (4 vistas materializadas refrescándose a
// la vez) y la consulta a usuarios_sol nunca resolvió: `loading` se quedó en
// true para siempre y GuardRuta —que vive en el layout— dejó TODA la app en
// "Cargando…" con la pantalla en blanco. Nada la destrababa salvo recargar.
// Ahora, pase lo que pase, el spinner se suelta y la pantalla dice qué falló.
const TIMEOUT_MS = 12000;

export function useAuth() {
  const [user, setUser]       = useState(null);
  const [perfil, setPerfil]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [intento, setIntento] = useState(0);

  // Permite reintentar desde la UI sin recargar la página entera.
  const reintentar = useCallback(() => {
    setError(null);
    setLoading(true);
    setIntento((n) => n + 1);
  }, []);

  useEffect(() => {
    let vivo = true;

    // Red de seguridad: si una consulta queda colgada (la base no responde ni
    // corta), el finally nunca corre. Este reloj suelta el spinner igual.
    const reloj = setTimeout(() => {
      if (!vivo) return;
      setError((e) => e || new Error('La base tardó demasiado en responder.'));
      setLoading(false);
    }, TIMEOUT_MS);

    async function cargarPerfil(userId) {
      try {
        // 1) Buscar en usuarios_sol por auth_id
        const { data: perfilSol, error: e1 } = await supabase
          .from('usuarios_sol').select('*').eq('auth_id', userId).maybeSingle();
        if (e1) throw e1;
        if (perfilSol) { if (vivo) { setPerfil(perfilSol); setError(null); } return; }

        // 2) Si no encontró por auth_id, buscar por email del usuario autenticado.
        //    Esto cubre casos donde auth_id no está seteado en usuarios_sol.
        const { data: { session } } = await supabase.auth.getSession();
        const email = session?.user?.email;
        if (email) {
          const { data: perfilByEmail, error: e2 } = await supabase
            .from('usuarios_sol').select('*').eq('email', email).maybeSingle();
          if (e2) throw e2;
          if (perfilByEmail) {
            // Auto-corregir: guardar auth_id para que el próximo login sea directo
            supabase.from('usuarios_sol').update({ auth_id: userId }).eq('id', perfilByEmail.id).then(() => {});
            if (vivo) { setPerfil(perfilByEmail); setError(null); }
            return;
          }
        }

        // 3) Para cuentas @sol.internal: extraer username y buscar por username
        if (email?.endsWith('@sol.internal')) {
          const username = email.split('@')[0];
          const { data: perfilByUsername, error: e3 } = await supabase
            .from('usuarios_sol').select('*').eq('username', username).maybeSingle();
          if (e3) throw e3;
          if (perfilByUsername) {
            supabase.from('usuarios_sol').update({ auth_id: userId, email }).eq('id', perfilByUsername.id).then(() => {});
            if (vivo) { setPerfil(perfilByUsername); setError(null); }
            return;
          }
        }

        // 4) Fallback: tabla legacy genesis_usuarios
        const { data: perfilLegacy } = await supabase
          .from('genesis_usuarios').select('*').eq('user_id', userId).maybeSingle();
        if (vivo) { setPerfil(perfilLegacy ?? null); setError(null); }
      } catch (e) {
        // La base no contestó. NO dejamos la app colgada: se marca el error y
        // el finally suelta el spinner; GuardRuta muestra "Reintentar".
        if (vivo) setError(e);
      } finally {
        if (vivo) setLoading(false);
      }
    }

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!vivo) return;
        setUser(session?.user ?? null);
        if (session?.user) return cargarPerfil(session.user.id);
        setLoading(false);
      })
      .catch((e) => { if (vivo) { setError(e); setLoading(false); } });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!vivo) return;
      setUser(session?.user ?? null);
      if (session?.user) cargarPerfil(session.user.id);
      else { setPerfil(null); setLoading(false); }
    });

    return () => { vivo = false; clearTimeout(reloj); subscription.unsubscribe(); };
  }, [intento]);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  function puedeVer(modulo) {
    return puedeVerModulo(perfil, modulo);
  }

  return { user, perfil, loading, error, reintentar, logout, puedeVer };
}
