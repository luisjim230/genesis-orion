-- ─────────────────────────────────────────────────────────────────────────────
-- Disk IO: frenar los rebuilds completos de vistas materializadas
--
-- Diagnóstico (pg_stat_statements + edge_logs, ventana de 24 h del 2026-08-19):
--   refresh_mv_items_por_vend_mes   41 llamadas/día × 85–123 s  → ~1 h/día
--   refresh_profecias_panel         45 llamadas/día × 30–45 s   → ~30 min/día
--   bi_recalcular_resumen           40 llamadas/día × 30 s      → ~20 min/día
--   refresh_hermes_panel            45 llamadas/día × 11 s      → ~8 min/día
--   refresh_mv_consumo_mensual      52 llamadas/día × 4–5 s     → ~4 min/día
--
-- Cada una de esas llamadas barre las 786k filas / 603 MB de
-- neo_items_facturados y reescribe la vista entera. Estaban pensadas para
-- correr 1 vez al día (workflow refresh-all.yml) pero la app las dispara desde
-- botones, cargas de página y acciones sueltas del UI. Eso solo ya son ~2 h
-- diarias de la base leyendo y escribiendo a disco sin necesidad: es el grueso
-- del Disk IO Budget que Supabase está reclamando.
--
-- Solución: un guard común (_mv_debe_refrescar) que
--   1) respeta un intervalo mínimo por vista,
--   2) coalescea ráfagas de clicks (advisory lock + FOR UPDATE SKIP LOCKED),
--   3) admite p_force, pero SOLO para service_role/postgres — o sea el cron
--      diario y las rutas de servidor, nunca el navegador (anon).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.mv_refresh_state (
  view_name    text PRIMARY KEY,
  last_refresh timestamptz NOT NULL DEFAULT now()
);

-- Devuelve true solo si corresponde refrescar. Deja tomado el lock de la fila
-- y el advisory lock hasta que termine la transacción del caller, así dos
-- refrescos simultáneos no se pisan.
CREATE OR REPLACE FUNCTION public._mv_debe_refrescar(
  p_view         text,
  p_min_interval interval,
  p_force        boolean DEFAULT false
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  last_ts timestamptz;
  v_role  text;
BEGIN
  -- p_force solo vale desde el servidor (cron / API con service key).
  v_role := coalesce(nullif(current_setting('role', true), 'none'), session_user);
  IF p_force AND v_role NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    p_force := false;
  END IF;

  INSERT INTO public.mv_refresh_state (view_name, last_refresh)
  VALUES (p_view, '-infinity')
  ON CONFLICT (view_name) DO NOTHING;

  SELECT last_refresh INTO last_ts
    FROM public.mv_refresh_state
   WHERE view_name = p_view
     FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN false;                       -- ya hay un refresh en curso
  END IF;

  IF NOT p_force AND now() - last_ts < p_min_interval THEN
    RETURN false;                       -- refrescada hace poco
  END IF;

  IF NOT pg_try_advisory_xact_lock(hashtext('mv_refresh_' || p_view)) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public._mv_debe_refrescar(text, interval, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._mv_debe_refrescar(text, interval, boolean) TO postgres, service_role;

-- ── mv_items_por_vend_mes (la más cara: 85–123 s) ───────────────────────────
DROP FUNCTION IF EXISTS public.refresh_mv_items_por_vend_mes();
CREATE OR REPLACE FUNCTION public.refresh_mv_items_por_vend_mes(p_force boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '0'
SET search_path TO public
AS $$
BEGIN
  IF NOT public._mv_debe_refrescar('mv_items_por_vend_mes', interval '6 hours', p_force) THEN
    RETURN 'skipped';
  END IF;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_items_por_vend_mes;
  UPDATE public.mv_refresh_state SET last_refresh = now()
   WHERE view_name = 'mv_items_por_vend_mes';
  RETURN 'refreshed';
END;
$$;

-- ── mv_consumo_mensual ──────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.refresh_mv_consumo_mensual();
CREATE OR REPLACE FUNCTION public.refresh_mv_consumo_mensual(p_force boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '0'
SET search_path TO public
AS $$
BEGIN
  IF NOT public._mv_debe_refrescar('mv_consumo_mensual', interval '15 minutes', p_force) THEN
    RETURN 'skipped';
  END IF;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_consumo_mensual;
  UPDATE public.mv_refresh_state SET last_refresh = now()
   WHERE view_name = 'mv_consumo_mensual';
  RETURN 'refreshed';
END;
$$;

-- ── profecias_panel ─────────────────────────────────────────────────────────
-- Se dispara fire-and-forget desde aprobar / aprobar-lote / cancelar /
-- clasificacion / generar-orden. Con 5 min de ventana, una ráfaga de clicks
-- termina en un solo rebuild y el panel sigue quedando fresco.
DROP FUNCTION IF EXISTS public.refresh_profecias_panel();
CREATE OR REPLACE FUNCTION public.refresh_profecias_panel(p_force boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '0'
SET search_path TO public
AS $$
BEGIN
  IF NOT public._mv_debe_refrescar('profecias_panel', interval '5 minutes', p_force) THEN
    RETURN 'skipped';
  END IF;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.profecias_panel;
  UPDATE public.mv_refresh_state SET last_refresh = now()
   WHERE view_name = 'profecias_panel';
  RETURN 'refreshed';
END;
$$;

-- ── hermes_panel_view ───────────────────────────────────────────────────────
-- Además del throttle, pasa a CONCURRENTLY: el REFRESH plano tomaba
-- ACCESS EXCLUSIVE y dejaba clavado a todo el que estuviera leyendo el panel
-- de proformas (hay índice único idx_hermes_panel_proforma, así que se puede).
DROP FUNCTION IF EXISTS public.refresh_hermes_panel();
CREATE OR REPLACE FUNCTION public.refresh_hermes_panel(p_force boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '5min'
SET search_path TO public
AS $$
BEGIN
  IF NOT public._mv_debe_refrescar('hermes_panel_view', interval '1 minute', p_force) THEN
    RETURN 'skipped';
  END IF;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.hermes_panel_view;
  UPDATE public.mv_refresh_state SET last_refresh = now()
   WHERE view_name = 'hermes_panel_view';
  RETURN 'refreshed';
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_mv_items_por_vend_mes(boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_mv_consumo_mensual(boolean)    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_profecias_panel(boolean)       TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_hermes_panel(boolean)          TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
