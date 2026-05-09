-- ============================================================
-- pricing_dataset_json: variante JSON del RPC pricing_dataset
-- Fecha: 2026-05-09
-- ============================================================
-- Problema: PostgREST aplica el límite max-rows (1000) a las
-- funciones que devuelven TABLE. Con ~4175 SKUs reales en el
-- dataset, el cliente recibía solo los primeros 1000 y SKUs
-- legítimos como `5492865` (PANEL PVC FLAT JASS, rank 63 por
-- venta) quedaban fuera del response.
--
-- Solución: envolver el resultado en jsonb. PostgREST entrega
-- el valor jsonb tal cual, sin truncar.
-- ============================================================

CREATE OR REPLACE FUNCTION pricing_dataset_json(
  p_start DATE,
  p_end   DATE
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET statement_timeout TO '60s'
AS $$
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
  FROM pricing_dataset(p_start, p_end) t;
$$;

GRANT EXECUTE ON FUNCTION pricing_dataset_json(DATE, DATE) TO authenticated, anon, service_role;
