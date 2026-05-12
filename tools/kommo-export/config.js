// Configuración compartida por todos los scripts.
// Editá las fechas acá si querés cambiar el rango.

const path = require('path');
const os = require('os');

const DESDE_FECHA = '2025-07-15';
const HASTA_FECHA = '2026-05-11';

module.exports = {
  KOMMO_URL: 'https://depositojimenez.kommo.com/',

  // Desde que arrancaron Kommo (11-jul-2025), bajamos todo el historial.
  DESDE_FECHA,
  HASTA_FECHA,

  // Archivos/carpetas locales.
  SESION_FILE: './sesion.json',
  LEADS_FILE: './leads-pendientes.json',
  EXPORT_DIR: './export',

  // Carpetas de salida del dataset final por canal (en el Escritorio).
  OUTPUT_DIR: path.join(os.homedir(), 'Desktop', `KOMMO ${DESDE_FECHA} a ${HASTA_FECHA}`),
  OUTPUT_DIR_INSTAGRAM: path.join(os.homedir(), 'Desktop', `KOMMO-INSTAGRAM ${DESDE_FECHA} a ${HASTA_FECHA}`),
  OUTPUT_DIR_FACEBOOK: path.join(os.homedir(), 'Desktop', `KOMMO-FACEBOOK ${DESDE_FECHA} a ${HASTA_FECHA}`),

  // Throttling. Si Kommo te empieza a tirar errores, subí estos números.
  ESPERA_ENTRE_LEADS_MS: 1500,
  ESPERA_SCROLL_MS: 800,

  // Si querés probar con pocos leads antes del run final, poné un número > 0.
  // 0 = bajar todos.
  LIMITE_PRUEBA: 0,
};
