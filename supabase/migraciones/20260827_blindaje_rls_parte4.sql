-- ═══════════════════════════════════════════════════════════════════════════
--  PARTE 4 — funciones: quitarle al anónimo las que no son públicas
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Una función SECURITY DEFINER corre con los permisos de su dueño e ignora el
--  RLS. Había 21 ejecutables por cualquiera sin loguearse. Solo seis tienen que
--  seguir así (las que atienden clientes en el Club, la Rifa y el acortador de
--  links); el resto queda para usuarios con sesión y para los procesos internos.
--
--  Aparte del dato, esto tapa un problema de costo: los refresh_* reconstruyen
--  vistas barriendo las ~786k filas de neo_items_facturados. Cualquiera de
--  afuera podía dispararlos en loop y tumbar el disco de Supabase.

begin;

do $$
declare
  r record;
  -- Las que SÍ deben quedar abiertas: son el Club, la Rifa y el acortador,
  -- que atienden a clientes que nunca van a tener usuario de SOL.
  publicas text[] := array[
    'club_consultar_puntos',
    'club_registrar_factura',
    'rifa_consultar_acciones',
    'rifa_registrar_factura',
    'rifa_patrocinadores_publicos',
    'increment_short_link_clicks'
  ];
begin
  for r in
    select p.oid::regprocedure as firma, p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and has_function_privilege('anon', p.oid, 'execute')
      and not (p.proname = any (publicas))
  loop
    execute format('revoke all on function %s from anon', r.firma);
    execute format('grant execute on function %s to authenticated, service_role', r.firma);
  end loop;
end $$;

commit;
