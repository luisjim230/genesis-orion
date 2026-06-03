-- ============================================================
-- Migración: enganchar recalcular_revision_compras() al sync global
-- Fecha: 2026-06-03
-- ============================================================
-- El dispatcher trigger_refresh_all_on_sync corre cuando CUALQUIER
-- downloader (sync_daemon, LaunchAgent individual, upload manual) marca
-- un sync exitoso en sync_status. Le agregamos la corrida de revisión
-- de compras para que las correcciones de precio en NEO (que entran por
-- neo_lista_items) limpien alertas solas, aunque no haya compra nueva.
-- ============================================================

CREATE OR REPLACE FUNCTION public.trigger_refresh_all_on_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  last_ts timestamptz;
BEGIN
  IF NEW.exitoso IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF NEW.ultima_sync IS NOT DISTINCT FROM OLD.ultima_sync THEN
    RETURN NEW;
  END IF;

  SELECT last_refresh INTO last_ts
    FROM public.mv_refresh_state
    WHERE view_name = 'refresh_all_dispatcher'
    FOR UPDATE SKIP LOCKED;

  IF last_ts IS NULL OR now() - last_ts < interval '3 minutes' THEN
    RETURN NEW;
  END IF;

  UPDATE public.mv_refresh_state
    SET last_refresh = now()
    WHERE view_name = 'refresh_all_dispatcher';

  BEGIN PERFORM public.refresh_mv_consumo_mensual();
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'refresh_mv_consumo_mensual: %', SQLERRM; END;

  BEGIN PERFORM public.refresh_mv_items_por_vend_mes();
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'refresh_mv_items_por_vend_mes: %', SQLERRM; END;

  BEGIN PERFORM public.refresh_profecias_panel();
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'refresh_profecias_panel: %', SQLERRM; END;

  BEGIN PERFORM public.bi_recalcular_resumen();
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'bi_recalcular_resumen: %', SQLERRM; END;

  BEGIN PERFORM public.recalcular_revision_compras();
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'recalcular_revision_compras: %', SQLERRM; END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_refresh_all_on_sync: %', SQLERRM;
  RETURN NEW;
END $$;
