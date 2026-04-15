-- ============================================================
-- Migración: Cierres por turno + aislamiento por cajera
-- Fecha: 2026-04-15
-- ============================================================
-- INSTRUCCIONES: Ejecutar en Supabase SQL Editor (Settings > SQL Editor)
-- ============================================================

-- 1. Agregar columna 'turno' a cajas_aurora
--    Valores permitidos: 'mañana' | 'noche'
ALTER TABLE cajas_aurora
  ADD COLUMN IF NOT EXISTS turno TEXT NOT NULL DEFAULT 'mañana';

-- 2. Agregar columna 'cajera' a cajas_aurora
--    Guarda el nombre/username de quien registra el cierre
ALTER TABLE cajas_aurora
  ADD COLUMN IF NOT EXISTS cajera TEXT;

-- 3. Asignar cajera a los registros históricos de Laura
--    IMPORTANTE: Reemplazá 'Laura' por el valor exacto de
--    usuarios_sol.nombre (o .username) de la cuenta de Laura.
UPDATE cajas_aurora
  SET cajera = 'Laura'
  WHERE cajera IS NULL;

-- 4. Eliminar constraint único anterior sobre fecha (si existe)
ALTER TABLE cajas_aurora
  DROP CONSTRAINT IF EXISTS cajas_aurora_fecha_key;

-- 5. Nuevo constraint único: (fecha, turno, cajera)
--    Evita duplicar el mismo turno del mismo día para la misma cajera
ALTER TABLE cajas_aurora
  ADD CONSTRAINT cajas_aurora_fecha_turno_cajera_key
  UNIQUE (fecha, turno, cajera);

-- ============================================================
-- planificacion_diaria ya tiene 'created_by', no requiere cambios
-- de columnas. Verificar que los registros históricos de Laura
-- tengan created_by = 'Laura' (mismo valor que cajera arriba).
-- ============================================================

-- Opcional: ver los valores actuales para confirmar
-- SELECT DISTINCT created_by FROM planificacion_diaria;
-- SELECT DISTINCT cajera FROM cajas_aurora;
