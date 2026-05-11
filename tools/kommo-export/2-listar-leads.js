// Paso 2 — listar TODOS los leads con actividad de WhatsApp en el rango configurado.
// Uso: node 2-listar-leads.js
//
// Itera mes por mes desde DESDE_FECHA hasta HASTA_FECHA, aplica el filtro
// del inbox por fuente WhatsApp (WABA + Wazzup), scrollea hasta el fondo
// y captura todos los lead_ids visibles. Genera leads-pendientes.json.
//
// Si ya existe leads-pendientes.json, lo respeta y NO sobrescribe IDs
// previamente capturados — solo agrega los nuevos.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const config = require('./config');

function mesesEnRango(desde, hasta) {
  const out = [];
  const [yD, mD] = desde.split('-').map(Number);
  const [yH, mH] = hasta.split('-').map(Number);
  let y = yD, m = mD;
  while (y < yH || (y === yH && m <= mH)) {
    const desdeM = `${y}-${String(m).padStart(2, '0')}-01`;
    const ultimoDia = new Date(y, m, 0).getDate();
    const hastaM = `${y}-${String(m).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;
    out.push({ etiqueta: `${y}-${String(m).padStart(2, '0')}`, desde: desdeM, hasta: hastaM });
    m++;
    if (m > 12) { m = 1; y++; }
  }
  // Recortar el primer y último mes a las fechas reales del config.
  if (out.length) {
    if (out[0].desde < desde) out[0].desde = desde;
    if (out[out.length - 1].hasta > hasta) out[out.length - 1].hasta = hasta;
  }
  return out;
}

async function aplicarFiltroFecha(page, desde, hasta) {
  // Abre filtros si están cerrados.
  await page.locator('#inbox_messaging_aside #search-options').click().catch(() => {});
  await page.waitForTimeout(500);

  // Click en el campo de fecha.
  await page.getByText('Selecciona una fecha').first().click({ timeout: 5000 }).catch(async () => {
    // Si ya hay una fecha seteada, abrir el calendario por el ícono.
    await page.locator('.date_field_wrapper--calendar > .svg-card-calendar-dims').first().click().catch(() => {});
  });
  await page.waitForTimeout(500);

  // Setear fechas en los inputs del datepicker (Kommo acepta YYYY-MM-DD).
  // Buscamos los dos inputs de fecha visibles.
  const inputs = await page.locator('input[type="text"][placeholder*="-"], input.date_field_wrapper--input').all();
  if (inputs.length >= 2) {
    await inputs[0].fill('');
    await inputs[0].type(desde, { delay: 30 });
    await inputs[1].fill('');
    await inputs[1].type(hasta, { delay: 30 });
    await page.keyboard.press('Tab');
  } else {
    console.log(`  ⚠ No se encontraron inputs de fecha. Setear manualmente ${desde} → ${hasta}.`);
  }
  await page.waitForTimeout(500);

  await page.getByRole('button', { name: 'Hecho' }).click().catch(() => {});
  await page.waitForTimeout(500);
}

async function aplicarFiltroFuentes(page) {
  // Asegurar fuentes: WABA + Wazzup.
  await page.locator('#inbox_messaging_aside #search-options').click().catch(() => {});
  await page.waitForTimeout(500);
  await page.getByText('Fuentes del chat').click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(300);

  for (const fuente of ['[WABA]', 'Wazzup (WhatsApp & Instagram)']) {
    const cb = page.getByRole('checkbox', { name: fuente });
    const visible = await cb.isVisible().catch(() => false);
    if (visible) {
      const checked = await cb.isChecked().catch(() => false);
      if (!checked) await cb.check().catch(() => {});
    }
  }
  await page.waitForTimeout(300);
}

async function aplicar(page) {
  await page.getByRole('button', { name: 'Aplicar' }).click().catch(() => {});
  await page.waitForTimeout(2000);
}

async function scrollearHastaElFinal(page) {
  const lista = page.locator('.inbox-list, #inbox_messaging .feed-wrapper, .feed-compose').first();
  let alturaPrevia = 0;
  let iguales = 0;
  for (let i = 0; i < 200; i++) {
    const altura = await page.evaluate(() => {
      const cont = document.querySelector('.feed-compose, .inbox-list, .js-inbox-feed-wrapper');
      return cont ? cont.scrollHeight : 0;
    });
    if (altura === alturaPrevia) {
      iguales++;
      if (iguales >= 3) break;
    } else {
      iguales = 0;
    }
    alturaPrevia = altura;
    await page.evaluate(() => {
      const cont = document.querySelector('.feed-compose, .inbox-list, .js-inbox-feed-wrapper') || document.scrollingElement;
      cont.scrollTop = cont.scrollHeight;
    });
    await page.waitForTimeout(config.ESPERA_SCROLL_MS);
  }
}

async function capturarLeadIds(page) {
  return await page.evaluate(() => {
    const ids = new Set();
    document.querySelectorAll('a[href*="/leads/detail/"]').forEach((a) => {
      const m = a.getAttribute('href').match(/\/leads\/detail\/(\d+)/);
      if (m) ids.add(m[1]);
    });
    return Array.from(ids);
  });
}

(async () => {
  if (!fs.existsSync(config.SESION_FILE)) {
    console.error(`✗ No existe ${config.SESION_FILE}. Corré antes: node 1-login.js`);
    process.exit(1);
  }

  console.log(`Rango: ${config.DESDE_FECHA} → ${config.HASTA_FECHA}`);
  const meses = mesesEnRango(config.DESDE_FECHA, config.HASTA_FECHA);
  console.log(`Voy a recorrer ${meses.length} meses, uno por uno.`);

  // Cargar leads ya conocidos (si veníamos de una corrida previa).
  let pendientes = [];
  if (fs.existsSync(config.LEADS_FILE)) {
    try {
      pendientes = JSON.parse(fs.readFileSync(config.LEADS_FILE, 'utf8'));
      console.log(`Ya tenía ${pendientes.length} leads en ${config.LEADS_FILE}, los conservo.`);
    } catch {}
  }
  const yaConocidos = new Set(pendientes.map((l) => String(l.lead_id)));

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    storageState: config.SESION_FILE,
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  console.log(`Yendo al inbox...`);
  await page.goto(`${config.KOMMO_URL}inbox/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  await aplicarFiltroFuentes(page);

  for (const mes of meses) {
    console.log(`\n── ${mes.etiqueta} (${mes.desde} → ${mes.hasta})`);
    try {
      await aplicarFiltroFecha(page, mes.desde, mes.hasta);
      await aplicar(page);
      await page.waitForTimeout(2000);

      console.log('  scrolleando hasta el final del inbox...');
      await scrollearHastaElFinal(page);

      const ids = await capturarLeadIds(page);
      let nuevos = 0;
      for (const id of ids) {
        if (!yaConocidos.has(id)) {
          pendientes.push({ lead_id: Number(id), mes_actividad: mes.etiqueta });
          yaConocidos.add(id);
          nuevos++;
        }
      }
      console.log(`  visibles: ${ids.length} · nuevos: ${nuevos} · total acumulado: ${pendientes.length}`);

      // Guardar después de cada mes.
      fs.writeFileSync(config.LEADS_FILE, JSON.stringify(pendientes, null, 2));
    } catch (err) {
      console.error(`  ✗ Error en ${mes.etiqueta}:`, err.message);
      await page.screenshot({ path: `error-${mes.etiqueta}.png` }).catch(() => {});
    }
  }

  console.log(`\n✓ Total final: ${pendientes.length} leads únicos en ${config.LEADS_FILE}`);
  console.log('Ahora corré: node 3-descargar.js');

  await browser.close();
})();
