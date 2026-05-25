// Bóveda de Accesos — configuración de acceso (compartida cliente/servidor).
//
// El acceso NO se controla por rol (hay varios admins, p.ej. Mauricio, que no
// deben entrar). Se controla por una lista fija de personas identificadas por
// su ID de cuenta (auth.users.id). Solo quien tenga `admin: true` puede editar
// y borrar; el resto solo ve y agrega.
//
// Esto es solo para mostrar/ocultar la UI. La seguridad real se aplica en el
// servidor (lib/boveda-server.js + RLS en la base).

export const BOVEDA_MIEMBROS = [
  { id: 'b9c39a60-d207-4f3d-bb02-2b0d63691eab', email: 'luisjim230@gmail.com',            nombre: 'Luis',   admin: true  },
  { id: 'd3338204-3197-4a47-a4be-acf0b3aa6d73', email: 'proyectos@depositojimenezcr.com', nombre: 'Toni',   admin: false },
  { id: '6c840293-1af2-4948-ac1e-2433e9f9ee7f', email: 'rebejimenez94@gmail.com',         nombre: 'Rebeca', admin: false },
];

export function bovedaMiembro(user) {
  if (!user) return null;
  const email = user.email ? user.email.toLowerCase() : null;
  return BOVEDA_MIEMBROS.find(
    (m) => m.id === user.id || (email && m.email.toLowerCase() === email)
  ) || null;
}

export function puedeVerBoveda(user) {
  return !!bovedaMiembro(user);
}

export function puedeAdminBoveda(user) {
  const m = bovedaMiembro(user);
  return !!m && m.admin;
}
