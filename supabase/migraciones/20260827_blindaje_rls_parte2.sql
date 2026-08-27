-- ═══════════════════════════════════════════════════════════════════════
--  PARTE 2 — reemplazo de políticas (generado, no editar a mano)
-- ═══════════════════════════════════════════════════════════════════════
begin;

-- Borra TODA política existente de las tablas de public: se reconstruyen abajo
-- con la regla correcta. Sin esto, una política vieja `public/true` seguiría
-- dando acceso (basta que UNA política permita para que el acceso pase).
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- El rol anónimo pierde el acceso directo a las tablas. Las páginas públicas
-- (Club, Rifa) no leen tablas: llaman funciones SECURITY DEFINER puntuales,
-- que siguen funcionando.
revoke all on all tables in schema public from anon;
grant usage on schema public to anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- bi_resumen_producto: interna, requiere sesión iniciada
create policy "sol_bi_resumen_producto" on public.bi_resumen_producto for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- cajas_aurora: interna, requiere sesión iniciada
create policy "sol_cajas_aurora" on public.cajas_aurora for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- clasificacion_origen_producto: interna, requiere sesión iniciada
create policy "sol_clasificacion_origen_producto" on public.clasificacion_origen_producto for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- clasificacion_origen_proveedor: interna, requiere sesión iniciada
create policy "sol_clasificacion_origen_proveedor" on public.clasificacion_origen_proveedor for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- cola_neo_uploads: interna, requiere sesión iniciada
create policy "sol_cola_neo_uploads" on public.cola_neo_uploads for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- comercial_config_mensual: interna, requiere sesión iniciada
create policy "sol_comercial_config_mensual" on public.comercial_config_mensual for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- comercial_kpis_mensual: interna, requiere sesión iniciada
create policy "sol_comercial_kpis_mensual" on public.comercial_kpis_mensual for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- conta_aprobadores: módulo «contabilidad» (dato sensible: se exige permiso concedido)
create policy "sol_conta_aprobadores" on public.conta_aprobadores for all to authenticated
  using (public.sol_puede('contabilidad')) with check (public.sol_puede('contabilidad'));

-- conta_asiento_lineas: módulo «contabilidad» (dato sensible: se exige permiso concedido)
create policy "sol_conta_asiento_lineas" on public.conta_asiento_lineas for all to authenticated
  using (public.sol_puede('contabilidad')) with check (public.sol_puede('contabilidad'));

-- conta_asientos: módulo «contabilidad» (dato sensible: se exige permiso concedido)
create policy "sol_conta_asientos" on public.conta_asientos for all to authenticated
  using (public.sol_puede('contabilidad')) with check (public.sol_puede('contabilidad'));

-- conta_bitacora: módulo «contabilidad» (dato sensible: se exige permiso concedido)
create policy "sol_conta_bitacora" on public.conta_bitacora for all to authenticated
  using (public.sol_puede('contabilidad')) with check (public.sol_puede('contabilidad'));

-- conta_cabys_reglas: módulo «contabilidad» (dato sensible: se exige permiso concedido)
create policy "sol_conta_cabys_reglas" on public.conta_cabys_reglas for all to authenticated
  using (public.sol_puede('contabilidad')) with check (public.sol_puede('contabilidad'));

-- conta_centros_costo: módulo «contabilidad» (dato sensible: se exige permiso concedido)
create policy "sol_conta_centros_costo" on public.conta_centros_costo for all to authenticated
  using (public.sol_puede('contabilidad')) with check (public.sol_puede('contabilidad'));

-- conta_config: módulo «contabilidad» (dato sensible: se exige permiso concedido)
create policy "sol_conta_config" on public.conta_config for all to authenticated
  using (public.sol_puede('contabilidad')) with check (public.sol_puede('contabilidad'));

-- conta_cuentas: módulo «contabilidad» (dato sensible: se exige permiso concedido)
create policy "sol_conta_cuentas" on public.conta_cuentas for all to authenticated
  using (public.sol_puede('contabilidad')) with check (public.sol_puede('contabilidad'));

-- conta_facturas: módulo «contabilidad» (dato sensible: se exige permiso concedido)
create policy "sol_conta_facturas" on public.conta_facturas for all to authenticated
  using (public.sol_puede('contabilidad')) with check (public.sol_puede('contabilidad'));

-- conta_plantilla_lineas: módulo «contabilidad» (dato sensible: se exige permiso concedido)
create policy "sol_conta_plantilla_lineas" on public.conta_plantilla_lineas for all to authenticated
  using (public.sol_puede('contabilidad')) with check (public.sol_puede('contabilidad'));

-- conta_plantillas: módulo «contabilidad» (dato sensible: se exige permiso concedido)
create policy "sol_conta_plantillas" on public.conta_plantillas for all to authenticated
  using (public.sol_puede('contabilidad')) with check (public.sol_puede('contabilidad'));

-- conta_proveedores: módulo «contabilidad» (dato sensible: se exige permiso concedido)
create policy "sol_conta_proveedores" on public.conta_proveedores for all to authenticated
  using (public.sol_puede('contabilidad')) with check (public.sol_puede('contabilidad'));

-- conta_reglas_iva: módulo «contabilidad» (dato sensible: se exige permiso concedido)
create policy "sol_conta_reglas_iva" on public.conta_reglas_iva for all to authenticated
  using (public.sol_puede('contabilidad')) with check (public.sol_puede('contabilidad'));

-- cp_alertas: módulo «compras-proveedor» (dato sensible: se exige permiso concedido)
create policy "sol_cp_alertas" on public.cp_alertas for all to authenticated
  using (public.sol_puede('compras-proveedor')) with check (public.sol_puede('compras-proveedor'));

-- cp_archivos: módulo «compras-proveedor» (dato sensible: se exige permiso concedido)
create policy "sol_cp_archivos" on public.cp_archivos for all to authenticated
  using (public.sol_puede('compras-proveedor')) with check (public.sol_puede('compras-proveedor'));

-- cp_compras: módulo «compras-proveedor» (dato sensible: se exige permiso concedido)
create policy "sol_cp_compras" on public.cp_compras for all to authenticated
  using (public.sol_puede('compras-proveedor')) with check (public.sol_puede('compras-proveedor'));

-- cp_factura_pago_link: módulo «compras-proveedor» (dato sensible: se exige permiso concedido)
create policy "sol_cp_factura_pago_link" on public.cp_factura_pago_link for all to authenticated
  using (public.sol_puede('compras-proveedor')) with check (public.sol_puede('compras-proveedor'));

-- cp_facturas: módulo «compras-proveedor» (dato sensible: se exige permiso concedido)
create policy "sol_cp_facturas" on public.cp_facturas for all to authenticated
  using (public.sol_puede('compras-proveedor')) with check (public.sol_puede('compras-proveedor'));

-- cp_pagos: módulo «compras-proveedor» (dato sensible: se exige permiso concedido)
create policy "sol_cp_pagos" on public.cp_pagos for all to authenticated
  using (public.sol_puede('compras-proveedor')) with check (public.sol_puede('compras-proveedor'));

-- cp_proveedores: módulo «compras-proveedor» (dato sensible: se exige permiso concedido)
create policy "sol_cp_proveedores" on public.cp_proveedores for all to authenticated
  using (public.sol_puede('compras-proveedor')) with check (public.sol_puede('compras-proveedor'));

-- devoluciones: módulo «devoluciones» (dato sensible: se exige permiso concedido)
create policy "sol_devoluciones" on public.devoluciones for all to authenticated
  using (public.sol_puede('devoluciones')) with check (public.sol_puede('devoluciones'));

-- devoluciones_historial: módulo «devoluciones» (dato sensible: se exige permiso concedido)
create policy "sol_devoluciones_historial" on public.devoluciones_historial for all to authenticated
  using (public.sol_puede('devoluciones')) with check (public.sol_puede('devoluciones'));

-- encomiendas_empresas: interna, requiere sesión iniciada
create policy "sol_encomiendas_empresas" on public.encomiendas_empresas for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- encomiendas_envios: interna, requiere sesión iniciada
create policy "sol_encomiendas_envios" on public.encomiendas_envios for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- encomiendas_zonas: interna, requiere sesión iniciada
create policy "sol_encomiendas_zonas" on public.encomiendas_zonas for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- entregas_trazabilidad: interna, requiere sesión iniciada
create policy "sol_entregas_trazabilidad" on public.entregas_trazabilidad for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- fichas_tecnicas: interna, requiere sesión iniciada
create policy "sol_fichas_tecnicas" on public.fichas_tecnicas for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- fin_bancos: módulo «finanzas» (dato sensible: se exige permiso concedido)
create policy "sol_fin_bancos" on public.fin_bancos for all to authenticated
  using (public.sol_puede('finanzas')) with check (public.sol_puede('finanzas'));

-- fin_bancos_inversiones: módulo «finanzas» (dato sensible: se exige permiso concedido)
create policy "sol_fin_bancos_inversiones" on public.fin_bancos_inversiones for all to authenticated
  using (public.sol_puede('finanzas')) with check (public.sol_puede('finanzas'));

-- fin_cuentas_cobrar: módulo «finanzas» (dato sensible: se exige permiso concedido)
create policy "sol_fin_cuentas_cobrar" on public.fin_cuentas_cobrar for all to authenticated
  using (public.sol_puede('finanzas')) with check (public.sol_puede('finanzas'));

-- fin_cuentas_pagar: módulo «finanzas» (dato sensible: se exige permiso concedido)
create policy "sol_fin_cuentas_pagar" on public.fin_cuentas_pagar for all to authenticated
  using (public.sol_puede('finanzas')) with check (public.sol_puede('finanzas'));

-- fin_cuentas_pagar_detalle: módulo «finanzas» (dato sensible: se exige permiso concedido)
create policy "sol_fin_cuentas_pagar_detalle" on public.fin_cuentas_pagar_detalle for all to authenticated
  using (public.sol_puede('finanzas')) with check (public.sol_puede('finanzas'));

-- ga4_metrics_cache: interna, requiere sesión iniciada
create policy "sol_ga4_metrics_cache" on public.ga4_metrics_cache for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- garantias_casos: interna, requiere sesión iniciada
create policy "sol_garantias_casos" on public.garantias_casos for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- halley_historial: interna, requiere sesión iniciada
create policy "sol_halley_historial" on public.halley_historial for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- hermes_agenda: interna, requiere sesión iniciada
create policy "sol_hermes_agenda" on public.hermes_agenda for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- hermes_config_tiers: interna, requiere sesión iniciada
create policy "sol_hermes_config_tiers" on public.hermes_config_tiers for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- hermes_proformas_cabecera: interna, requiere sesión iniciada
create policy "sol_hermes_proformas_cabecera" on public.hermes_proformas_cabecera for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- hermes_proformas_items: interna, requiere sesión iniciada
create policy "sol_hermes_proformas_items" on public.hermes_proformas_items for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- hermes_seguimientos: interna, requiere sesión iniciada
create policy "sol_hermes_seguimientos" on public.hermes_seguimientos for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- incomodidad_config: módulo «incomodidad» (dato sensible: se exige permiso concedido)
create policy "sol_incomodidad_config" on public.incomodidad_config for all to authenticated
  using (public.sol_puede('incomodidad')) with check (public.sol_puede('incomodidad'));

-- incomodidad_cuentas_gasto: módulo «incomodidad» (dato sensible: se exige permiso concedido)
create policy "sol_incomodidad_cuentas_gasto" on public.incomodidad_cuentas_gasto for all to authenticated
  using (public.sol_puede('incomodidad')) with check (public.sol_puede('incomodidad'));

-- incomodidad_gastos_nuevos: módulo «incomodidad» (dato sensible: se exige permiso concedido)
create policy "sol_incomodidad_gastos_nuevos" on public.incomodidad_gastos_nuevos for all to authenticated
  using (public.sol_puede('incomodidad')) with check (public.sol_puede('incomodidad'));

-- internal_team_devices: interna, requiere sesión iniciada
create policy "sol_internal_team_devices" on public.internal_team_devices for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- item_pesos: interna, requiere sesión iniciada
create policy "sol_item_pesos" on public.item_pesos for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- items_ocultos_compras: interna, requiere sesión iniciada
create policy "sol_items_ocultos_compras" on public.items_ocultos_compras for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- kommo_proveedores: interna, requiere sesión iniciada
create policy "sol_kommo_proveedores" on public.kommo_proveedores for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- kronos_simulador_compras: interna, requiere sesión iniciada
create policy "sol_kronos_simulador_compras" on public.kronos_simulador_compras for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- meta_campaigns: interna, requiere sesión iniciada
create policy "sol_meta_campaigns" on public.meta_campaigns for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- meta_config: interna, requiere sesión iniciada
create policy "sol_meta_config" on public.meta_config for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- meta_insights_daily: interna, requiere sesión iniciada
create policy "sol_meta_insights_daily" on public.meta_insights_daily for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- meta_page_posts: interna, requiere sesión iniciada
create policy "sol_meta_page_posts" on public.meta_page_posts for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- meta_pixel_events: interna, requiere sesión iniciada
create policy "sol_meta_pixel_events" on public.meta_pixel_events for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- meta_sync_log: interna, requiere sesión iniciada
create policy "sol_meta_sync_log" on public.meta_sync_log for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- mv_refresh_state: interna, requiere sesión iniciada
create policy "sol_mv_refresh_state" on public.mv_refresh_state for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- neo_asientos_estado: módulo «contabilidad» (dato sensible: se exige permiso concedido)
create policy "sol_neo_asientos_estado" on public.neo_asientos_estado for all to authenticated
  using (public.sol_puede('contabilidad')) with check (public.sol_puede('contabilidad'));

-- neo_compras_historico: interna, requiere sesión iniciada
create policy "sol_neo_compras_historico" on public.neo_compras_historico for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- neo_consolidado_facturas: interna, requiere sesión iniciada
create policy "sol_neo_consolidado_facturas" on public.neo_consolidado_facturas for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- neo_informe_ventas_categoria: interna, requiere sesión iniciada
create policy "sol_neo_informe_ventas_categoria" on public.neo_informe_ventas_categoria for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- neo_informe_ventas_vendedor: interna, requiere sesión iniciada
create policy "sol_neo_informe_ventas_vendedor" on public.neo_informe_ventas_vendedor for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- neo_inventario_proveedor: interna, requiere sesión iniciada
create policy "sol_neo_inventario_proveedor" on public.neo_inventario_proveedor for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- neo_items_comprados: interna, requiere sesión iniciada
create policy "sol_neo_items_comprados" on public.neo_items_comprados for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- neo_items_facturados: interna, requiere sesión iniciada
create policy "sol_neo_items_facturados" on public.neo_items_facturados for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- neo_items_vendidos: interna, requiere sesión iniciada
create policy "sol_neo_items_vendidos" on public.neo_items_vendidos for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- neo_lista_items: interna, requiere sesión iniciada
create policy "sol_neo_lista_items" on public.neo_lista_items for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- neo_minimos_maximos: interna, requiere sesión iniciada
create policy "sol_neo_minimos_maximos" on public.neo_minimos_maximos for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- neo_movimientos_contables: módulo «contabilidad» (dato sensible: se exige permiso concedido)
create policy "sol_neo_movimientos_contables" on public.neo_movimientos_contables for all to authenticated
  using (public.sol_puede('contabilidad')) with check (public.sol_puede('contabilidad'));

-- neo_ordenes_compra_estado: interna, requiere sesión iniciada
create policy "sol_neo_ordenes_compra_estado" on public.neo_ordenes_compra_estado for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- neo_rentabilidad_proveedor: módulo «finanzas» (dato sensible: se exige permiso concedido)
create policy "sol_neo_rentabilidad_proveedor" on public.neo_rentabilidad_proveedor for all to authenticated
  using (public.sol_puede('finanzas')) with check (public.sol_puede('finanzas'));

-- neptuno_docs: interna, requiere sesión iniciada
create policy "sol_neptuno_docs" on public.neptuno_docs for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- neptuno_envios: interna, requiere sesión iniciada
create policy "sol_neptuno_envios" on public.neptuno_envios for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- neptuno_items: interna, requiere sesión iniciada
create policy "sol_neptuno_items" on public.neptuno_items for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- ordenes_compra: interna, requiere sesión iniciada
create policy "sol_ordenes_compra" on public.ordenes_compra for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- ordenes_compra_items: interna, requiere sesión iniciada
create policy "sol_ordenes_compra_items" on public.ordenes_compra_items for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- pagos_items: módulo «pagos» (dato sensible: se exige permiso concedido)
create policy "sol_pagos_items" on public.pagos_items for all to authenticated
  using (public.sol_puede('pagos')) with check (public.sol_puede('pagos'));

-- pagos_sesion: módulo «pagos» (dato sensible: se exige permiso concedido)
create policy "sol_pagos_sesion" on public.pagos_sesion for all to authenticated
  using (public.sol_puede('pagos')) with check (public.sol_puede('pagos'));

-- pesos_alertas_log: interna, requiere sesión iniciada
create policy "sol_pesos_alertas_log" on public.pesos_alertas_log for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- pesos_packing_staging: interna, requiere sesión iniciada
create policy "sol_pesos_packing_staging" on public.pesos_packing_staging for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- planificacion_diaria: interna, requiere sesión iniciada
create policy "sol_planificacion_diaria" on public.planificacion_diaria for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- pricing_alertas_log: módulo «pricing» (dato sensible: se exige permiso concedido)
create policy "sol_pricing_alertas_log" on public.pricing_alertas_log for all to authenticated
  using (public.sol_puede('pricing')) with check (public.sol_puede('pricing'));

-- pricing_revision_compras: módulo «pricing» (dato sensible: se exige permiso concedido)
create policy "sol_pricing_revision_compras" on public.pricing_revision_compras for all to authenticated
  using (public.sol_puede('pricing')) with check (public.sol_puede('pricing'));

-- pricing_revision_settings: módulo «pricing» (dato sensible: se exige permiso concedido)
create policy "sol_pricing_revision_settings" on public.pricing_revision_settings for all to authenticated
  using (public.sol_puede('pricing')) with check (public.sol_puede('pricing'));

-- pricing_thresholds_skus: módulo «pricing» (dato sensible: se exige permiso concedido)
create policy "sol_pricing_thresholds_skus" on public.pricing_thresholds_skus for all to authenticated
  using (public.sol_puede('pricing')) with check (public.sol_puede('pricing'));

-- profecias_aprobaciones: interna, requiere sesión iniciada
create policy "sol_profecias_aprobaciones" on public.profecias_aprobaciones for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- profecias_config: interna, requiere sesión iniciada
create policy "sol_profecias_config" on public.profecias_config for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- profecias_estado_skus: interna, requiere sesión iniciada
create policy "sol_profecias_estado_skus" on public.profecias_estado_skus for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- profecias_historial_decisiones: interna, requiere sesión iniciada
create policy "sol_profecias_historial_decisiones" on public.profecias_historial_decisiones for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- proveedores_config: interna, requiere sesión iniciada
create policy "sol_proveedores_config" on public.proveedores_config for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- proveedores_leadtime: interna, requiere sesión iniciada
create policy "sol_proveedores_leadtime" on public.proveedores_leadtime for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- proveedores_pausados: interna, requiere sesión iniciada
create policy "sol_proveedores_pausados" on public.proveedores_pausados for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- radar_evaluaciones: interna, requiere sesión iniciada
create policy "sol_radar_evaluaciones" on public.radar_evaluaciones for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- radar_keywords: interna, requiere sesión iniciada
create policy "sol_radar_keywords" on public.radar_keywords for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- radar_logs: interna, requiere sesión iniciada
create policy "sol_radar_logs" on public.radar_logs for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- radar_productos: interna, requiere sesión iniciada
create policy "sol_radar_productos" on public.radar_productos for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- radar_tendencias: interna, requiere sesión iniciada
create policy "sol_radar_tendencias" on public.radar_tendencias for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- rrhh_capacitaciones: módulo «rrhh» (dato sensible: se exige permiso concedido)
create policy "sol_rrhh_capacitaciones" on public.rrhh_capacitaciones for all to authenticated
  using (public.sol_puede('rrhh')) with check (public.sol_puede('rrhh'));

-- rrhh_departamentos: módulo «rrhh» (dato sensible: se exige permiso concedido)
create policy "sol_rrhh_departamentos" on public.rrhh_departamentos for all to authenticated
  using (public.sol_puede('rrhh')) with check (public.sol_puede('rrhh'));

-- rrhh_empleados: módulo «rrhh» (dato sensible: se exige permiso concedido)
create policy "sol_rrhh_empleados" on public.rrhh_empleados for all to authenticated
  using (public.sol_puede('rrhh')) with check (public.sol_puede('rrhh'));

-- rrhh_empleados_historial: módulo «rrhh» (dato sensible: se exige permiso concedido)
create policy "sol_rrhh_empleados_historial" on public.rrhh_empleados_historial for all to authenticated
  using (public.sol_puede('rrhh')) with check (public.sol_puede('rrhh'));

-- rrhh_puestos: módulo «rrhh» (dato sensible: se exige permiso concedido)
create policy "sol_rrhh_puestos" on public.rrhh_puestos for all to authenticated
  using (public.sol_puede('rrhh')) with check (public.sol_puede('rrhh'));

-- rrhh_seguimiento: módulo «rrhh» (dato sensible: se exige permiso concedido)
create policy "sol_rrhh_seguimiento" on public.rrhh_seguimiento for all to authenticated
  using (public.sol_puede('rrhh')) with check (public.sol_puede('rrhh'));

-- rrhh_solicitudes: módulo «rrhh» (dato sensible: se exige permiso concedido)
create policy "sol_rrhh_solicitudes" on public.rrhh_solicitudes for all to authenticated
  using (public.sol_puede('rrhh')) with check (public.sol_puede('rrhh'));

-- rrhh_sucursales: módulo «rrhh» (dato sensible: se exige permiso concedido)
create policy "sol_rrhh_sucursales" on public.rrhh_sucursales for all to authenticated
  using (public.sol_puede('rrhh')) with check (public.sol_puede('rrhh'));

-- short_links: interna, requiere sesión iniciada
create policy "sol_short_links" on public.short_links for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- social_contenido: interna, requiere sesión iniciada
create policy "sol_social_contenido" on public.social_contenido for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- social_estadisticas: interna, requiere sesión iniciada
create policy "sol_social_estadisticas" on public.social_estadisticas for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- social_ideas: interna, requiere sesión iniciada
create policy "sol_social_ideas" on public.social_ideas for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- social_listos: interna, requiere sesión iniciada
create policy "sol_social_listos" on public.social_listos for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- social_metricas: interna, requiere sesión iniciada
create policy "sol_social_metricas" on public.social_metricas for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- social_pendientes: interna, requiere sesión iniciada
create policy "sol_social_pendientes" on public.social_pendientes for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- social_revision: interna, requiere sesión iniciada
create policy "sol_social_revision" on public.social_revision for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- social_tareas_urgentes: interna, requiere sesión iniciada
create policy "sol_social_tareas_urgentes" on public.social_tareas_urgentes for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- sol_consecutivos: interna, requiere sesión iniciada
create policy "sol_sol_consecutivos" on public.sol_consecutivos for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- sol_metas_vendedor: interna, requiere sesión iniciada
create policy "sol_sol_metas_vendedor" on public.sol_metas_vendedor for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- sync_requests: interna, requiere sesión iniciada
create policy "sol_sync_requests" on public.sync_requests for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- sync_status: interna, requiere sesión iniciada
create policy "sol_sync_status" on public.sync_status for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- tareas_equipo: interna, requiere sesión iniciada
create policy "sol_tareas_equipo" on public.tareas_equipo for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- tlc_china_partidas: interna, requiere sesión iniciada
create policy "sol_tlc_china_partidas" on public.tlc_china_partidas for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- transporte_flotilla: interna, requiere sesión iniciada
create policy "sol_transporte_flotilla" on public.transporte_flotilla for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- transporte_reglas_flete: interna, requiere sesión iniciada
create policy "sol_transporte_reglas_flete" on public.transporte_reglas_flete for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- transporte_zonas_tarifa: interna, requiere sesión iniciada
create policy "sol_transporte_zonas_tarifa" on public.transporte_zonas_tarifa for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- utm_campaigns: interna, requiere sesión iniciada
create policy "sol_utm_campaigns" on public.utm_campaigns for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- utm_links_history: interna, requiere sesión iniciada
create policy "sol_utm_links_history" on public.utm_links_history for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- vega_recurrentes: interna, requiere sesión iniciada
create policy "sol_vega_recurrentes" on public.vega_recurrentes for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- vega_tareas: interna, requiere sesión iniciada
create policy "sol_vega_tareas" on public.vega_tareas for all to authenticated
  using (public.sol_autenticado()) with check (public.sol_autenticado());

-- zz_neo_antiguedad_saldos: módulo «finanzas» (dato sensible: se exige permiso concedido)
create policy "sol_zz_neo_antiguedad_saldos" on public.zz_neo_antiguedad_saldos for all to authenticated
  using (public.sol_puede('finanzas')) with check (public.sol_puede('finanzas'));

-- zz_neo_antiguedad_saldos_clientes: módulo «finanzas» (dato sensible: se exige permiso concedido)
create policy "sol_zz_neo_antiguedad_saldos_clientes" on public.zz_neo_antiguedad_saldos_clientes for all to authenticated
  using (public.sol_puede('finanzas')) with check (public.sol_puede('finanzas'));

-- ── Tablas que solo tocan los procesos internos (service_role) ──────────
-- Quedan con RLS activo y SIN políticas: nadie llega desde el navegador.
--   boveda_accesos
--   boveda_inv_equipos
--   boveda_inv_licencias
--   boveda_log
--   club_canjes
--   club_config
--   club_miembros
--   club_productos_participan
--   club_registros
--   rifa_config
--   rifa_ganadores
--   rifa_participantes
--   rifa_patrocinadores
--   rifa_pendientes
--   rifa_registros
--   daemon_heartbeat
--   nav_uso
--   meta_adsets
--   meta_audiences
--   _temp_deploy

-- ── usuarios_sol: cada quien ve SOLO su propia ficha ────────────────────
-- Antes cualquiera bajaba la lista completa de usuarios con rol y permisos.
-- Nadie puede modificarla desde el navegador (eso evita que alguien se
-- ascienda a admin): los cambios van por /api/admin/*, que valida sesión.
create policy "sol_usuarios_sol_propio" on public.usuarios_sol for select to authenticated
  using (auth_id = auth.uid() or lower(email) = lower(nullif(auth.jwt() ->> 'email', '')));
create policy "sol_usuarios_sol_admin" on public.usuarios_sol for select to authenticated
  using (public.sol_puede('admin'));

-- ── genesis_usuarios (tabla vieja): solo la propia fila ─────────────────
create policy "sol_genesis_usuarios_propio" on public.genesis_usuarios for select to authenticated
  using (user_id = auth.uid());

commit;
