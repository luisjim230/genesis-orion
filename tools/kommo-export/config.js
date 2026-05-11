// Configuración compartida por todos los scripts.
// Editá las fechas acá si querés cambiar el rango.

module.exports = {
  KOMMO_URL: 'https://depositojimenez.kommo.com/',

  // Desde que arrancaron Kommo (11-jul-2025), bajamos todo el historial.
  DESDE_FECHA: '2025-07-15',
  HASTA_FECHA: '2026-05-11',

  // Archivos/carpetas locales.
  SESION_FILE: './sesion.json',
  LEADS_FILE: './leads-pendientes.json',
  EXPORT_DIR: './export',

  // Throttling. Si Kommo te empieza a tirar errores, subí estos números.
  ESPERA_ENTRE_LEADS_MS: 1500,
  ESPERA_SCROLL_MS: 800,

  // Si querés probar con pocos leads antes del run final, poné un número > 0.
  // 0 = bajar todos.
  LIMITE_PRUEBA: 0,
};
