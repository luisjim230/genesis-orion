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

const NOMBRES_BOT = ['Robot', 'SalesBot', 'Bot'];
function esBot(nombre) {
  if (!nombre) return false;
  return NOMBRES_BOT.some((b) => nombre.includes(b));
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
  $('.feed-note').each((_i, el) => {
    const cls = ($(el).attr('class') || '').toString();
    if (!cls.includes('feed-note')) return;
    // Saltear contenedores que no son mensajes (system, lead_created, etc).
    if (cls.includes('feed-note-system')) return;
    const isIn = cls.includes('feed-note-incoming');
    const isOut = cls.includes('feed-note-outgoing');
    if (!isIn && !isOut) return;

    const author =
      $(el).find('.feed-note__amojo-user').attr('title') ||
      $(el).find('.feed-note__avatar').attr('title') ||
      null;

    let textParts = [];
    $(el)
      .find('.feed-note__message_paragraph')
      .each((_j, p) => {
        const t = $(p).text().trim();
        if (t) textParts.push(t);
      });
    if (textParts.length === 0) {
      const body = $(el).find('.feed-note__body').first().text().trim();
      if (body) textParts.push(body);
    }
    const text = textParts.join('\n').trim();
    if (!text) return;

    const dateStr = $(el).find('.feed-note__date').first().text().trim();
    const fecha = parseFechaDDMMYYYY(dateStr);

    out.push({
      role: isIn ? 'user' : 'assistant',
      content: text,
      vendedor: isOut ? author : null,
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

  for (const e of recorrerLeads(config.EXPORT_DIR)) {
    total++;
    try {
      const html = fs.readFileSync(e.htmlPath, 'utf8');
      const mensajes = extraerMensajes(html);

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
