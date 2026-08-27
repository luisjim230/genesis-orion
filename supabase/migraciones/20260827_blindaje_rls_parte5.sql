-- ═══════════════════════════════════════════════════════════════════════════
--  PARTE 5 — endurecimiento final
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Fija el search_path de las funciones SECURITY DEFINER que no lo tenían.
--  Una función así corre con los permisos de su dueño; si algún rol pudiera
--  crear objetos en un schema del search_path, podría secuestrar lo que la
--  función llama por dentro y ejecutarlo como dueño.
--
--  Hoy ni `anon` ni `authenticated` pueden crear objetos en `public` (se
--  verificó), así que la puerta ya estaba cerrada de hecho; esto la deja
--  cerrada por diseño, sin depender de esa configuración.

begin;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as firma
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and p.proconfig is null
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.firma);
  end loop;
end $$;

commit;

-- ── Pendiente que NO se puede hacer por SQL ────────────────────────────────
-- Activar "Leaked password protection" en el panel de Supabase
-- (Authentication → Policies): rechaza contraseñas que aparecen en filtraciones
-- conocidas. Es un interruptor, no hay migración.
