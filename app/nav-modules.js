// Única fuente de verdad para los módulos de SOL.
// Sidebar (desktop) y MobileNav importan de acá para que nunca se desincronicen.
export const ALL_NAV = [
  { group: 'Principal', items: [
    { href: '/',                  key: 'dashboard',             icon: '⊞',  name: 'Dashboard' },
    { href: '/reportes',          key: 'reportes',              icon: '📊', name: 'Carga de reportes' },
  ]},
  { group: 'Inventario', items: [
    { href: '/inventario',        key: 'inventario',            icon: '📦', name: 'Compras' },
    { href: '/trazabilidad',      key: 'trazabilidad',          icon: '🔴', name: 'Trazabilidad' },
    { href: '/kronos',            key: 'kronos',                icon: '📈', name: 'Proyección de inventario' },
    { href: '/profecias',         key: 'profecias',             icon: '🔭', name: 'Profecías' },
    { href: '/pricing',           key: 'pricing',               icon: '💲', name: 'Pricing' },
  ]},
  { group: 'Comercial', items: [
    { href: '/comercial',                          key: 'comercial',              icon: '💼', name: 'Ventas · Equipo' },
    { href: '/comercial/seguimiento-proformas',    key: 'seguimiento-proformas',  icon: '📋', name: 'Seguimiento de Proformas' },
  ]},
  { group: 'Importaciones', items: [
    { href: '/cif',               key: 'cif',                   icon: '🧮', name: 'Calculadora CIF' },
    { href: '/contenedores',      key: 'contenedores',          icon: '🚢', name: 'Cargas en tránsito' },
    { href: '/aduana',            key: 'aduana',                icon: '🛃', name: 'Aduana · TLC China' },
  ]},
  { group: 'Inteligencia', items: [
    { href: '/mercado',           key: 'mercado',               icon: '⚡', name: 'Mercado' },
    { href: '/radar',             key: 'radar',                 icon: '📡', name: 'RADAR' },
    { href: '/campanas',          key: 'campanas',              icon: '📣', name: 'Campañas' },
    { href: '/metricas-web',      key: 'metricas-web',          icon: '📊', name: 'Métricas Web' },
  ]},
  { group: 'Operaciones', items: [
    { href: '/cajas-aurora',      key: 'cajas-aurora',          icon: '🌅', name: 'Cajas' },
    { href: '/entregas',          key: 'entregas',              icon: '🚛', name: 'Entregas' },
  ]},
  { group: 'Finanzas', items: [
    { href: '/finanzas',          key: 'finanzas',              icon: '💰', name: 'Finanzas' },
    { href: '/finanzas/bancos',   key: 'bancos',                icon: '🏦', name: 'Bancos' },
    { href: '/pagos',             key: 'pagos',                 icon: '💸', name: 'Coordinación de pagos' },
  ]},
  { group: 'Gestión', items: [
    { href: '/tareas',            key: 'tareas',                icon: '✅', name: 'Tareas' },
    { href: '/tareas-equipo',     key: 'tareas-equipo',         icon: '📋', name: 'Tareas Equipo' },
    { href: '/social',            key: 'social',                icon: '📱', name: 'Redes Sociales' },
    { href: '/kommo-proveedores', key: 'kommo-proveedores',     icon: '📲', name: 'WhatsApp Proveedores' },
  ]},
  { group: 'Herramientas', items: [
    { href: '/ponderacion',       key: 'ponderacion',           icon: '⚖️', name: 'Promedios ponderados' },
    { href: '/materiales',        key: 'materiales',            icon: '🧱', name: 'Cálculo de materiales' },
    { href: '/fichas-tecnicas',   key: 'fichas-tecnicas',       icon: '📋', name: 'Fichas Técnicas' },
    { href: '/garantias',         key: 'garantias',             icon: '🔄', name: 'Devoluciones y Garantías' },
    { href: '/encomiendas',       key: 'encomiendas',           icon: '📦', name: 'Encomiendas' },
  ]},
  { group: 'Recursos Humanos', items: [
    { href: '/rrhh',              key: 'rrhh',                  icon: '👔', name: 'Personal' },
  ]},
  { group: 'Seguridad', items: [
    { href: '/boveda',            key: 'boveda',                icon: '🔐', name: 'Bóveda de Accesos', bovedaOnly: true },
  ]},
  { group: 'Admin', items: [
    { href: '/admin',             key: 'admin',                 icon: '👥', name: 'Usuarios', adminOnly: true },
  ]},
];

// Lista plana para usos donde no importan los grupos (ej. drawer mobile)
export const ALL_NAV_FLAT = ALL_NAV.flatMap(g => g.items);
