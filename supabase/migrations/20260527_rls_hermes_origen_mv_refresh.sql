-- Activa RLS en las 7 tablas que el Security Advisor de Supabase marcó como
-- "rls_disabled_in_public" (CRÍTICO: cualquiera con la URL del proyecto podía
-- leer/editar/borrar los datos vía la anon key pública).
--
-- Policies permisivas (USING true) para anon/authenticated/service_role: NO
-- rompen nada porque
--   * la app SOL lee/escribe estas tablas con la anon key desde el browser,
--   * los syncs de NEO escriben con la service_role key.
-- Mismo patrón que ya usan las tablas de Profecías (20260510_profecias_setup.sql).

ALTER TABLE public.hermes_seguimientos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hermes_proformas_cabecera      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hermes_proformas_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hermes_config_tiers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mv_refresh_state               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clasificacion_origen_proveedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clasificacion_origen_producto  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hermes_seguimientos_all            ON public.hermes_seguimientos;
DROP POLICY IF EXISTS hermes_proformas_cabecera_all      ON public.hermes_proformas_cabecera;
DROP POLICY IF EXISTS hermes_proformas_items_all         ON public.hermes_proformas_items;
DROP POLICY IF EXISTS hermes_config_tiers_all            ON public.hermes_config_tiers;
DROP POLICY IF EXISTS mv_refresh_state_all               ON public.mv_refresh_state;
DROP POLICY IF EXISTS clasificacion_origen_proveedor_all ON public.clasificacion_origen_proveedor;
DROP POLICY IF EXISTS clasificacion_origen_producto_all  ON public.clasificacion_origen_producto;

CREATE POLICY hermes_seguimientos_all            ON public.hermes_seguimientos            FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY hermes_proformas_cabecera_all      ON public.hermes_proformas_cabecera      FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY hermes_proformas_items_all         ON public.hermes_proformas_items         FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY hermes_config_tiers_all            ON public.hermes_config_tiers            FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY mv_refresh_state_all               ON public.mv_refresh_state               FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY clasificacion_origen_proveedor_all ON public.clasificacion_origen_proveedor FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY clasificacion_origen_producto_all  ON public.clasificacion_origen_producto  FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
