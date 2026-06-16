-- Funciones para el Reporte Matutino (scripts/reporte_matutino.py).
-- Reusan la MISMA fórmula de ventas que SOL (send_daily_report.mjs): excluyen
-- servicios (transporte/flete/ruteo) y prorratean devoluciones.

-- Ventas (revenue + utilidad + facturas) de un período.
CREATE OR REPLACE FUNCTION public.sol_ventas_periodo(desde date, hasta date)
RETURNS json LANGUAGE sql STABLE AS $$
  WITH base AS (
    SELECT subtotal, costo_unitario, cantidad_facturada,
           COALESCE(cantidad_devuelta,0) AS cant_dev
    FROM public.neo_items_facturados
    WHERE fecha_real BETWEEN desde AND hasta
      AND cantidad_facturada > 0
      AND NOT (item ILIKE '%transporte%' OR item ILIKE '%flete%' OR item ILIKE '%ruteo%')
  )
  SELECT json_build_object(
    'ventas',   COALESCE(round(sum(subtotal * (cantidad_facturada - cant_dev) / cantidad_facturada)), 0),
    'utilidad', COALESCE(round(sum(subtotal * (cantidad_facturada - cant_dev) / cantidad_facturada
                                   - costo_unitario * (cantidad_facturada - cant_dev))), 0),
    'facturas', (SELECT count(DISTINCT factura) FROM public.neo_items_facturados
                 WHERE fecha_real BETWEEN desde AND hasta AND factura IS NOT NULL)
  ) FROM base;
$$;
ALTER FUNCTION public.sol_ventas_periodo(date, date) SET statement_timeout = '120s';

-- Anomalía: ventas por categoría últimos 7 días vs 7 previos (categoría desde
-- neo_lista_items por codigo_interno; NO usa neo_informe_ventas_categoria que está congelada).
CREATE OR REPLACE FUNCTION public.sol_anomalia_categorias()
RETURNS json LANGUAGE sql STABLE AS $$
  WITH v AS (
    SELECT l.categoria,
      CASE WHEN f.fecha_real >= current_date - 7 THEN 'reciente' ELSE 'previo' END AS ventana,
      f.subtotal * (f.cantidad_facturada - COALESCE(f.cantidad_devuelta,0)) / NULLIF(f.cantidad_facturada,0) AS monto
    FROM public.neo_items_facturados f
    JOIN public.neo_lista_items l ON l.codigo_interno = f.codigo_interno
    WHERE f.fecha_real >= current_date - 14 AND f.fecha_real < current_date
      AND f.cantidad_facturada > 0
      AND NOT (f.item ILIKE '%transporte%' OR f.item ILIKE '%flete%' OR f.item ILIKE '%ruteo%')
      AND l.categoria IS NOT NULL AND l.categoria <> ''
  ), agg AS (
    SELECT categoria,
      COALESCE(sum(monto) FILTER (WHERE ventana='reciente'),0) AS reciente,
      COALESCE(sum(monto) FILTER (WHERE ventana='previo'),0)   AS previo
    FROM v GROUP BY categoria
  )
  SELECT COALESCE(json_agg(json_build_object(
      'categoria', categoria, 'reciente', round(reciente), 'previo', round(previo),
      'cambio_pct', round(((reciente - previo) / previo) * 100)
    ) ORDER BY abs((reciente - previo)/previo) DESC), '[]'::json)
  FROM agg
  WHERE previo > 50000 AND abs((reciente - previo)/previo) >= 0.30;
$$;
ALTER FUNCTION public.sol_anomalia_categorias() SET statement_timeout = '120s';
