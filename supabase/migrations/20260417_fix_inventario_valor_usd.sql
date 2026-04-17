-- Corrige inventario_valor_actual():
-- 1. Solo suma items con existencias > 0 (no resta negativos).
-- 2. Preserva las columnas items_positivos e items_negativos del original.
-- (No hay productos en USD, el campo moneda es siempre CRC o NULL.)

CREATE OR REPLACE FUNCTION inventario_valor_actual()
RETURNS TABLE(valor_costo numeric, items_positivos bigint, items_negativos bigint)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    COALESCE(SUM(
      CASE WHEN existencias::numeric > 0
        THEN existencias::numeric * COALESCE(ultimo_costo::numeric, 0)
        ELSE 0
      END
    ), 0),
    COUNT(*) FILTER (WHERE existencias::numeric > 0),
    COUNT(*) FILTER (WHERE existencias::numeric < 0)
  FROM neo_minimos_maximos
  WHERE fecha_carga = (SELECT MAX(fecha_carga) FROM neo_minimos_maximos);
$$;
