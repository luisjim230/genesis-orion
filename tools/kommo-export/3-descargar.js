// Paso 3 — descargar cada lead listado en leads-pendientes.json.
// Uso: node 3-descargar.js
//
// Por cada lead:
//   1. Navega a /leads/detail/{id}
//   2. Espera que cargue el chat
//   3. Scrollea hacia arriba para cargar mensajes históricos
//   4. Extrae mensajes a JSON y HTML
//   5. Guarda en export/AAAA-MM/lead_{id}/
//
// Es idempotente: si el lead ya tiene conversacion.json, lo saltea.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function detectarMesActividad(mensajes, fallback) {
  // Si los mensajes traen fecha embebida tipo "DD/MM/YYYY", usar la más reciente.
  let ultima = null;
  for (const m of mensajes) {
    const match = (m.content || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
      const [, dd, mm, yyyy] = match;
      const fecha = `${yyyy}-${mm}`;
      if (!ultima || fecha > ultima) ultima = fecha;
    }
  }
  return ultima || fallback;
}

async function scrollearChatHaciaArriba(page) {
  const sel = '.feed-compose-section, .feed-compose, .js-feed-compose, .feed';
  let alturaPrevia = -1;
  let iguales = 0;
  for (let i = 0; i < 100; i++) {
    const top = await page.evaluate((s) => {
      const cont = document.querySelector(s);
      if (!cont) return null;
      cont.scrollTop = 0;
      return cont.scrollHeight;
    }, sel);
    if (top === null) break;
    if (top === alturaPrevia) {
      iguales++;
      if (iguales >= 3) break;
    } else {
      iguales = 0;
    }
    alturaPrevia = top;
    await page.waitForTimeout(config.ESPERA_SCROLL_MS);
  }
}

async function extraerMensajes(page) {
  // Heurística: cada nota del feed con clase tipo .feed-note-wrapper o similar
  // tiene un autor (vendedor o cliente) y un texto. Capturamos lo posible.
  return await page.evaluate(() => {
    const out = [];
    const nodos = document.querySelectorAll(
      '.feed-compose-message, .feed-note-text, .feed-note, .feed-compose-section li, .chat-message, [data-id]'
    );
    nodos.forEach((n) => {
      const texto = (n.innerText || '').trim();
      if (!texto || texto.length < 1) return;
      // Detectar si es "entrante" (cliente) o "saliente" (vendedor) por clase.
      const cls = n.className || '';
      const esCliente = /incoming|in-message|client|user/i.test(cls);
      const esVendedor = /outgoing|out-message|manager|seller/i.test(cls);
      let role = 'unknown';
      if (esCliente) role = 'user';
      else if (esVendedor) role = 'assistant';
      // Vendedor: buscar nombre cercano.
      let vendedor = null;
      const autor = n.querySelector('.feed-compose-message__author, .feed-note-author, .user-name');
      if (autor) vendedor = autor.innerText.trim();
      out.push({ role, content: texto, vendedor });
    });
    return out;
  });
}

async function descargarLead(page, lead) {
  const mesFallback = lead.mes_actividad || 'sin-mes';
  const tmpDir = path.join(config.EXPORT_DIR, '_tmp', `lead_${lead.lead_id}`);
  ensureDir(tmpDir);

  await page.goto(`${config.KOMMO_URL}leads/detail/${lead.lead_id}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(2000);

  // Esperar a que aparezca el feed.
  await page.waitForSelector('.feed, .feed-compose, .card-feed', { timeout: 30000 }).catch(() => {});
  await scrollearChatHaciaArriba(page);

  const mensajes = await extraerMensajes(page);
  const html = await page.content();

  const mesReal = detectarMesActividad(mensajes, mesFallback);
  const destino = path.join(config.EXPORT_DIR, mesReal, `lead_${lead.lead_id}`);
  ensureDir(destino);

  // Capturar nombre del contacto y teléfono si están visibles.
  const meta = await page.evaluate(() => {
    const nombre = document.querySelector('.card-contact-name, .contact-name, .lead-name');
    const tel = document.querySelector('[href^="tel:"]');
    return {
      contact_name: nombre ? nombre.innerText.trim() : '',
      telefono: tel ? tel.getAttribute('href').replace('tel:', '') : '',
    };
  });

  fs.writeFileSync(
    path.join(destino, 'conversacion.json'),
    JSON.stringify({ lead_id: lead.lead_id, ...meta, messages: mensajes }, null, 2)
  );
  fs.writeFileSync(path.join(destino, 'conversacion.html'), html);

  return { mes: mesReal, mensajes: mensajes.length };
}

(async () => {
  if (!fs.existsSync(config.SESION_FILE)) {
    console.error(`✗ Falta ${config.SESION_FILE}. Corré: node 1-login.js`);
    process.exit(1);
  }
  if (!fs.existsSync(config.LEADS_FILE)) {
    console.error(`✗ Falta ${config.LEADS_FILE}. Corré: node 2-listar-leads.js`);
    process.exit(1);
  }

  const leads = JSON.parse(fs.readFileSync(config.LEADS_FILE, 'utf8'));
  ensureDir(config.EXPORT_DIR);

  // Filtrar los que ya están descargados.
  const restantes = leads.filter((l) => {
    // Buscar si ya existe la carpeta en cualquier mes.
    const meses = fs.readdirSync(config.EXPORT_DIR).filter((d) => /^\d{4}-\d{2}$/.test(d));
    return !meses.some((m) =>
      fs.existsSync(path.join(config.EXPORT_DIR, m, `lead_${l.lead_id}`, 'conversacion.json'))
    );
  });

  console.log(`Leads totales: ${leads.length}`);
  console.log(`Pendientes de descargar: ${restantes.length}`);
  if (config.LIMITE_PRUEBA > 0) {
    restantes.splice(config.LIMITE_PRUEBA);
    console.log(`LIMITE_PRUEBA activo: solo ${config.LIMITE_PRUEBA} leads esta corrida.`);
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: config.SESION_FILE,
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  let ok = 0, fail = 0;
  for (let i = 0; i < restantes.length; i++) {
    const lead = restantes[i];
    const pct = ((i / restantes.length) * 100).toFixed(1);
    process.stdout.write(`[${i + 1}/${restantes.length} ${pct}%] lead ${lead.lead_id} → `);
    try {
      const r = await descargarLead(page, lead);
      process.stdout.write(`${r.mes} · ${r.mensajes} msgs\n`);
      ok++;
    } catch (err) {
      process.stdout.write(`✗ ${err.message}\n`);
      fail++;
      await page.screenshot({ path: `error-lead-${lead.lead_id}.png` }).catch(() => {});
    }
    await page.waitForTimeout(config.ESPERA_ENTRE_LEADS_MS);
  }

  console.log(`\n✓ OK: ${ok} · ✗ Fallos: ${fail}`);
  console.log('Ahora corré: node 4-construir-dataset.js');
  await browser.close();
})();
