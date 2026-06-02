-- Limpieza de duplicados acumulados en neo_items_facturados.
--
-- Contexto: el sync nocturno reinsertaba el mes abierto en cada corrida. Como
-- `bodega` viene NULL en ~38% de las líneas y el constraint único
-- (factura, codigo_interno, bodega) trata NULL como distinto, esas filas se
-- acumulaban (mar 2026 +16%, abr +41%, may +104%, jun en curso).
--
-- Estrategia: por cada LÍNEA lógica única conservar la fila con MAX(fecha_carga)
-- (desempate por MAX(id)) y borrar las demás. Conservar la carga más reciente
-- preserva el comportamiento de SOL (que lee la última carga) y reproduce los
-- valores reales verificados (mar ₡392M, abr ₡290M, may ₡313M). El conteo de
-- facturas distintas por mes NO baja: las ~68 facturas de mayo que solo viven en
-- cargas viejas se conservan porque el dedupe es POR LÍNEA, no por carga.
--
-- Clave natural de línea (sin `bodega`, que es justamente el campo NULL que
-- rompe el constraint):
--   (periodo_reporte, factura, codigo_interno, cantidad_facturada,
--    cantidad_devuelta, precio_unitario, costo_unitario, subtotal, descuento)
--
-- SOLO se tocan los períodos con formato 'YYYY-MM' >= '2026-02'. Los snapshots
-- históricos ('Día 2025-...', '21/08/2024', etc.) tienen una sola carga y NO se
-- tocan: los totales mensuales de 2025 y ene-2026 quedan idénticos al colón.
-- El sync ya quedó idempotente (delete-before-insert del período abierto), así
-- que esto no se vuelve a inflar.

WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY periodo_reporte, factura, codigo_interno, cantidad_facturada,
                   cantidad_devuelta, precio_unitario, costo_unitario, subtotal, descuento
      ORDER BY fecha_carga DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.neo_items_facturados
  WHERE periodo_reporte ~ '^\d{4}-\d{2}$'
    AND periodo_reporte >= '2026-02'
)
DELETE FROM public.neo_items_facturados t
USING ranked r
WHERE t.id = r.id
  AND r.rn > 1;
