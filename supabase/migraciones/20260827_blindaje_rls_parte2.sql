-- ═══════════════════════════════════════════════════════════════════════════
--  PARTE 2 — reemplazo de las políticas abiertas
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Se borra TODA política existente de public y se reconstruye. Hace falta
--  borrarlas: en Postgres basta que UNA política permita para que el acceso
--  pase, así que dejar viva una vieja "public / true" no cambiaría nada.
--
--  Después queda:
--    · tabla de módulo sensible → exige el permiso de ese módulo (sol_puede)
--    · tabla interna            → exige sesión iniciada (sol_autenticado)
--    · tabla de proceso interno → sin política: solo la llega la llave maestra
--    · usuarios_sol             → cada quien ve solo su propia ficha
--
--  El rol anónimo pierde el acceso directo a las tablas. El Club y la Rifa no
--  leen tablas: llaman funciones SECURITY DEFINER, que siguen andando.

begin;

do $$
declare
  r record;
  t text;

  -- Tablas de plata, sueldos y accesos, con el módulo que las gatea.
  sensibles jsonb := jsonb_build_object(
    'contabilidad', jsonb_build_array(
      'conta_aprobadores','conta_asiento_lineas','conta_asientos','conta_bitacora',
      'conta_cabys_reglas','conta_centros_costo','conta_config','conta_cuentas',
      'conta_facturas','conta_plantilla_lineas','conta_plantillas','conta_proveedores',
      'conta_reglas_iva','neo_movimientos_contables','neo_asientos_estado'),
    'finanzas', jsonb_build_array(
      'fin_bancos','fin_bancos_inversiones','fin_cuentas_cobrar','fin_cuentas_pagar',
      'fin_cuentas_pagar_detalle','zz_neo_antiguedad_saldos',
      'zz_neo_antiguedad_saldos_clientes','neo_rentabilidad_proveedor'),
    'rrhh', jsonb_build_array(
      'rrhh_capacitaciones','rrhh_departamentos','rrhh_empleados','rrhh_empleados_historial',
      'rrhh_puestos','rrhh_seguimiento','rrhh_solicitudes','rrhh_sucursales'),
    'incomodidad', jsonb_build_array(
      'incomodidad_config','incomodidad_cuentas_gasto','incomodidad_gastos_nuevos'),
    'pagos', jsonb_build_array('pagos_items','pagos_sesion'),
    'pricing', jsonb_build_array(
      'pricing_alertas_log','pricing_revision_compras','pricing_revision_settings',
      'pricing_thresholds_skus'),
    'compras-proveedor', jsonb_build_array(
      'cp_alertas','cp_archivos','cp_compras','cp_factura_pago_link','cp_facturas',
      'cp_pagos','cp_proveedores'),
    'devoluciones', jsonb_build_array('devoluciones','devoluciones_historial')
  );

  -- Tablas que solo tocan los procesos internos (llave maestra). Quedan con RLS
  -- prendido y SIN políticas: no se llega desde el navegador de nadie.
  solo_servicio text[] := array[
    'boveda_accesos','boveda_inv_equipos','boveda_inv_licencias','boveda_log',
    'club_canjes','club_config','club_miembros','club_productos_participan',
    'club_registros','rifa_config','rifa_ganadores','rifa_participantes',
    'rifa_patrocinadores','rifa_pendientes','rifa_registros','daemon_heartbeat',
    'nav_uso','meta_adsets','meta_audiences','_temp_deploy'];

  -- Llevan trato aparte, más abajo.
  especiales text[] := array['usuarios_sol','genesis_usuarios'];

  modulo text;
begin
  -- 1) Borrar todas las políticas viejas
  for r in select tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;

  -- 2) Reconstruir
  for r in
    select c.relname as tabla
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    order by c.relname
  loop
    t := r.tabla;
    continue when t = any (solo_servicio) or t = any (especiales);

    select k into modulo
    from jsonb_each(sensibles) as e(k, v)
    where v ? t
    limit 1;

    if modulo is not null then
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.sol_puede(%L)) with check (public.sol_puede(%L))',
        'sol_' || t, t, modulo, modulo);
      modulo := null;
    else
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.sol_autenticado()) with check (public.sol_autenticado())',
        'sol_' || t, t);
    end if;
  end loop;
end $$;

-- 3) usuarios_sol: cada quien ve SOLO su propia ficha (antes cualquiera bajaba
--    la lista completa con roles y permisos). Nadie la modifica desde el
--    navegador — eso evita que alguien se ascienda a admin. Los cambios van por
--    /api/admin/*, que valida sesión y rol.
create policy "sol_usuarios_sol_propio" on public.usuarios_sol for select to authenticated
  using (auth_id = auth.uid() or lower(email) = lower(nullif(auth.jwt() ->> 'email', '')));
create policy "sol_usuarios_sol_admin" on public.usuarios_sol for select to authenticated
  using (public.sol_puede('admin'));

-- 4) Tabla vieja de usuarios: solo la propia fila.
create policy "sol_genesis_usuarios_propio" on public.genesis_usuarios for select to authenticated
  using (user_id = auth.uid());

-- 5) Permisos de tabla: el anónimo pierde el acceso directo.
revoke all on all tables in schema public from anon;
grant usage on schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

commit;
