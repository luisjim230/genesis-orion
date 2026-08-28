// Fuente ÚNICA de verdad de los permisos por rol.
//
// La usan las TRES capas de seguridad, para que nunca se desincronicen:
//   1. El navegador  (lib/useAuth.js → puedeVer)      — esconde/bloquea la UI
//   2. El servidor   (lib/auth-server.js → requirePermiso) — bloquea las APIs
//   3. La base       (función SQL sol_puede)          — bloquea el acceso directo
//
// Ojo: este archivo NO lleva 'use client' a propósito — se importa desde
// componentes de cliente y desde route handlers del servidor.

export const PERMISOS_ROL = {
  laura:     ['dashboard', 'cajas-aurora'],
  cajera:    ['dashboard', 'cajas-aurora'],
  admin:     ['dashboard', 'inventario', 'trazabilidad', 'rotacion', 'kronos', 'profecias', 'pricing', 'reportes', 'comercial', 'seguimiento-proformas', 'cif', 'contenedores', 'aduana', 'mercado', 'radar', 'campanas', 'metricas-web', 'finanzas', 'tareas', 'tareas-equipo', 'ponderacion', 'social', 'admin', 'cajas-aurora', 'entregas', 'pagos', 'devoluciones', 'devoluciones-aprobar'],
  bodega:    ['dashboard', 'inventario', 'trazabilidad', 'rotacion', 'kronos', 'profecias', 'contenedores', 'entregas'],
  ventas:    ['dashboard', 'trazabilidad', 'comercial', 'seguimiento-proformas', 'reportes', 'entregas', 'calculo-transporte'],
  finanzas:  ['dashboard', 'contenedores', 'aduana', 'mercado', 'ponderacion', 'finanzas', 'tareas-equipo', 'cajas-aurora', 'entregas', 'devoluciones', 'devoluciones-aprobar'],
  logistica: ['dashboard', 'contenedores', 'cif', 'aduana', 'mercado', 'reportes'],
  vendedor:  ['dashboard', 'entregas', 'pagos', 'calculo-transporte'],
};

// Módulos que no pertenecen a ningún rol: solo se tienen si alguien los concede
// a mano en la pantalla de Admin. No es un endurecimiento — es que ningún rol
// los lista, así que sin permisos_extra nadie los tendría igual.
//
// OJO: acá NO va nada que un rol ya otorgue (pagos, devoluciones, finanzas…).
// Sumarlos exigiría concesión explícita y le quitaría el acceso a gente que hoy
// lo tiene por su rol. El blindaje es para los de afuera; los permisos internos
// del equipo se dejan como estaban.
export const MODULOS_SOLO_EXPLICITOS = [
  'contabilidad', 'bancos', 'incomodidad', 'proyeccion',
  'compras-proveedor', 'rrhh', 'boveda',
];

// ¿Este perfil puede ver este módulo? Misma lógica en las tres capas.
// perfil = fila de usuarios_sol { rol, permisos_extra, activo }
export function puedeVerModulo(perfil, modulo) {
  if (!perfil) return false;
  if (perfil.activo === false) return false;
  if (perfil.rol === 'admin') return true;
  const extra = perfil.permisos_extra;
  if (extra && extra[modulo] !== undefined) return !!extra[modulo];
  if (MODULOS_SOLO_EXPLICITOS.includes(modulo)) return false;
  return (PERMISOS_ROL[perfil.rol] || ['dashboard']).includes(modulo);
}
