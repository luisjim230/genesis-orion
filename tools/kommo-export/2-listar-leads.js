// Paso 2 — listar TODOS los leads en el rango (sin filtrar por canal del contacto).
// Uso: node 2-listar-leads.js
//
// Antes filtrábamos por contactos con teléfono/IM, lo que dejaba afuera los leads
// de Instagram y Facebook (cuyos contactos no tienen PHONE). Ahora paginamos
// /api/v4/leads directo y bajamos TODO el rango. El canal real
// (whatsapp/instagram/facebook) se detecta DESPUÉS en 5-reprocesar.js por el
// ícono de origen de cada mensaje del HTML.

const { request } = require('playwright');
const fs = require('fs');
const config = require('./config');

const BASE_URL = config.KOMMO_URL.replace(/\/$/, '');

function unix(fecha) {
  return Math.floor(new Date(fecha + 'T00:00:00').getTime() / 1000);
}

(async () => {
  if (!fs.existsSync(config.SESION_FILE)) {
    console.error(`✗ Falta ${config.SESION_FILE}. Corré: node 1-login.js`);
    process.exit(1);
  }

  const desdeUnix = unix(config.DESDE_FECHA);
  const hastaUnix = unix(config.HASTA_FECHA) + 24 * 3600;
  console.log(`Rango lead.created_at: ${config.DESDE_FECHA} → ${config.HASTA_FECHA}`);

  const api = await request.newContext({
    storageState: config.SESION_FILE,
    baseURL: BASE_URL,
    extraHTTPHeaders: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  });

  // Cargar lo previo (acumulativo, idempotente).
  let leads = [];
  const yaConocidos = new Set();
  if (fs.existsSync(config.LEADS_FILE)) {
    try {
      leads = JSON.parse(fs.readFileSync(config.LEADS_FILE, 'utf8'));
      leads.forEach((l) => yaConocidos.add(String(l.lead_id)));
      console.log(`Tenía ${leads.length} leads previos en ${config.LEADS_FILE}, los conservo.`);
    } catch {}
  }

  console.log('\nPaginando /api/v4/leads (todos los canales)...');
  let pagina = 1;
  let totalVistos = 0;
  const porSource = {};

  while (true) {
    const url = `/api/v4/leads?limit=250&page=${pagina}&with=contacts&filter[created_at][from]=${desdeUnix}&filter[created_at][to]=${hastaUnix}`;
    const resp = await api.get(url).catch(() => null);
    if (!resp) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    const status = resp.status();
    if (status === 204) break;
    if (status === 401 || status === 403) {
      console.error(`✗ Sesión expirada (HTTP ${status}). Corré: node 1-login.js`);
      break;
    }
    if (status !== 200) {
      console.error(`✗ HTTP ${status} en página ${pagina}`);
      break;
    }

    const data = await resp.json();
    const leadsPage = data._embedded?.leads || [];
    if (leadsPage.length === 0) break;

    for (const l of leadsPage) {
      totalVistos++;
      const src = l.source_id || 'sin_source';
      porSource[src] = (porSource[src] || 0) + 1;

      if (yaConocidos.has(String(l.id))) continue;
      const contactId = l._embedded?.contacts?.[0]?.id || null;
      leads.push({
        lead_id: l.id,
        contact_id: contactId,
        contact_name: '',
        created_at: l.created_at,
        name: l.name || '',
        source_id: l.source_id || null,
        pipeline_id: l.pipeline_id || null,
      });
      yaConocidos.add(String(l.id));
    }

    if (pagina % 10 === 0) {
      console.log(`  página ${pagina} · leads vistos ${totalVistos} · únicos en lista ${leads.length}`);
      fs.writeFileSync(config.LEADS_FILE, JSON.stringify(leads, null, 2));
    }

    if (!data._links?.next) break;
    pagina++;
    await new Promise((r) => setTimeout(r, 120));
  }

  fs.writeFileSync(config.LEADS_FILE, JSON.stringify(leads, null, 2));
  console.log(`\n✓ ${leads.length} leads totales en rango guardados en ${config.LEADS_FILE}`);
  console.log('\nDistribución por source_id (informativo — el canal real sale del HTML):');
  Object.entries(porSource)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  console.log('\nSiguiente: node 3-descargar.js');

  await api.dispose();
})();
