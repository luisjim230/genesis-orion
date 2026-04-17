-- Corrige inventario_valor_actual() para convertir ítems en USD a CRC.
-- Antes sumaba todos los costos sin importar la moneda, lo que causaba que
-- ítems con moneda='USD' se sumaran como si fueran colones (subestimando el total).
-- Ahora acepta un tipo de cambio (tc) con default 530 ₡/USD.

CREATE OR REPLACE FUNCTION inventario_valor_actual(tc numeric DEFAULT 530)
RETURNS TABLE(valor_costo numeric)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(SUM(
    COALESCE(existencias::numeric, 0) *
    COALESCE(ultimo_costo::numeric, 0) *
    CASE WHEN moneda = 'USD' THEN tc ELSE 1 END
  ), 0)
  FROM neo_minimos_maximos
  WHERE fecha_carga = (SELECT MAX(fecha_carga) FROM neo_minimos_maximos);
$$;
