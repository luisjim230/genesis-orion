// render_html.mjs <htmlPath> <outPng> [width]
// Renderiza un HTML local a PNG con ALTURA AUTOMATICA usando el Google Chrome del sistema.
// Sin dependencias externas: usa fetch + WebSocket nativos de Node (>=22).
//
// Estrategia en dos fases (ambas probadas y estables en este Chrome):
//   Fase 1 (CDP): abre el HTML, mide la altura real del contenido (scrollHeight con
//                 viewport minimo para que no infle la medida).
//   Fase 2 (CLI --screenshot): captura a esa altura exacta, en 2x para nitidez.
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

const [, , htmlPath, outPng, widthArg] = process.argv;
if (!htmlPath || !outPng) { console.error('uso: render_html.mjs <html> <png> [width]'); process.exit(2); }
const width = parseInt(widthArg || '820', 10);
const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = parseInt(process.env.RENDER_CDP_PORT || '9222', 10);
const fileUrl = pathToFileURL(htmlPath).href;

// ---------- Fase 1: medir altura real con CDP ----------
async function measureHeight() {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-component-extensions-with-background-pages',
    `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/oc-chrome-measure', 'about:blank',
  ], { stdio: 'ignore' });
  try {
    let wsUrl;
    for (let i = 0; i < 60 && !wsUrl; i++) {
      try {
        const tabs = await (await fetch(`http://localhost:${PORT}/json`)).json();
        const page = tabs.filter(t =>
          (t.webSocketDebuggerUrl || '').includes('/devtools/page/') &&
          !/^(chrome-extension|devtools|chrome):/.test(t.url || '')
        )[0];
        if (page) wsUrl = page.webSocketDebuggerUrl;
      } catch {}
      if (!wsUrl) await sleep(150);
    }
    if (!wsUrl) throw new Error('no se pudo conectar a Chrome CDP');
    const ws = new WebSocket(wsUrl);
    let id = 0; const pending = new Map(); const events = new Map();
    const send = (method, params = {}) => new Promise((res, rej) => {
      const mid = ++id; pending.set(mid, { res, rej });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
    const waitEvent = (n) => new Promise(r => events.set(n, r));
    await new Promise(r => ws.addEventListener('open', r, { once: true }));
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
      else if (m.method && events.has(m.method)) { events.get(m.method)(m.params); events.delete(m.method); }
    });
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height: 10, deviceScaleFactor: 1, mobile: false });
    const onLoad = waitEvent('Page.loadEventFired');
    await send('Page.navigate', { url: fileUrl });
    await Promise.race([onLoad, sleep(5000)]);
    await sleep(450); // dejar pintar fuentes
    const { result } = await send('Runtime.evaluate', {
      expression: 'Math.ceil(Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.getBoundingClientRect().height))',
      returnByValue: true,
    });
    ws.close();
    return Math.min(Math.max(parseInt(result.value, 10) || 800, 1), 20000);
  } finally { try { chrome.kill(); } catch {} }
}

// ---------- Fase 2: capturar con --screenshot ----------
function capture(height) {
  return new Promise((res, rej) => {
    const p = spawn(CHROME, [
      '--headless', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
      '--force-device-scale-factor=2', '--default-background-color=FFFFFFFF',
      `--window-size=${width},${height}`, '--user-data-dir=/tmp/oc-chrome-shot',
      `--screenshot=${outPng}`, fileUrl,
    ], { stdio: 'ignore' });
    p.on('exit', code => code === 0 ? res() : rej(new Error('chrome --screenshot salio ' + code)));
    p.on('error', rej);
  });
}

const height = await measureHeight();
await capture(height);
console.log(`OK ${outPng} (${width}x${height})`);
process.exit(0);
