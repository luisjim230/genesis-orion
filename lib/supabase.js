// Cliente de Supabase para el NAVEGADOR.
//
// IMPORTANTE — esto antes era createClient(url, anonKey, { persistSession: false }),
// o sea: todas las pantallas de SOL le hablaban a la base como usuario ANÓNIMO,
// sin mandar la sesión del usuario. Por eso las políticas de la base tuvieron que
// abrirse a "cualquiera", y cualquier persona en internet con la clave pública
// (que viaja en el JavaScript de la página) podía leer contabilidad, bancos,
// planilla y la lista de usuarios sin siquiera loguearse.
//
// Ahora usa createBrowserClient de @supabase/ssr: comparte las cookies de sesión
// con el login y con el middleware, así cada consulta viaja identificada como el
// usuario logueado y la base puede decidir qué mostrarle.
//
// Se crea perezosamente (al primer uso) para no instanciarlo durante el render
// del lado del servidor.

import { createBrowserClient } from '@supabase/ssr';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xeeieqjqmtoiutfnltqu.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_TX8OYawDu3vjd1Upet2GbQ_SURnQqRs';

let _cliente;
export function getSupabase() {
  if (!_cliente) _cliente = createBrowserClient(url, key);
  return _cliente;
}

// Se mantiene el export `supabase` para no tocar las ~40 pantallas que ya lo
// importan. El proxy difiere la creación del cliente hasta el primer acceso.
export const supabase = new Proxy({}, {
  get(_t, prop) {
    const c = getSupabase();
    const v = c[prop];
    return typeof v === 'function' ? v.bind(c) : v;
  },
});
