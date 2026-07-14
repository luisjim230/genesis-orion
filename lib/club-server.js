// Club del Enchapador — acceso privilegiado del lado del servidor (panel admin).
//
// Las tablas club_ tienen RLS activado sin políticas para el público, así que el
// panel admin las lee/escribe desde el servidor con la service role key. Toda
// API del panel debe validar primero que haya una sesión de SOL (getClubActor)
// y rechazar (401) si no la hay — el middleware NO protege /api.

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

// Devuelve el usuario autenticado de SOL (JWT verificado por getUser) o null.
export async function getClubActor() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() { /* solo lectura en route handlers */ },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  return { id: user.id, email: user.email };
}

let _db;
export function getClubDb() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno');
  }
  if (!_db) {
    _db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return _db;
}
