import { createClient } from '@supabase/supabase-js';

let _sb;
export function sb() {
  if (!_sb) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _sb;
}

export function jsonError(message, status = 500, extra = {}) {
  return Response.json({ error: String(message || 'unknown'), ...extra }, { status });
}

// Trae todas las filas paginando (Supabase limita a 1000 por request)
export async function fetchAll(query, batch = 1000) {
  let all = [];
  let offset = 0;
  // query debe permitir .range(); pasamos un builder factory
  while (true) {
    const { data, error } = await query(offset, offset + batch - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < batch) break;
    offset += batch;
  }
  return all;
}
