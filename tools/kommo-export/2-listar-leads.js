// Paso 2 — listar leads con teléfono usando la API privada de Kommo.
// Uso: node 2-listar-leads.js
//
// Estrategia (basada en lo que funcionaba antes):
//   1. Paginá /api/v4/contacts?with=leads — devuelve TODOS los contactos
//      con sus campos custom (incluyendo PHONE) y a qué leads están vinculados.
//   2. Quedate solo con los que tienen teléfono = potenciales clientes de WhatsApp.
//   3. Filtrá por la fecha de creación del lead (rango del config).
//   4. Volcá la lista única a leads-pendientes.json.
//
// La API responde con cookies de sesión, así que no necesitamos token.

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
    extraHTTPHeaders: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
  });

  // Cargar lo previo si reanudamos.
  let leads = [];
  const yaConocidos = new Set();
  if (fs.existsSync(config.LEADS_FILE)) {
    try {
      leads = JSON.parse(fs.readFileSync(config.LEADS_FILE, 'utf8'));
      leads.forEach((l) => yaConocidos.add(String(l.lead_id)));
      console.log(`Ya había ${leads.length} leads en ${config.LEADS_FILE}, los conservo.`);
    } catch {}
  }

  console.log('\nPaginando /api/v4/contacts (con teléfono y leads vinculados)...');
  let pagina = 1;
  let contactosVistos = 0;
  let conTelefono = 0;
  let leadsNuevos = 0;

  while (true) {
    const url = `/api/v4/contacts?limit=250&page=${pagina}&with=leads`;
    let resp;
    try {
      resp = await api.get(url);
    } catch (err) {
      console.error(`  ✗ Error red página ${pagina}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }

    const status = resp.status();
    if (status === 204) break;
    if (status === 401 || status === 403) {
      console.error(`  ✗ Sesión expirada (HTTP ${status}). Corré: node 1-login.js`);
      break;
    }
    if (status !== 200) {
      const body = await resp.text();
      console.error(`  ✗ HTTP ${status} en página ${pagina}: ${body.slice(0, 200)}`);
      break;
    }

    const data = await resp.json();
    const contactos = data._embedded?.contacts || [];
    if (contactos.length === 0) break;

    for (const c of contactos) {
      contactosVistos++;
      const phone = (c.custom_fields_values || []).find((f) => f.field_code === 'PHONE');
      if (!phone?.values?.[0]?.value) continue;
      conTelefono++;

      const telefono = String(phone.values[0].value).replace(/\s/g, '');
      const leadsVinc = c._embedded?.leads || [];
      for (const lv of leadsVinc) {
        if (yaConocidos.has(String(lv.id))) continue;
        // No tenemos created_at acá; lo filtramos cuando hagamos el matcheo
        // contra la API de leads. Por ahora aceptamos.
        leads.push({
          lead_id: lv.id,
          contact_id: c.id,
          contact_name: c.name || '',
          telefono,
        });
        yaConocidos.add(String(lv.id));
        leadsNuevos++;
      }
    }

    if (pagina % 10 === 0) {
      console.log(`  página ${pagina} · contactos ${contactosVistos} · con tel ${conTelefono} · leads únicos ${leads.length}`);
      fs.writeFileSync(config.LEADS_FILE, JSON.stringify(leads, null, 2));
    }

    if (!data._links?.next) break;
    pagina++;
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log(`\nContactos revisados: ${contactosVistos}`);
  console.log(`Con teléfono: ${conTelefono}`);
  console.log(`Leads candidatos (potencial WhatsApp): ${leads.length}`);

  // Ahora filtramos por created_at del lead en el rango.
  console.log('\nFiltrando por fecha de creación del lead...');
  const idsBatch = [];
  for (const l of leads) idsBatch.push(l.lead_id);
  const dentroRango = new Map();
  for (let i = 0; i < idsBatch.length; i += 250) {
    const slice = idsBatch.slice(i, i + 250);
    const qs = slice.map((id) => `filter[id][]=${id}`).join('&');
    const url = `/api/v4/leads?limit=250&${qs}&filter[created_at][from]=${desdeUnix}&filter[created_at][to]=${hastaUnix}`;
    const resp = await api.get(url);
    if (resp.status() === 200) {
      const d = await resp.json();
      for (const lead of d._embedded?.leads || []) {
        dentroRango.set(lead.id, { created_at: lead.created_at, name: lead.name });
      }
    }
    if (i % 2500 === 0) console.log(`  ${i + slice.length}/${idsBatch.length}`);
    await new Promise((r) => setTimeout(r, 120));
  }

  const filtrados = leads.filter((l) => dentroRango.has(l.lead_id))
    .map((l) => ({ ...l, ...dentroRango.get(l.lead_id) }));

  fs.writeFileSync(config.LEADS_FILE, JSON.stringify(filtrados, null, 2));
  console.log(`\n✓ ${filtrados.length} leads dentro del rango guardados en ${config.LEADS_FILE}`);
  console.log('Siguiente: node 3-descargar.js');

  await api.dispose();
})();
