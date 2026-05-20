-- Auto-refresh de TODAS las vistas derivadas cuando cualquier downloader
-- (sync_daemon, LaunchAgent individual, upload manual, etc.) marca un
-- sync exitoso en public.sync_status. Reemplaza la dependencia de que
-- cada script Python llame manualmente a /api/refresh-all.
--
-- Flujo:
--   1. Downloader baja reporte y carga datos en neo_*
--   2. Downloader hace PATCH a sync_status (ultima_sync + exitoso=true)
--   3. Este trigger detecta el cambio y refresca las 4 vistas
--   4. Próxima visita a Profecías/Inventario/Kronos ve datos frescos
--
-- Debounce de 3 min: una ráfaga de 10 downloaders solo refresca 2-3 veces.
-- Las funciones individuales tienen su propio throttle interno donde aplica.

INSERT INTO public.mv_refresh_state (view_name, last_refresh)
VALUES ('refresh_all_dispatcher', 'epoch')
ON CONFLICT (view_name) DO NOTHING;

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

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_refresh_all_on_sync: %', SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_refresh_all_on_sync ON public.sync_status;

CREATE TRIGGER trg_refresh_all_on_sync
AFTER UPDATE OF ultima_sync, exitoso ON public.sync_status
FOR EACH ROW
EXECUTE FUNCTION public.trigger_refresh_all_on_sync();
