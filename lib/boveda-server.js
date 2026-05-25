// Bóveda de Accesos — seguridad del lado del servidor.
//
// getBovedaActor() lee la cookie de sesión, valida el usuario contra Supabase
// (getUser verifica el JWT) y solo devuelve un actor si está en la lista de
// miembros. Cualquier API de la bóveda debe llamar a esto y rechazar (403) si
// devuelve null. getBovedaDb() es el cliente con service_role que ejecuta las
// funciones de la base (las únicas que pueden tocar la tabla, protegida por RLS).

import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { bovedaMiembro } from './boveda';

export async function getBovedaActor() {
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

  const miembro = bovedaMiembro(user);
  if (!miembro) return null;

  return { id: user.id, email: user.email, nombre: miembro.nombre, admin: !!miembro.admin };
}

let _db;
export function getBovedaDb() {
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
