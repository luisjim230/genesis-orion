-- ============================================================
-- Fix de lentitud general: refrescos que NO bloqueen lecturas
-- Fecha: 2026-07-13
-- ============================================================
-- Síntoma: "SOL lento en general" durante el día.
--
-- Diagnóstico: el hosting web responde en ~0.2s (no es red ni Vercel). La
-- lentitud viene de la base: cada sync de NEO (items_facturados) dispara
-- refrescos pesados que toman AccessExclusiveLock y CONGELAN las lecturas
-- de las tablas que la app muestra:
--
--   1) refresh_mv_items_por_vend_mes: hace `REFRESH MATERIALIZED VIEW` normal
--      (NO concurrent) sobre mv_items_por_vend_mes (~350k filas, derivada de
--      neo_items_facturados ~768k). Tarda 150-260s y durante todo ese tiempo
--      cualquier SELECT a esa vista queda bloqueado. Los logs muestran
--      duraciones de 149.718 ms y 262.507 ms + "canceling statement due to
--      statement timeout" en los lectores.
--
--   2) bi_recalcular_resumen: hace `TRUNCATE bi_resumen_producto` + INSERT.
--      TRUNCATE toma AccessExclusiveLock, así que la tabla queda bloqueada
--      para lectura durante los ~30s que tarda la agregación.
--
-- Arreglo (no cambia NINGÚN dato que se muestra, solo cómo se escribe):
--
--   1) Volver a `REFRESH MATERIALIZED VIEW CONCURRENTLY` (ya existe el índice
--      único mv_items_uniq_cod_vend_mes que lo permite). CONCURRENTLY no toma
--      lock exclusivo: los lectores nunca se congelan durante el refresh.
--
--   2) Reemplazar TRUNCATE por DELETE dentro de la misma transacción. DELETE
--      toma RowExclusiveLock (no bloquea SELECT); por MVCC los lectores ven las
--      filas viejas hasta el COMMIT y nunca ven la tabla vacía ni se bloquean.
--      Se agrega un advisory lock para conservar el single-flight que TRUNCATE
--      daba implícitamente (evita que dos corridas simultáneas dupliquen filas).
--
-- Se conservan todos los guards previos: advisory xact lock, debounce de 5 min
-- y statement_timeout = 0. La consulta que define cada resultado NO se toca.
-- ============================================================

-- ── 1) mv_items_por_vend_mes: CONCURRENTLY (sin bloquear lecturas) ───────────
CREATE OR REPLACE FUNCTION public.refresh_mv_items_por_vend_mes()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET statement_timeout TO '0'
AS $function$
DECLARE
  last_ts timestamptz;
  got_lock boolean;
BEGIN
  SELECT last_refresh INTO last_ts
    FROM public.mv_refresh_state
    WHERE view_name = 'mv_items_por_vend_mes'
    FOR UPDATE SKIP LOCKED;

  IF last_ts IS NULL THEN
    RETURN 'skipped: ya hay un refresh en curso';
  END IF;

  IF now() - last_ts < interval '5 minutes' THEN
    RETURN 'skipped: refrescada hace ' || extract(epoch FROM (now() - last_ts))::int || 's';
  END IF;

  got_lock := pg_try_advisory_xact_lock(hashtext('refresh_mv_items_por_vend_mes'));
  IF NOT got_lock THEN
    RETURN 'skipped: otro refresh en curso';
  END IF;

  -- CONCURRENTLY: no toma AccessExclusiveLock -> los lectores no se congelan.
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_items_por_vend_mes;

  UPDATE public.mv_refresh_state
    SET last_refresh = now()
    WHERE view_name = 'mv_items_por_vend_mes';

  RETURN 'refreshed';
END;
$function$;

-- ── 2) bi_recalcular_resumen: DELETE en vez de TRUNCATE (sin bloquear) ───────
CREATE OR REPLACE FUNCTION public.bi_recalcular_resumen()
 RETURNS void
 LANGUAGE plpgsql
 SET statement_timeout TO '0'
AS $function$
DECLARE
  d90  date := CURRENT_DATE - INTERVAL '90 days';
  d180 date := CURRENT_DATE - INTERVAL '180 days';
  d60  date := CURRENT_DATE - INTERVAL '60 days';
  d30  date := CURRENT_DATE - INTERVAL '30 days';
BEGIN
  -- Single-flight: TRUNCATE serializaba por su lock exclusivo; con DELETE ya no,
  -- así que serializamos explícito para no duplicar filas si corren dos a la vez.
  IF NOT pg_try_advisory_xact_lock(hashtext('bi_recalcular_resumen')) THEN
    RETURN;
  END IF;

  -- DELETE (RowExclusiveLock) en vez de TRUNCATE (AccessExclusiveLock): los
  -- lectores ven las filas anteriores por MVCC hasta el COMMIT, no se bloquean.
  DELETE FROM bi_resumen_producto;

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
