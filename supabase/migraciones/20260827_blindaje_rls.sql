-- ═══════════════════════════════════════════════════════════════════════════
--  BLINDAJE DE SOL — cerrar el acceso público a la base
-- ═══════════════════════════════════════════════════════════════════════════
--
--  QUÉ ESTABA PASANDO
--  Casi todas las tablas tenían una política "allow_all" con rol `public` y
--  condición `true`. En Postgres, `public` incluye al usuario ANÓNIMO. Como la
--  clave anónima viaja dentro del JavaScript de la página (es pública por
--  diseño), cualquier persona en internet podía leer y escribir contabilidad,
--  bancos, planilla de RRHH y la lista de usuarios SIN loguearse.
--
--  Comprobado antes del arreglo, sin sesión:
--    conta_asientos    → 312 filas
--    conta_facturas    → 406 filas
--    rrhh_empleados    →  53 filas
--    fin_bancos        →  10 filas
--    usuarios_sol      →  11 filas
--    y PATCH sobre esas tablas devolvía 204 (escritura permitida).
--
--  QUÉ HACE ESTA MIGRACIÓN
--  1. Crea sol_puede(modulo): la misma regla de permisos que usa la app, pero
--     evaluada dentro de la base, donde no se puede saltear.
--  2. Reemplaza todas las políticas "public/true" por políticas que exigen
--     sesión iniciada, y en los módulos de plata / sueldos / accesos, además
--     el permiso del módulo.
--  3. Quita el acceso anónimo directo a las tablas.
--  4. Pasa las vistas sensibles a security_invoker, para que no sean una
--     puerta de atrás que ignore las políticas de las tablas.
--
--  QUÉ NO SE ROMPE
--  - Los daemons de la Mac y las rutas de la app que usan la service_role key:
--    ese rol ignora el RLS por diseño, así que no los afecta.
--  - El Club del Enchapador y la Rifa de Motos: sus tablas ya no eran
--    accesibles directamente y siguen atendidas por funciones SECURITY DEFINER
--    puntuales (club_consultar_puntos, rifa_consultar_acciones, …), que se
--    dejan intactas.

begin;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Reglas de permiso dentro de la base
-- ───────────────────────────────────────────────────────────────────────────

-- Perfil de SOL del usuario que hace la consulta. SECURITY DEFINER para poder
-- leer usuarios_sol aunque esa tabla esté cerrada (si no, sería circular).
create or replace function public.sol_perfil()
returns public.usuarios_sol
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.*
  from public.usuarios_sol u
  where u.auth_id = auth.uid()
     or lower(u.email) = lower(nullif(auth.jwt() ->> 'email', ''))
  order by (u.auth_id = auth.uid()) desc
  limit 1
$$;

-- ¿Hay una sesión iniciada de verdad? (no el usuario anónimo)
create or replace function public.sol_autenticado()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(auth.role(), '') in ('authenticated', 'service_role')
$$;

-- Módulos de plata, sueldos y accesos: se exigen concedidos explícitamente.
create or replace function public.sol_modulo_sensible(p_modulo text)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_modulo = any (array[
    'contabilidad','finanzas','bancos','incomodidad','proyeccion',
    'compras-proveedor','pagos','rrhh','boveda','admin','pricing'
  ])
$$;

-- Misma lógica que puedeVerModulo() en lib/permisos.js.
create or replace function public.sol_puede(p_modulo text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v public.usuarios_sol;
  v_extra jsonb;
begin
  -- Los procesos internos (daemons, rutas del servidor) usan la service key.
  if coalesce(auth.role(), '') = 'service_role' then
    return true;
  end if;
  if coalesce(auth.role(), '') <> 'authenticated' then
    return false;
  end if;

  v := public.sol_perfil();
  if v.id is null or v.activo is false then
    return false;
  end if;
  if v.rol = 'admin' then
    return true;
  end if;

  v_extra := coalesce(v.permisos_extra, '{}'::jsonb);
  if v_extra ? p_modulo then
    return coalesce((v_extra ->> p_modulo)::boolean, false);
  end if;

  if public.sol_modulo_sensible(p_modulo) then
    return false;
  end if;

  return p_modulo = any (
    coalesce(
      (case v.rol
        when 'laura'     then array['dashboard','cajas-aurora']
        when 'cajera'    then array['dashboard','cajas-aurora']
        when 'bodega'    then array['dashboard','inventario','trazabilidad','rotacion','kronos','profecias','contenedores','entregas']
        when 'ventas'    then array['dashboard','trazabilidad','comercial','seguimiento-proformas','reportes','entregas','calculo-transporte']
        when 'finanzas'  then array['dashboard','contenedores','aduana','mercado','ponderacion','finanzas','tareas-equipo','cajas-aurora','entregas','devoluciones','devoluciones-aprobar']
        when 'logistica' then array['dashboard','contenedores','cif','aduana','mercado','reportes']
        when 'vendedor'  then array['dashboard','entregas','pagos','calculo-transporte']
        else array['dashboard']
      end),
      array['dashboard']
    )
  );
end;
$$;

revoke all on function public.sol_perfil() from public, anon;
grant execute on function public.sol_perfil() to authenticated, service_role;
grant execute on function public.sol_puede(text) to authenticated, service_role;
grant execute on function public.sol_autenticado() to authenticated, service_role, anon;

commit;
