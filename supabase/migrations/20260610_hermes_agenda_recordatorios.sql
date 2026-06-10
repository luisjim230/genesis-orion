-- Agenda de contactos del seguimiento de proformas.
--
-- El vendedor "agenda" un próximo contacto (fecha + nota, ej. "llamar viernes")
-- desde un botón aparte en la proforma. La fecha agendada vigente maneja el
-- semáforo: antes = Al día, ese día = Toca hoy (bola amarilla), pasado = Atrasado.
-- Los superiores pueden dejar una "observación" (indicación) que el vendedor ve.
--
-- Tabla separada de la cabecera para que el sync de NEO nunca la pise. Una agenda
-- se considera vigente mientras la proforma no esté cerrada y no se haya hecho un
-- seguimiento más nuevo que la propia agenda (al registrar el contacto, caduca sola).

CREATE TABLE IF NOT EXISTS public.hermes_agenda (
  proforma        bigint PRIMARY KEY,
  fecha_agenda    date NOT NULL,
  nota            text,
  agendado_por    text,
  observacion     text,
  observacion_por text,
  creado_ts       timestamptz NOT NULL DEFAULT now(),
  actualizado_ts  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.hermes_agenda ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hermes_agenda_all ON public.hermes_agenda;
CREATE POLICY hermes_agenda_all ON public.hermes_agenda
  FOR ALL TO anon, authenticated, service_role
  USING (true) WITH CHECK (true);
GRANT ALL ON public.hermes_agenda TO anon, authenticated, service_role;

-- Vista materializada del panel con la agenda integrada al semáforo.
DROP MATERIALIZED VIEW IF EXISTS public.hermes_panel_view;

CREATE MATERIALIZED VIEW public.hermes_panel_view AS
 WITH items_con_costo AS (
         SELECT i.proforma, i.codigo_interno, i.item, i.cantidad_proformada,
            i.precio_unitario_sin_imp, i.descuento, i.es_servicio, nli.costo_sin_imp,
            i.precio_unitario_sin_imp * i.cantidad_proformada - COALESCE(i.descuento, 0::numeric) AS venta_linea,
                CASE WHEN i.es_servicio THEN 0::numeric
                     WHEN nli.costo_sin_imp IS NOT NULL THEN nli.costo_sin_imp * i.cantidad_proformada
                     ELSE NULL::numeric END AS costo_linea,
                CASE WHEN NOT i.es_servicio AND nli.costo_sin_imp IS NULL THEN true ELSE false END AS sin_costo
           FROM hermes_proformas_items i
             LEFT JOIN neo_lista_items nli ON nli.codigo_interno = i.codigo_interno
        ), agregado AS (
         SELECT items_con_costo.proforma,
            sum(CASE WHEN NOT items_con_costo.es_servicio THEN items_con_costo.venta_linea ELSE 0::numeric END) AS venta_mercaderia,
            sum(CASE WHEN NOT items_con_costo.es_servicio THEN items_con_costo.costo_linea ELSE 0::numeric END) AS costo_mercaderia,
            sum(CASE WHEN items_con_costo.es_servicio THEN items_con_costo.venta_linea ELSE 0::numeric END) AS venta_servicios,
            sum(CASE WHEN items_con_costo.sin_costo THEN 1 ELSE 0 END) AS items_sin_costo,
            count(*) AS lineas_total
           FROM items_con_costo GROUP BY items_con_costo.proforma
        ), ult_seg AS (
         SELECT DISTINCT ON (hermes_seguimientos.proforma) hermes_seguimientos.proforma,
            hermes_seguimientos.numero_seguimiento AS ultimo_seg_num,
            hermes_seguimientos.fecha_realizado AS ultimo_seg_fecha,
            hermes_seguimientos.estado_resultado AS ultimo_seg_estado
           FROM hermes_seguimientos
          ORDER BY hermes_seguimientos.proforma, hermes_seguimientos.numero_seguimiento DESC, hermes_seguimientos.fecha_realizado DESC
        ), tier_resolved AS (
         SELECT c_1.numero, c_1.total, t.id AS tier_id, t.nombre AS tier_nombre,
            t.seguimientos_req, t.sla_dias, t.color_hex AS tier_color
           FROM hermes_proformas_cabecera c_1
             LEFT JOIN hermes_config_tiers t ON c_1.total >= t.monto_min AND (t.monto_max IS NULL OR c_1.total <= t.monto_max) AND t.activo = true
        )
 SELECT c.numero AS proforma, c.fecha, c.vendedor, c.cliente, c.total AS monto_total, c.facturada, c.observaciones,
    tr.tier_id, tr.tier_nombre, tr.tier_color, tr.seguimientos_req, tr.sla_dias,
    COALESCE(a.venta_mercaderia, 0::numeric) AS venta_mercaderia,
    COALESCE(a.costo_mercaderia, 0::numeric) AS costo_mercaderia,
    COALESCE(a.venta_servicios, 0::numeric) AS venta_servicios,
    COALESCE(a.venta_mercaderia, 0::numeric) - COALESCE(a.costo_mercaderia, 0::numeric) AS utilidad_mercaderia,
        CASE WHEN COALESCE(a.venta_mercaderia, 0::numeric) > 0::numeric THEN round((a.venta_mercaderia - a.costo_mercaderia) / a.venta_mercaderia * 100::numeric, 2) ELSE NULL::numeric END AS margen_pct,
    COALESCE(a.items_sin_costo, 0::bigint) AS items_sin_costo,
    COALESCE(a.lineas_total, 0::bigint) AS lineas_total,
    COALESCE(a.items_sin_costo, 0::bigint) > 0 AS tiene_costos_faltantes,
    CURRENT_DATE - c.fecha AS dias_desde_proforma,
    COALESCE(us.ultimo_seg_num, 0) AS seguimientos_realizados,
    us.ultimo_seg_fecha, us.ultimo_seg_estado,
    ag.fecha_agenda AS agenda_fecha,
    ag.nota AS agenda_nota,
    ag.agendado_por AS agenda_por,
    ag.observacion AS agenda_observacion,
    ag.observacion_por AS agenda_observacion_por,
    (ag.fecha_agenda IS NOT NULL
       AND NOT COALESCE(c.facturada, false)
       AND COALESCE(us.ultimo_seg_estado, '') NOT IN ('ganada','perdida')
       AND (us.ultimo_seg_fecha IS NULL OR ag.actualizado_ts >= us.ultimo_seg_fecha)
    ) AS agenda_vigente,
        CASE
            WHEN c.facturada THEN NULL::integer
            WHEN us.ultimo_seg_estado = 'perdida'::text THEN NULL::integer
            WHEN us.ultimo_seg_estado = 'ganada'::text THEN NULL::integer
            WHEN tr.seguimientos_req IS NULL OR tr.seguimientos_req = 0 THEN NULL::integer
            ELSE COALESCE(us.ultimo_seg_num, 0) + 1
        END AS proximo_seg_num,
        CASE
            WHEN c.facturada THEN NULL::timestamp without time zone
            WHEN us.ultimo_seg_estado = 'perdida'::text THEN NULL::timestamp without time zone
            WHEN us.ultimo_seg_estado = 'ganada'::text THEN NULL::timestamp without time zone
            WHEN tr.seguimientos_req IS NULL OR tr.seguimientos_req = 0 THEN NULL::timestamp without time zone
            ELSE c.fecha + ((tr.sla_dias[COALESCE(us.ultimo_seg_num, 0) + 1] || ' days'::text)::interval)
        END AS proximo_seg_fecha_limite,
        CASE
            WHEN c.facturada THEN 'ganada'::text
            WHEN us.ultimo_seg_estado = 'ganada'::text THEN 'vendida'::text
            WHEN us.ultimo_seg_estado = 'perdida'::text THEN 'perdida'::text
            -- Agenda manual vigente: la fecha que puso el vendedor manda sobre el SLA
            WHEN ag.fecha_agenda IS NOT NULL AND (us.ultimo_seg_fecha IS NULL OR ag.actualizado_ts >= us.ultimo_seg_fecha) AND ag.fecha_agenda < CURRENT_DATE THEN 'atrasado'::text
            WHEN ag.fecha_agenda IS NOT NULL AND (us.ultimo_seg_fecha IS NULL OR ag.actualizado_ts >= us.ultimo_seg_fecha) AND ag.fecha_agenda = CURRENT_DATE THEN 'toca_hoy'::text
            WHEN ag.fecha_agenda IS NOT NULL AND (us.ultimo_seg_fecha IS NULL OR ag.actualizado_ts >= us.ultimo_seg_fecha) THEN 'al_dia'::text
            WHEN tr.seguimientos_req IS NULL OR tr.seguimientos_req = 0 THEN 'sin_tier'::text
            WHEN COALESCE(us.ultimo_seg_num, 0) = 0 AND (CURRENT_DATE - c.fecha) >= 2 THEN 'sin_contactar'::text
            WHEN (c.fecha + ((tr.sla_dias[COALESCE(us.ultimo_seg_num, 0) + 1] || ' days'::text)::interval)) < now() THEN 'atrasado'::text
            WHEN (c.fecha + ((tr.sla_dias[COALESCE(us.ultimo_seg_num, 0) + 1] || ' days'::text)::interval)) <= (now() + '24:00:00'::interval) THEN 'toca_hoy'::text
            ELSE 'al_dia'::text
        END AS semaforo
   FROM hermes_proformas_cabecera c
     LEFT JOIN tier_resolved tr ON tr.numero = c.numero
     LEFT JOIN agregado a ON a.proforma = c.numero
     LEFT JOIN ult_seg us ON us.proforma = c.numero
     LEFT JOIN hermes_agenda ag ON ag.proforma = c.numero;

CREATE UNIQUE INDEX idx_hermes_panel_proforma ON public.hermes_panel_view USING btree (proforma);
CREATE INDEX idx_hermes_panel_vendedor ON public.hermes_panel_view USING btree (vendedor);
CREATE INDEX idx_hermes_panel_semaforo ON public.hermes_panel_view USING btree (semaforo);
CREATE INDEX idx_hermes_panel_facturada ON public.hermes_panel_view USING btree (facturada);
GRANT ALL ON public.hermes_panel_view TO anon, authenticated, service_role;
