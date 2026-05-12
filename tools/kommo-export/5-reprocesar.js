// Paso 5 — re-procesar los HTML locales con selectores correctos.
// Uso: node 5-reprocesar.js
//
// Toma cada export/AAAA-MM/lead_X/conversacion.html (que ya tenemos en disco)
// y vuelve a generar conversacion.json con role/vendedor/fecha bien detectados.
// NO vuelve a Kommo — todo se procesa localmente.
//
// Mueve cada lead a la carpeta del mes correcto (basado en la fecha de su
// primer mensaje, no en created_at del lead).

const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const NOMBRES_BOT = ['Robot', 'SalesBot', 'Bot', 'Call Center'];
function esBot(nombre) {
  if (!nombre) return false;
  // "Call Center" solo aparece solo cuando es genérico, no como sufijo de un vendedor real.
  if (nombre === 'Call Center') return true;
  return ['Robot', 'SalesBot', 'Bot'].some((b) => nombre.includes(b));
}

function normalizarVendedor(nombre) {
  if (!nombre) return null;
  // "Marietta Blanco (Call Center)" → "Marietta Blanco"
  return nombre.replace(/\s*\(Call Center\)\s*$/i, '').trim();
}

function detectarCanal(html) {
  // Busca los íconos de origen en cada mensaje del HTML.
  const matches = html.match(/feed-note__icon-origin[^>]*>\s*<img[^>]+src="[^"]+"/g) || [];
  const counts = { whatsapp: 0, instagram: 0, facebook: 0, otro: 0 };
  for (const m of matches) {
    const src = (m.match(/src="([^"]+)"/) || [])[1] || '';
    const name = src.split('/').pop().toLowerCase();
    if (name.includes('waba') || name.includes('whatsapp') || name.includes('wazzup')) {
      counts.whatsapp++;
    } else if (name.includes('instagram')) {
      counts.instagram++;
    } else if (name.includes('facebook') || name.includes('messenger') || name.includes('fb')) {
      counts.facebook++;
    } else {
      counts.otro++;
    }
  }
  // Canal con más matches gana.
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] === 0) return 'desconocido';
  return top[0];
}

function parseFechaDDMMYYYY(str) {
  if (!str) return null;
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return { dd: m[1], mm: m[2], yyyy: m[3], mes: `${m[3]}-${m[2]}` };
}

function extraerMensajes(html) {
  const $ = cheerio.load(html);
  const out = [];
  // Solo procesamos divs CUYA clase EMPIEZA con "feed-note " (con espacio) — la nota raíz.
  // No queremos .feed-note__body, .feed-note__header, etc (que son hijos).
  $('div').each((_i, el) => {
    const cls = ($(el).attr('class') || '').toString();
    // La clase del nodo raíz de una nota tiene "feed-note " seguido de modificadores.
    // No empieza con "feed-note__" (eso es BEM child) ni "feed-note-wrapper" (eso es contenedor).
    if (!/(^|\s)feed-note(\s|$)/.test(cls)) return;
    if (cls.includes('feed-note__')) return;
    if (cls.includes('feed-note-wrapper')) return;
    if (cls.includes('feed-note-grouped-complex__')) return;
    if (cls.includes('feed-note-fixer')) return;

    // Saltear eventos del sistema (no son mensajes).
    if (cls.includes('feed-note-system')) return;

    // Detectar tipo: incoming = cliente, external sin incoming = vendedor.
    const isIn = cls.includes('feed-note-incoming');
    const isExternal = cls.includes('feed-note-external');
    if (!isIn && !isExternal) return; // Notas internas/automáticas: skip.

    // Extraer texto del mensaje.
    let textParts = [];
    $(el)
      .find('.feed-note__message_paragraph')
      .each((_j, p) => {
        const t = $(p).text().trim();
        if (t) textParts.push(t);
      });
    if (textParts.length === 0) {
      const body = $(el).find('.feed-note__body').first().text().trim();
      if (body && body.length < 5000) textParts.push(body);
    }
    const text = textParts.join('\n').trim();
    if (!text) return;

    // Autor: title de .feed-note__amojo-user (preferido) o .feed-note__avatar.
    const author =
      $(el).find('.feed-note__amojo-user').first().attr('title') ||
      $(el).find('.feed-note__avatar').first().attr('title') ||
      null;
    const vendedor = isIn ? null : normalizarVendedor(author);

    // Fecha del mensaje.
    const dateStr = $(el).find('.feed-note__date').first().text().trim();
    const fecha = parseFechaDDMMYYYY(dateStr);

    out.push({
      role: isIn ? 'user' : 'assistant',
      content: text,
      vendedor,
      fecha: dateStr || null,
      mes: fecha?.mes || null,
    });
  });
  return out;
}

function mesPrimerMensaje(mensajes) {
  for (const m of mensajes) {
    if (m.mes) return m.mes;
  }
  return null;
}

function* recorrerLeads(dir) {
  for (const mes of fs.readdirSync(dir)) {
    if (!/^\d{4}-\d{2}$/.test(mes)) continue;
    const dirMes = path.join(dir, mes);
    for (const lead of fs.readdirSync(dirMes)) {
      const dirLead = path.join(dirMes, lead);
      const htmlPath = path.join(dirLead, 'conversacion.html');
      const jsonPath = path.join(dirLead, 'conversacion.json');
      if (fs.existsSync(htmlPath)) {
        yield { mesActual: mes, lead, dirLead, htmlPath, jsonPath };
      }
    }
  }
}

(async () => {
  if (!fs.existsSync(config.EXPORT_DIR)) {
    console.error('✗ No existe export/');
    process.exit(1);
  }

  let total = 0,
    ok = 0,
    sinMensajes = 0,
    movidos = 0,
    errores = 0;

  const cuentaPorMes = {};
  const cuentaPorVendedor = {};
  const cuentaPorCanal = {};

  for (const e of recorrerLeads(config.EXPORT_DIR)) {
    total++;
    try {
      const html = fs.readFileSync(e.htmlPath, 'utf8');
      const mensajes = extraerMensajes(html);
      const canal = detectarCanal(html);

      // Cargar JSON previo para conservar lead_id, contact_name, telefono.
      let meta = {};
      if (fs.existsSync(e.jsonPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(e.jsonPath, 'utf8'));
        } catch {}
      }

      if (mensajes.length === 0) {
        sinMensajes++;
        // Borrar el JSON vacío para que en un futuro re-descargue.
        fs.writeFileSync(
          e.jsonPath,
          JSON.stringify({ ...meta, messages: [], reprocesado: true, empty: true }, null, 2)
        );
        continue;
      }

      // Determinar mes real (primer mensaje).
      const mesReal = mesPrimerMensaje(mensajes) || e.mesActual;
      const dirDestino = path.join(config.EXPORT_DIR, mesReal, e.lead);

      const data = {
        lead_id: meta.lead_id || Number(e.lead.replace('lead_', '')),
        contact_id: meta.contact_id || null,
        contact_name: meta.contact_name || '',
        telefono: meta.telefono || '',
        created_at: meta.created_at || null,
        name: meta.name || '',
        canal,
        messages: mensajes,
        reprocesado: true,
      };

      if (mesReal !== e.mesActual) {
        // Mover la carpeta entera.
        fs.mkdirSync(path.dirname(dirDestino), { recursive: true });
        if (!fs.existsSync(dirDestino)) {
          fs.renameSync(e.dirLead, dirDestino);
          movidos++;
        }
        fs.writeFileSync(path.join(dirDestino, 'conversacion.json'), JSON.stringify(data, null, 2));
      } else {
        fs.writeFileSync(e.jsonPath, JSON.stringify(data, null, 2));
      }

      cuentaPorMes[mesReal] = (cuentaPorMes[mesReal] || 0) + 1;
      cuentaPorCanal[canal] = (cuentaPorCanal[canal] || 0) + 1;
      mensajes.forEach((m) => {
        if (m.role === 'assistant' && m.vendedor && !esBot(m.vendedor)) {
          cuentaPorVendedor[m.vendedor] = (cuentaPorVendedor[m.vendedor] || 0) + 1;
        }
      });

      ok++;
      if (total % 200 === 0) console.log(`  procesados ${total} leads...`);
    } catch (err) {
      errores++;
      console.error(`  ✗ ${e.lead}: ${err.message}`);
    }
  }

  console.log('\n══════════════════════');
  console.log(`Total leads procesados: ${total}`);
  console.log(`OK con mensajes:        ${ok}`);
  console.log(`Sin mensajes:           ${sinMensajes}`);
  console.log(`Movidos a otro mes:     ${movidos}`);
  console.log(`Errores:                ${errores}`);

  console.log('\n=== CONTEO POR CANAL ===');
  Object.entries(cuentaPorCanal)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v} leads`));

  console.log('\n=== CONTEO POR MES (post-reproceso) ===');
  Object.keys(cuentaPorMes)
    .sort()
    .forEach((m) => console.log(`  ${m}: ${cuentaPorMes[m]} leads`));

  console.log('\n=== MENSAJES POR VENDEDOR ===');
  Object.entries(cuentaPorVendedor)
    .sort((a, b) => b[1] - a[1])
    .forEach(([v, n]) => console.log(`  ${v}: ${n} mensajes`));

  console.log('\nSiguiente: node 4-construir-dataset.js');
})();
