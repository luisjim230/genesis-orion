-- ============================================================
-- Migración: Reemplazar RPC inventario_valor_actual para leer
-- datos frescos directamente desde neo_lista_items.
-- Fecha: 2026-04-21
-- ============================================================
-- Problema: la versión anterior devolvía un valor stale (~₡413M)
-- mientras la tabla real sumaba ~₡485M, omitiendo compras recientes
-- (ej. ₡18M en ventanas el 19-abr que no aparecían en el dashboard SOL).
-- ============================================================

CREATE OR REPLACE FUNCTION public.inventario_valor_actual()
RETURNS TABLE(
    valor_costo numeric,
    items_positivos integer,
    items_negativos integer
)
LANGUAGE sql
STABLE
AS $$
    SELECT
        COALESCE(SUM(existencias * costo_sin_imp) FILTER (WHERE existencias > 0), 0)::numeric AS valor_costo,
        COUNT(*) FILTER (WHERE existencias > 0)::integer AS items_positivos,
        COUNT(*) FILTER (WHERE existencias < 0)::integer AS items_negativos
    FROM public.neo_lista_items
    WHERE activo = 'Sí';
$$;

-- Permisos (para que anon y authenticated puedan ejecutarlo)
GRANT EXECUTE ON FUNCTION public.inventario_valor_actual() TO anon, authenticated, service_role;
