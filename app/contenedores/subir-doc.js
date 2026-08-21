'use client';
import { supabase } from '../../lib/supabase';

// Sube documentos y los manda a leer.
//
// El binario va DIRECTO de la compu al bucket de Supabase con una URL firmada,
// sin pasar por la API: el body de una función de Vercel tope en 4.5 MB y una
// proforma con fotos adentro pesa bastante más que eso. Después la API solo
// recibe la ruta del archivo ya guardado.
//
// Devuelve la lista de resultados, uno por archivo:
//   estado: 'procesado' | 'sin_leer' | 'duplicado' | 'error'

const BUCKET = 'contenedores';

export async function subirDocumentos(files, { envioId, onProgreso } = {}) {
  const todos = [];
  const total = files.length;

  for (let i = 0; i < total; i++) {
    const file = files[i];
    const cual = total > 1 ? ` ${i + 1} de ${total}` : '';
    try {
      onProgreso?.(`Subiendo${cual}...`);
      const { path, token } = await pedirJson('/api/contenedores/upload-url', {
        nombre: file.name, tamano: file.size,
      });

      const { error } = await supabase.storage.from(BUCKET)
        .uploadToSignedUrl(path, token, file, { contentType: file.type || undefined });
      if (error) throw new Error('No se pudo subir: ' + error.message);

      onProgreso?.(`Leyendo${cual}...`);
      const r = await pedirJson('/api/contenedores/docs', {
        envio_id: envioId || undefined,
        archivos: [{ path, nombre: file.name, tamano: file.size }],
      });
      todos.push(...(r.resultados || []));
    } catch (e) {
      todos.push({ archivo: file.name, estado: 'error', motivo: e.message });
    }
  }

  onProgreso?.(null);
  return todos;
}

// Arma el aviso que ve Luis a partir de los resultados.
export function resumirSubida(todos) {
  const ok    = todos.filter(x => x.estado === 'procesado');
  const crudo = todos.filter(x => x.estado === 'sin_leer');
  const dup   = todos.filter(x => x.estado === 'duplicado');
  const mal   = todos.filter(x => x.estado === 'error');
  const partes = [];
  if (ok.length)    partes.push(`${ok.length} archivo(s) leído(s)`);
  if (dup.length)   partes.push(`${dup.length} ya estaba(n) subido(s)`);
  if (crudo.length) partes.push(`${crudo.length} se guardó pero no se pudo leer: ${crudo.map(x => x.motivo).join(' · ')}`);
  if (mal.length)   partes.push(`${mal.length} con problema: ${mal.map(x => x.archivo + ' — ' + x.motivo).join(' · ')}`);
  return {
    texto: partes.join(' · ') || 'No pasó nada.',
    tipo: (mal.length || crudo.length) ? 'warn' : 'ok',
    ok, crudo, dup, mal,
  };
}

// Un fetch que nunca revienta con "is not valid JSON": si el servidor contesta
// cualquier otra cosa (un 413, un timeout del proxy), traduce el código a algo
// que se entienda.
async function pedirJson(url, body) {
  let r;
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Se cortó la conexión. Probá de nuevo.');
  }
  const txt = await r.text();
  let json = null;
  try { json = JSON.parse(txt); } catch { /* no era JSON */ }
  if (!r.ok) throw new Error(json?.error || mensajeHttp(r.status));
  if (!json) throw new Error('El servidor contestó algo raro. Probá de nuevo.');
  return json;
}

function mensajeHttp(status) {
  if (status === 413) return 'El archivo es demasiado grande.';
  if (status === 504 || status === 408) return 'Tardó demasiado y se cortó. Probá con un archivo a la vez.';
  if (status >= 500) return `El servidor falló (${status}). Probá de nuevo en un minuto.`;
  return `No se pudo procesar (${status}).`;
}
