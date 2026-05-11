// Paso 1 — login manual en Kommo. Guarda la sesión para los pasos 2 y 3.
// Uso: node 1-login.js
//
// Abre Chrome, te deja loguearte vos a mano (incluso si pide 2FA),
// y cuando le decís "listo" guarda la sesión en sesion.json.

const { chromium } = require('playwright');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const config = require('./config');

function pregunta(texto) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(texto, (resp) => {
      rl.close();
      resolve(resp);
    });
  });
}

(async () => {
  console.log('Abriendo Chrome...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  console.log(`Yendo a ${config.KOMMO_URL}`);
  await page.goto(config.KOMMO_URL, { waitUntil: 'domcontentloaded' });

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  Logueate a mano en la ventana de Chrome.');
  console.log('  Cuando estés ADENTRO (viendo el inbox o leads),');
  console.log('  volvé acá a la terminal.');
  console.log('═══════════════════════════════════════════════');
  console.log('');

  await pregunta('Apretá Enter cuando ya estés logueado a Kommo: ');

  const sesionPath = path.resolve(config.SESION_FILE);
  await context.storageState({ path: sesionPath });
  console.log(`✓ Sesión guardada en ${sesionPath}`);

  // Verificar que se vea algo lógico.
  const url = page.url();
  console.log(`URL actual: ${url}`);
  if (!url.includes('kommo.com')) {
    console.log('⚠ Ojo: la URL no parece de Kommo. Probá loguearte de nuevo.');
  }

  await browser.close();
  console.log('');
  console.log('Listo. Ahora corré:');
  console.log('  node 2-listar-leads.js');
})();
