-- ============================================================
-- Origen: existencias frescas + auto-refresh en-base
-- Fecha: 2026-05-27
-- ============================================================
-- Problema reportado: en el módulo Origen → Riesgo de Quiebre, productos
-- con stock recién ingresado (ej. "PANEL PVC FLAT ALE", 689 unidades) salían
-- con existencias = 0 y semáforo CRÍTICO, pese a que el reporte de NEO ya se
-- había sincronizado.
--
-- Causa raíz (dos cosas):
--   1) bi_recalcular_resumen tomaba `existencias` de neo_lista_items, cuya
--      fila para ese SKU estaba congelada desde febrero (0 unidades). La
--      fuente fresca y canónica de stock es neo_minimos_maximos (el reporte
--      "Lista de mínimos y máximos", que el equipo sincroniza a diario).
--   2) bi_resumen_producto no se reconstruía automáticamente: el trigger
--      trg_refresh_all_on_sync había desaparecido de la base y el callback
--      HTTP a /api/refresh-all no era confiable (timeouts > 60s en pg_net),
--      así que bi quedó 7 días sin actualizarse.
--
-- Solución:
--   A) bi_recalcular_resumen ahora toma existencias de neo_minimos_maximos
--      (con fallback a neo_lista_items si no hubiera fila). El resto del
--      cálculo (capital, cobertura, clasificación) se deriva de ese valor.
--   B) Auto-refresh 100% en-base vía pg_cron: cada 5 min se revisa si hubo
--      un sync exitoso más nuevo que la última reconstrucción; si lo hubo,
--      se refrescan las 4 vistas derivadas. No bloquea a los downloaders
--      (corre en el worker de cron) y no depende de HTTP ni de la Mac.
-- ============================================================

-- ── A) bi_recalcular_resumen: existencias desde neo_minimos_maximos ──────────
CREATE OR REPLACE FUNCTION public.bi_recalcular_resumen()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  d90  date := CURRENT_DATE - INTERVAL '90 days';
  d180 date := CURRENT_DATE - INTERVAL '180 days';
  d60  date := CURRENT_DATE - INTERVAL '60 days';
  d30  date := CURRENT_DATE - INTERVAL '30 days';
BEGIN
  TRUNCATE bi_resumen_producto;

  INSERT INTO bi_resumen_producto (
    codigo_interno, nombre, categoria, proveedor, existencias, costo_unitario,
    capital_invertido, venta_total_90d, venta_mensual_90d, venta_total_180d,
    venta_mensual_180d, margen_pct, meses_cobertura, ultima_venta, ultima_compra,
    tendencia_pct, clasificacion, actualizado_en
  )
  WITH fact AS (
    SELECT
      codigo_interno,
      CASE
        WHEN fecha ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(left(fecha,10), 'DD/MM/YYYY')
        WHEN fecha ~ '^\d{4}-\d{2}-\d{2}' THEN to_date(left(fecha,10), 'YYYY-MM-DD')
      END AS f,
      cantidad_facturada::numeric - COALESCE(cantidad_devuelta::numeric,0) AS qty,
      cantidad_facturada::numeric AS qty_f,
      subtotal::numeric AS revenue,
      costo_unitario::numeric AS cu
    FROM neo_items_facturados
  ),
  primera AS (
    SELECT codigo_interno, MIN(f) AS primera_venta FROM fact WHERE f IS NOT NULL GROUP BY codigo_interno
  ),
  v90 AS (
    SELECT codigo_interno,
      SUM(qty) AS total,
      SUM(revenue) AS revenue,
      SUM(cu * qty) AS costo_total
    FROM fact WHERE f >= d90 GROUP BY codigo_interno
  ),
  v180 AS (
    SELECT codigo_interno, SUM(qty) AS total
    FROM fact WHERE f >= d180 GROUP BY codigo_interno
  ),
  uv AS (
    SELECT codigo_interno, MAX(f) AS ultima_venta FROM fact WHERE f IS NOT NULL GROUP BY codigo_interno
  ),
  tend AS (
    SELECT codigo_interno,
      SUM(CASE WHEN f >= d30 THEN qty_f ELSE 0 END) AS v30,
      SUM(CASE WHEN f <  d30 THEN qty_f ELSE 0 END) AS v30prev
    FROM fact WHERE f >= d60 GROUP BY codigo_interno
  ),
  lista AS (
    SELECT
      i.codigo_interno, i.item, i.proveedor,
      -- Stock desde neo_minimos_maximos (reporte que se sincroniza a diario);
      -- fallback a neo_lista_items cuando no hay fila en mínimos/máximos.
      COALESCE(mm.existencias, i.existencias)::numeric AS exist,
      i.costo_sin_imp::numeric AS costo_unit,
      CASE
        WHEN i.ultima_compra ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(left(i.ultima_compra,10),'DD/MM/YYYY')
        WHEN i.ultima_compra ~ '^\d{4}-\d{2}-\d{2}' THEN to_date(left(i.ultima_compra,10),'YYYY-MM-DD')
        ELSE NULL
      END AS ultima_compra_d
    FROM neo_lista_items i
    LEFT JOIN neo_minimos_maximos mm ON mm.codigo = i.codigo_interno
    WHERE i.activo = 'Sí' AND i.codigo_interno != 'TRANSPORTE'
      AND i.item IS NOT NULL AND btrim(i.item) != ''
  )
  SELECT
    l.codigo_interno, l.item, NULL::text, l.proveedor,
    l.exist, l.costo_unit,
    l.exist * l.costo_unit,
    COALESCE(v90.total, 0),
    CASE WHEN COALESCE(v90.total, 0) > 0 THEN
      ROUND(v90.total / GREATEST((CURRENT_DATE - GREATEST(p.primera_venta, d90))::numeric / 30.0, 1), 1)
    ELSE 0 END,
    COALESCE(v180.total, 0),
    CASE WHEN COALESCE(v180.total, 0) > 0 THEN
      ROUND(v180.total / GREATEST((CURRENT_DATE - GREATEST(p.primera_venta, d180))::numeric / 30.0, 1), 1)
    ELSE 0 END,
    CASE WHEN COALESCE(v90.revenue, 0) > 0
      THEN ROUND(((v90.revenue - v90.costo_total) / v90.revenue * 100)::numeric, 1)
      ELSE 0 END,
    CASE WHEN COALESCE(v90.total, 0) > 0 THEN
      ROUND((l.exist / (v90.total / GREATEST((CURRENT_DATE - GREATEST(p.primera_venta, d90))::numeric / 30.0, 1)))::numeric, 1)
    ELSE 999 END,
    uv.ultima_venta,
    l.ultima_compra_d,
    CASE WHEN COALESCE(t.v30prev, 0) > 0
      THEN ROUND(((t.v30 - t.v30prev) / t.v30prev * 100)::numeric, 1)
      ELSE 0 END,
    CASE
      WHEN l.exist <= 0 THEN 'sin_stock'
      WHEN p.primera_venta >= d60 THEN 'normal'
      WHEN COALESCE(v90.total, 0) = 0
        AND (l.ultima_compra_d IS NULL OR l.ultima_compra_d < d60)
        THEN 'muerto'
      WHEN COALESCE(v90.total, 0) = 0 THEN 'normal'
      WHEN p.primera_venta < d90
        AND (l.exist / NULLIF(v90.total / GREATEST((CURRENT_DATE - GREATEST(p.primera_venta, d90))::numeric / 30.0, 1), 0)) > 6 THEN 'sobrestock'
      WHEN (l.exist / NULLIF(v90.total / GREATEST((CURRENT_DATE - GREATEST(p.primera_venta, d90))::numeric / 30.0, 1), 0)) < 2 THEN 'reforzar'
      ELSE 'normal'
    END,
    now()
  FROM lista l
  LEFT JOIN v90 ON v90.codigo_interno = l.codigo_interno
  LEFT JOIN v180 ON v180.codigo_interno = l.codigo_interno
  LEFT JOIN uv  ON uv.codigo_interno  = l.codigo_interno
  LEFT JOIN primera p ON p.codigo_interno = l.codigo_interno
  LEFT JOIN tend t ON t.codigo_interno = l.codigo_interno;
END;
$function$;

-- ── B) Auto-refresh en-base vía pg_cron ──────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Row marcador (reutiliza mv_refresh_state).
INSERT INTO public.mv_refresh_state (view_name, last_refresh)
VALUES ('refresh_all_dispatcher', 'epoch')
ON CONFLICT (view_name) DO NOTHING;

-- Refresca las 4 vistas derivadas SOLO si hubo un sync exitoso más nuevo que
-- la última reconstrucción. La revisión barata (dos max()) corre cada 5 min;
-- el trabajo pesado solo ocurre cuando realmente entraron datos nuevos.
CREATE OR REPLACE FUNCTION public.sol_auto_refresh_derivados()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_sync timestamptz;
  v_done      timestamptz;
BEGIN
  SELECT max(ultima_sync) INTO v_last_sync FROM public.sync_status WHERE exitoso IS TRUE;
  SELECT last_refresh   INTO v_done       FROM public.mv_refresh_state WHERE view_name = 'refresh_all_dispatcher';

  IF v_last_sync IS NULL OR (v_done IS NOT NULL AND v_last_sync <= v_done) THEN
    RETURN;  -- nada nuevo
  END IF;

  BEGIN PERFORM public.refresh_mv_consumo_mensual();
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'refresh_mv_consumo_mensual: %', SQLERRM; END;

  BEGIN PERFORM public.refresh_mv_items_por_vend_mes();
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'refresh_mv_items_por_vend_mes: %', SQLERRM; END;

  BEGIN PERFORM public.refresh_profecias_panel();
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'refresh_profecias_panel: %', SQLERRM; END;

  BEGIN PERFORM public.bi_recalcular_resumen();
  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'bi_recalcular_resumen: %', SQLERRM; END;

  UPDATE public.mv_refresh_state SET last_refresh = v_last_sync
    WHERE view_name = 'refresh_all_dispatcher';
END;
$$;

GRANT EXECUTE ON FUNCTION public.sol_auto_refresh_derivados() TO service_role;

-- (Re)programar el job cada 5 minutos.
DO $$
BEGIN
  PERFORM cron.unschedule('sol_refresh_derivados');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('sol_refresh_derivados', '*/5 * * * *', $$SELECT public.sol_auto_refresh_derivados();$$);
