// Paso 3 — descargar la conversación de cada lead con Playwright.
// Uso: node 3-descargar.js
//
// Selectores reales detectados en Kommo (de la inspección que hicimos):
//   .notes-wrapper__scroller       → contenedor del chat (scroll)
//   .notes-wrapper__load-more      → botón "cargar más" (historia vieja)
//   .feed-note                     → cada mensaje/evento
//   .feed-note__author / .feed-note__user-name → quién lo mandó
//   .feed-note__text               → texto del mensaje
//   .drive-field__download-btn     → botón descargar archivo
//
// Por cada lead:
//   1. Navega a /leads/detail/{id}
//   2. Espera .feed-note
//   3. Sube scroll y clickea "cargar más" hasta agotar
//   4. Extrae cada nota a JSON
//   5. Guarda export/AAAA-MM/lead_{id}/conversacion.{json,html}
//
// Idempotente: saltea leads ya descargados.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const BASE_URL = config.KOMMO_URL.replace(/\/$/, '');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function mesDeUnix(unix) {
  if (!unix) return 'sin-mes';
  const d = new Date(unix * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function cargarTodaLaHistoria(page) {
  // Subir scroll y clickear "Cargar más" repetidamente.
  for (let i = 0; i < 100; i++) {
    const loadMore = page.locator('.notes-wrapper__load-more-button, .js-feed-load-more').first();
    const visible = await loadMore.isVisible().catch(() => false);
    if (!visible) {
      // Intentar con scroll hacia arriba.
      await page.evaluate(() => {
        const s = document.querySelector('.notes-wrapper__scroller');
        if (s) s.scrollTop = 0;
      });
      await page.waitForTimeout(config.ESPERA_SCROLL_MS);
      const visible2 = await loadMore.isVisible().catch(() => false);
      if (!visible2) break;
    }
    await loadMore.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(config.ESPERA_SCROLL_MS);
  }
}

async function extraerNotas(page) {
  return await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('div').forEach((nota) => {
      const cls = (nota.className || '').toString();
      if (!/(^|\s)feed-note(\s|$)/.test(cls)) return;
      if (cls.includes('feed-note__')) return;
      if (cls.includes('feed-note-wrapper')) return;
      if (cls.includes('feed-note-grouped-complex__')) return;
      if (cls.includes('feed-note-fixer')) return;
      if (cls.includes('feed-note-system')) return;
      const isIn = cls.includes('feed-note-incoming');
      const isExt = cls.includes('feed-note-external');
      if (!isIn && !isExt) return;

      const parts = [];
      nota.querySelectorAll('.feed-note__message_paragraph').forEach((p) => {
        const t = (p.innerText || '').trim();
        if (t) parts.push(t);
      });
      if (parts.length === 0) {
        const body = nota.querySelector('.feed-note__body');
        const t = (body?.innerText || '').trim();
        if (t && t.length < 5000) parts.push(t);
      }
      const texto = parts.join('\n').trim();
      if (!texto) return;

      const autor =
        nota.querySelector('.feed-note__amojo-user')?.getAttribute('title') ||
        nota.querySelector('.feed-note__avatar')?.getAttribute('title') ||
        null;
      const vendedor = isIn ? null : (autor ? autor.replace(/\s*\(Call Center\)\s*$/i, '').trim() : null);

      const fecha = nota.querySelector('.feed-note__date')?.innerText?.trim() || null;
      const tieneAdjunto = !!nota.querySelector('.drive-field__download-btn');

      out.push({
        role: isIn ? 'user' : 'assistant',
        content: texto,
        vendedor,
        fecha,
        tiene_adjunto: tieneAdjunto,
      });
    });
    return out;
  });
}

async function descargarLead(page, lead) {
  const mesObjetivo = mesDeUnix(lead.created_at);
  const destino = path.join(config.EXPORT_DIR, mesObjetivo, `lead_${lead.lead_id}`);
  ensureDir(destino);

  await page.goto(`${BASE_URL}/leads/detail/${lead.lead_id}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  // Esperar que cargue el feed.
  await page.waitForSelector('.feed-note, .notes-wrapper__scroller', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  await cargarTodaLaHistoria(page);
  await page.waitForTimeout(500);

  const mensajes = await extraerNotas(page);
  const html = await page.content();

  fs.writeFileSync(
    path.join(destino, 'conversacion.json'),
    JSON.stringify(
      {
        lead_id: lead.lead_id,
        contact_id: lead.contact_id,
        contact_name: lead.contact_name,
        telefono: lead.telefono,
        created_at: lead.created_at,
        name: lead.name,
        messages: mensajes,
      },
      null,
      2
    )
  );
  fs.writeFileSync(path.join(destino, 'conversacion.html'), html);

  return { mes: mesObjetivo, mensajes: mensajes.length };
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

  // Cuáles ya están descargados (en cualquier mes).
  const carpetas = fs
    .readdirSync(config.EXPORT_DIR)
    .filter((d) => /^\d{4}-\d{2}$/.test(d));
  const yaDescargado = new Set();
  for (const c of carpetas) {
    for (const l of fs.readdirSync(path.join(config.EXPORT_DIR, c))) {
      const m = l.match(/^lead_(\d+)$/);
      if (m && fs.existsSync(path.join(config.EXPORT_DIR, c, l, 'conversacion.json'))) {
        yaDescargado.add(m[1]);
      }
    }
  }
  let restantes = leads.filter((l) => !yaDescargado.has(String(l.lead_id)));

  console.log(`Leads en lista:        ${leads.length}`);
  console.log(`Ya descargados:        ${yaDescargado.size}`);
  console.log(`Pendientes:            ${restantes.length}`);
  if (config.LIMITE_PRUEBA > 0) {
    restantes = restantes.slice(0, config.LIMITE_PRUEBA);
    console.log(`LIMITE_PRUEBA activo:  ${config.LIMITE_PRUEBA}`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    storageState: config.SESION_FILE,
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  let ok = 0,
    fail = 0;
  const t0 = Date.now();
  for (let i = 0; i < restantes.length; i++) {
    const lead = restantes[i];
    const pct = ((i / restantes.length) * 100).toFixed(1);
    const eta =
      i > 0
        ? Math.round(((Date.now() - t0) / i) * (restantes.length - i) / 60000)
        : '?';
    process.stdout.write(
      `[${i + 1}/${restantes.length} ${pct}% · ETA ${eta}min] lead ${lead.lead_id} → `
    );
    try {
      const r = await descargarLead(page, lead);
      process.stdout.write(`${r.mes} · ${r.mensajes} notas\n`);
      ok++;
    } catch (err) {
      process.stdout.write(`✗ ${err.message}\n`);
      fail++;
    }
    await page.waitForTimeout(config.ESPERA_ENTRE_LEADS_MS);
  }

  console.log(`\n✓ OK: ${ok} · ✗ Fallos: ${fail}`);
  console.log('Siguiente: node 4-construir-dataset.js');
  await browser.close();
})();
