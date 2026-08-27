-- ═══════════════════════════════════════════════════════════════════════════
--  PARTE 3 — vistas y materializadas: cerrar la puerta de atrás
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Una vista normal en Postgres corre con los permisos de QUIEN LA CREÓ, no de
--  quien la consulta. Por eso, aunque las tablas de abajo estuvieran cerradas,
--  consultar la vista devolvía los datos igual. Comprobado antes del arreglo:
--  sin sesión, `incomodidad_gasto_detalle` devolvía 66 filas y
--  `per_estado_resultados` (el estado de resultados de la empresa) 20.
--
--  security_invoker = on hace que la vista respete las políticas de las tablas
--  que lee, según quién consulta.
--
--  Se dejan como están, a propósito, club_saldos y rifa_saldos: las usan las
--  funciones públicas del Club y de la Rifa, que atienden a clientes sin
--  sesión y por eso necesitan leer con los permisos del dueño.

begin;

alter view public.incomodidad_capital_muerto          set (security_invoker = on);
alter view public.incomodidad_capital_muerto_resumen  set (security_invoker = on);
alter view public.incomodidad_cohortes                set (security_invoker = on);
alter view public.incomodidad_cuentas_detectadas      set (security_invoker = on);
alter view public.incomodidad_equilibrio              set (security_invoker = on);
alter view public.incomodidad_gasto_detalle           set (security_invoker = on);
alter view public.incomodidad_gasto_fijo              set (security_invoker = on);
alter view public.incomodidad_gmroi                   set (security_invoker = on);
alter view public.incomodidad_meta                    set (security_invoker = on);
alter view public.incomodidad_perdidas_inv_mensual    set (security_invoker = on);
alter view public.incomodidad_perdidas_inv_resumen    set (security_invoker = on);
alter view public.incomodidad_ventas_perdidas         set (security_invoker = on);
alter view public.per_estado_resultados               set (security_invoker = on);
alter view public.per_iva_mensual                     set (security_invoker = on);
alter view public.per_kpis                            set (security_invoker = on);
alter view public.v_catalogo_activo                   set (security_invoker = on);
alter view public.v_conta_cola_neo                    set (security_invoker = on);
alter view public.v_conta_conciliacion                set (security_invoker = on);
alter view public.v_dj_familia                        set (security_invoker = on);
alter view public.v_fam                               set (security_invoker = on);
alter view public.v_movimientos_contables_validos     set (security_invoker = on);
alter view public.v_pesos_por_revisar                 set (security_invoker = on);
alter view public.v_productos_sin_peso                set (security_invoker = on);
alter view public.v_vtas                              set (security_invoker = on);

-- Las vistas materializadas NO respetan RLS bajo ninguna configuración: son
-- una copia física de los datos. La única defensa es quitarles el acceso al
-- rol anónimo. Estaban expuestas por la API (advertencia
-- "materialized_view_in_api" del linter de Supabase).
revoke all on public.hermes_panel_view          from anon;
revoke all on public.incomodidad_mv_cuentas_mes from anon;
revoke all on public.incomodidad_mv_sku         from anon;
revoke all on public.mv_consumo_mensual         from anon;
revoke all on public.mv_items_por_vend_mes      from anon;
revoke all on public.profecias_panel            from anon;

-- Las vistas y materializadas siguen disponibles para quien tenga sesión.
grant select on public.hermes_panel_view          to authenticated;
grant select on public.incomodidad_mv_cuentas_mes to authenticated;
grant select on public.incomodidad_mv_sku         to authenticated;
grant select on public.mv_consumo_mensual         to authenticated;
grant select on public.mv_items_por_vend_mes      to authenticated;
grant select on public.profecias_panel            to authenticated;

commit;
