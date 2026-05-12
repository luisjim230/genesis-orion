// Paso 2 — listar leads de TODOS los canales sociales (WhatsApp / Instagram / Facebook).
// Uso: node 2-listar-leads.js
//
// Pagina /api/v4/contacts?with=leads&with=custom_fields_values y se queda con
// los que tengan PHONE, IM, o cualquier custom field social (instagram, facebook,
// messenger). El canal real se detecta DESPUÉS al reprocesar el HTML por el
// ícono de origen — esta etapa solo arma la lista de candidatos.

const { request } = require('playwright');
const fs = require('fs');
const config = require('./config');

const BASE_URL = config.KOMMO_URL.replace(/\/$/, '');

function unix(fecha) {
  return Math.floor(new Date(fecha + 'T00:00:00').getTime() / 1000);
}

function detectarCanales(contacto) {
  const canales = new Set();
  const fields = contacto.custom_fields_values || [];
  for (const f of fields) {
    const code = (f.field_code || '').toUpperCase();
    const name = (f.field_name || '').toLowerCase();

    if (code === 'PHONE') {
      const v = f.values?.[0]?.value;
      if (v) canales.add('whatsapp');
    }
    if (code === 'IM') {
      for (const val of f.values || []) {
        const enumCode = (val.enum_code || '').toLowerCase();
        if (enumCode.includes('instagram')) canales.add('instagram');
        else if (enumCode.includes('facebook') || enumCode.includes('messenger')) canales.add('facebook');
        else if (enumCode.includes('whatsapp')) canales.add('whatsapp');
        else canales.add('im_otro');
      }
    }
    if (name.includes('instagram')) canales.add('instagram');
    if (name.includes('facebook') || name.includes('messenger')) canales.add('facebook');
  }
  return [...canales];
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

  // Cargar lo previo (acumulativo).
  let leads = [];
  const yaConocidos = new Set();
  if (fs.existsSync(config.LEADS_FILE)) {
    try {
      leads = JSON.parse(fs.readFileSync(config.LEADS_FILE, 'utf8'));
      leads.forEach((l) => yaConocidos.add(String(l.lead_id)));
      console.log(`Tenía ${leads.length} leads previos en ${config.LEADS_FILE}, los conservo.`);
    } catch {}
  }

  console.log('\nPaginando /api/v4/contacts (todos los canales sociales)...');
  let pagina = 1;
  let contactosVistos = 0;
  const conteoCanales = { whatsapp: 0, instagram: 0, facebook: 0, im_otro: 0 };

  while (true) {
    const url = `/api/v4/contacts?limit=250&page=${pagina}&with=leads`;
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
    const contactos = data._embedded?.contacts || [];
    if (contactos.length === 0) break;

    for (const c of contactos) {
      contactosVistos++;
      const canales = detectarCanales(c);
      if (canales.length === 0) continue;
      canales.forEach((cn) => { if (conteoCanales[cn] != null) conteoCanales[cn]++; });

      const leadsVinc = c._embedded?.leads || [];
      for (const lv of leadsVinc) {
        if (yaConocidos.has(String(lv.id))) continue;
        leads.push({
          lead_id: lv.id,
          contact_id: c.id,
          contact_name: c.name || '',
          canales_contacto: canales,
        });
        yaConocidos.add(String(lv.id));
      }
    }

    if (pagina % 10 === 0) {
      console.log(`  página ${pagina} · contactos ${contactosVistos} · leads únicos acumulados ${leads.length}`);
      fs.writeFileSync(config.LEADS_FILE, JSON.stringify(leads, null, 2));
    }

    if (!data._links?.next) break;
    pagina++;
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`\nContactos revisados: ${contactosVistos}`);
  console.log('Conteo por canal detectado en contactos:');
  Object.entries(conteoCanales).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  // Filtrar leads por fecha de creación.
  console.log('\nFiltrando por fecha de creación del lead...');
  const ids = leads.map((l) => l.lead_id);
  const dentroRango = new Map();
  for (let i = 0; i < ids.length; i += 250) {
    const slice = ids.slice(i, i + 250);
    const qs = slice.map((id) => `filter[id][]=${id}`).join('&');
    const url = `/api/v4/leads?limit=250&${qs}&filter[created_at][from]=${desdeUnix}&filter[created_at][to]=${hastaUnix}`;
    const resp = await api.get(url);
    if (resp.status() === 200) {
      const d = await resp.json();
      for (const lead of d._embedded?.leads || []) {
        dentroRango.set(lead.id, { created_at: lead.created_at, name: lead.name });
      }
    }
    if (i % 2500 === 0) console.log(`  ${i + slice.length}/${ids.length}`);
    await new Promise((r) => setTimeout(r, 120));
  }

  const filtrados = leads.filter((l) => dentroRango.has(l.lead_id))
    .map((l) => ({ ...l, ...dentroRango.get(l.lead_id) }));

  fs.writeFileSync(config.LEADS_FILE, JSON.stringify(filtrados, null, 2));
  console.log(`\n✓ ${filtrados.length} leads dentro del rango guardados en ${config.LEADS_FILE}`);
  console.log('Siguiente: node 3-descargar.js');

  await api.dispose();
})();
