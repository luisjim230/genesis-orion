-- Simplifica el flujo de seguimiento de proformas: agrega 'en_seguimiento' como
-- estado intermedio explícito. Los valores legacy (sin_respuesta, interesado,
-- pensandolo, objecion_*) se mantienen para no romper registros existentes.

ALTER TABLE hermes_seguimientos
DROP CONSTRAINT IF EXISTS hermes_seguimientos_estado_resultado_check;

ALTER TABLE hermes_seguimientos
ADD CONSTRAINT hermes_seguimientos_estado_resultado_check
CHECK (estado_resultado = ANY (ARRAY[
  'en_seguimiento'::text,
  'sin_respuesta'::text,
  'interesado'::text,
  'pensandolo'::text,
  'objecion_precio'::text,
  'objecion_producto'::text,
  'ganada'::text,
  'perdida'::text
]));
