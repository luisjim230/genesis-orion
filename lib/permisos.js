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

// Módulos que manejan plata, sueldos o datos de la empresa: aunque un rol los
// tenga por herencia, se exige que estén concedidos de forma EXPLÍCITA
// (permisos_extra) o que el usuario sea admin. Es la lista que se gatea también
// en la base de datos.
export const MODULOS_SENSIBLES = [
  'contabilidad', 'finanzas', 'bancos', 'incomodidad', 'proyeccion',
  'compras-proveedor', 'pagos', 'rrhh', 'boveda', 'admin', 'pricing',
];

// ¿Este perfil puede ver este módulo? Misma lógica en las tres capas.
// perfil = fila de usuarios_sol { rol, permisos_extra, activo }
export function puedeVerModulo(perfil, modulo) {
  if (!perfil) return false;
  if (perfil.activo === false) return false;
  if (perfil.rol === 'admin') return true;
  const extra = perfil.permisos_extra;
  if (extra && extra[modulo] !== undefined) return !!extra[modulo];
  if (MODULOS_SENSIBLES.includes(modulo)) return false;
  return (PERMISOS_ROL[perfil.rol] || ['dashboard']).includes(modulo);
}
