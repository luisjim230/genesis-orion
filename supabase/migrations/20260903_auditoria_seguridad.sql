-- ────────────────────────────────────────────────────────────────────────────
-- Auditoría de seguridad (apertura de la rifa al público) — parte BASE DE DATOS.
-- Complementa el blindaje de RLS del 27-28/08 (supabase/migraciones/). Solo
-- cambios verificados contra el código para no romper la app. YA APLICADO en prod.
--
-- 1) BÓVEDA: las funciones boveda_* (SECURITY DEFINER) podían ser ejecutadas
--    por CUALQUIER usuario logueado directo por RPC, saltándose la validación
--    de miembros que hace /api/boveda. La página usa /api/boveda (service_role),
--    así que se revoca EXECUTE a authenticated/anon/public. Ídem para las
--    funciones internas de la rifa (rifa_intentar_credito, rifa_procesar_pendientes).
--    NO se toca la tabla boveda_accesos (la usa auth-server como piedra de toque
--    para validar la llave de máquina).
-- 2) VISTAS: rifa_saldos y club_saldos corrían como SECURITY DEFINER y eran
--    legibles por cualquier usuario logueado (cédulas + teléfonos de todos).
--    Con security_invoker=on aplica el RLS de las tablas base. Las RPC públicas
--    (definer) y el panel (service_role) siguen leyéndolas sin cambio.
-- 3) STORAGE: rrhh-fotos y fichas-tecnicas tenían policies para el rol public
--    (= anon): cualquiera con la anon key podía listar, subir, modificar y BORRAR.
--    La app sube/borra desde el navegador con sesión → rol authenticated.
--    fichas_read se deja pública (fichas técnicas para clientes).
-- ────────────────────────────────────────────────────────────────────────────

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and (p.proname like 'boveda\_%' or p.proname in ('rifa_intentar_credito','rifa_procesar_pendientes'))
  loop
    execute format('revoke execute on function %s from authenticated, anon, public', r.sig);
  end loop;
end $$;

alter view public.rifa_saldos set (security_invoker = on);
alter view public.club_saldos set (security_invoker = on);

alter policy "rrhh_fotos_read"   on storage.objects to authenticated;
alter policy "rrhh_fotos_write"  on storage.objects to authenticated;
alter policy "rrhh_fotos_update" on storage.objects to authenticated;
alter policy "rrhh_fotos_delete" on storage.objects to authenticated;
alter policy "fichas_upload"     on storage.objects to authenticated;
alter policy "fichas_delete"     on storage.objects to authenticated;
