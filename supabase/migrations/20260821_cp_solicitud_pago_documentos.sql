-- ============================================================================
-- Compras a Proveedor: solicitudes de pago + control de documentos pendientes
-- ----------------------------------------------------------------------------
-- 1) La compra pasa a funcionar también como SOLICITUD DE PAGO: se adjunta el
--    respaldo de la venta al cliente y la cotización del proveedor (PDF o foto)
--    y queda esperando que alguien la pague.
-- 2) Se agregan los punteros a esos dos archivos para poder saber, de una,
--    qué documentos faltan en cada compra (el 99% de las veces: la factura
--    del proveedor).
-- ============================================================================

-- ── Punteros a los respaldos de la solicitud de pago ────────────────────────
alter table cp_compras add column if not exists venta_archivo_id      bigint references cp_archivos(id);
alter table cp_compras add column if not exists cotizacion_archivo_id bigint references cp_archivos(id);
alter table cp_compras add column if not exists solicitado_por        text;
alter table cp_compras add column if not exists urgente               boolean not null default false;

create index if not exists idx_cp_compras_sin_venta
  on cp_compras(estado) where venta_archivo_id is null;
create index if not exists idx_cp_compras_sin_cotizacion
  on cp_compras(estado) where cotizacion_archivo_id is null;

-- ── El bucket ahora acepta fotos, no sólo PDF ───────────────────────────────
-- Luis sube desde el celu la foto de la venta o de la cotización del proveedor.
-- 15 MB para que entre una foto de cámara sin comprimir.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'compras-proveedor', 'compras-proveedor', false, 15728640,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = 15728640,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Alerta nueva: solicitud de pago esperando plata ─────────────────────────
-- Una compra ABIERTA con respaldo cargado es una solicitud de pago viva. A los
-- 3 días sin pagar, avisa (la vieja COMPRA_SIN_PAGO recién salta a los 15).
create or replace function cp_generar_alertas()
returns setof cp_alertas
language plpgsql
as $$
declare
  v_hoy date := (now() at time zone 'America/Costa_Rica')::date;
  v_ids bigint[] := '{}';
  v_tmp bigint[];
begin
  -- TIPO 1 y 2: PAGO_SIN_FACTURA / PAGO_SIN_FACTURA_CRITICO
  with psf as (
    select c.id as compra_id,
           prov.dias_alerta_pago_sin_factura as dias_alerta,
           (v_hoy - min(p.fecha_pago)) as dias
    from cp_compras c
    join cp_proveedores prov on prov.id = c.proveedor_id
    join cp_pagos p on p.compra_id = c.id
    left join cp_factura_pago_link l on l.pago_id = p.id
    where c.estado <> 'CERRADA' and l.id is null
    group by c.id, prov.dias_alerta_pago_sin_factura
  ),
  cand as (
    select compra_id,
      case when dias > 2 * dias_alerta then 'PAGO_SIN_FACTURA_CRITICO' else 'PAGO_SIN_FACTURA' end as tipo,
      case when dias > 2 * dias_alerta then 'ALTA' else 'MEDIA' end as severidad,
      case when dias > 2 * dias_alerta
        then 'Pago sin factura hace ' || dias || ' días (CRÍTICO, supera el doble del límite de ' || dias_alerta || ').'
        else 'Pago sin factura hace ' || dias || ' días (supera el límite de ' || dias_alerta || ').' end as mensaje
    from psf
    where dias > dias_alerta
  ),
  ins as (
    insert into cp_alertas (compra_id, tipo, severidad, mensaje)
    select compra_id, tipo, severidad, mensaje from cand c
    where not exists (
      select 1 from cp_alertas a
      where a.compra_id = c.compra_id and a.tipo = c.tipo and a.resuelta = false
    )
    returning id
  )
  select array_agg(id) into v_tmp from ins;
  v_ids := v_ids || coalesce(v_tmp, '{}');

  -- Bandera de alerta vencida en compras con pago sin factura vencido.
  update cp_compras c set bandera_alerta_vencida = true
  from cp_proveedores prov
  where prov.id = c.proveedor_id and c.estado <> 'CERRADA'
    and (
      select v_hoy - min(p.fecha_pago)
      from cp_pagos p
      left join cp_factura_pago_link l on l.pago_id = p.id
      where p.compra_id = c.id and l.id is null
    ) > prov.dias_alerta_pago_sin_factura;

  -- Al escalar a CRÍTICO, resolver la alerta MEDIA previa de la misma compra.
  update cp_alertas a set resuelta = true, resuelta_at = now()
  where a.tipo = 'PAGO_SIN_FACTURA' and a.resuelta = false
    and exists (
      select 1 from cp_alertas a2
      where a2.compra_id = a.compra_id and a2.tipo = 'PAGO_SIN_FACTURA_CRITICO' and a2.resuelta = false
    );

  -- TIPO 7: SOLICITUD_SIN_PAGAR (solicitud de pago con respaldo, > 3 días sin pago)
  with cand as (
    select c.id as compra_id, 'SOLICITUD_SIN_PAGAR' as tipo, 'MEDIA' as severidad,
      'Solicitud de pago sin pagar hace ' || (v_hoy - c.created_at::date) || ' días' ||
      case when c.monto_cotizado is not null then ' (₡' || round(c.monto_cotizado) || ')' else '' end || '.' as mensaje
    from cp_compras c
    where c.estado = 'ABIERTA'
      and (c.venta_archivo_id is not null or c.cotizacion_archivo_id is not null)
      and (v_hoy - c.created_at::date) > 3
  ),
  ins as (
    insert into cp_alertas (compra_id, tipo, severidad, mensaje)
    select compra_id, tipo, severidad, mensaje from cand c
    where not exists (
      select 1 from cp_alertas a
      where a.compra_id = c.compra_id and a.tipo = c.tipo and a.resuelta = false
    )
    returning id
  )
  select array_agg(id) into v_tmp from ins;
  v_ids := v_ids || coalesce(v_tmp, '{}');

  -- TIPO 3: COMPRA_SIN_PAGO (abierta > 15 días sin pago)
  with cand as (
    select c.id as compra_id, 'COMPRA_SIN_PAGO' as tipo, 'MEDIA' as severidad,
      'Compra abierta sin pago registrado hace ' || (v_hoy - c.created_at::date) || ' días.' as mensaje
    from cp_compras c
    where c.estado = 'ABIERTA' and (v_hoy - c.created_at::date) > 15
  ),
  ins as (
    insert into cp_alertas (compra_id, tipo, severidad, mensaje)
    select compra_id, tipo, severidad, mensaje from cand c
    where not exists (
      select 1 from cp_alertas a
      where a.compra_id = c.compra_id and a.tipo = c.tipo and a.resuelta = false
    )
    returning id
  )
  select array_agg(id) into v_tmp from ins;
  v_ids := v_ids || coalesce(v_tmp, '{}');

  -- TIPO 4: COTIZACION_VENCIDA (cotización > 30 días, aún abierta)
  with cand as (
    select c.id as compra_id, 'COTIZACION_VENCIDA' as tipo, 'BAJA' as severidad,
      'Cotización sin avanzar hace ' || (v_hoy - c.fecha_cotizacion) || ' días.' as mensaje
    from cp_compras c
    where c.estado = 'ABIERTA' and c.fecha_cotizacion is not null
      and (v_hoy - c.fecha_cotizacion) > 30
  ),
  ins as (
    insert into cp_alertas (compra_id, tipo, severidad, mensaje)
    select compra_id, tipo, severidad, mensaje from cand c
    where not exists (
      select 1 from cp_alertas a
      where a.compra_id = c.compra_id and a.tipo = c.tipo and a.resuelta = false
    )
    returning id
  )
  select array_agg(id) into v_tmp from ins;
  v_ids := v_ids || coalesce(v_tmp, '{}');

  -- TIPO 6: FACTURA_HUERFANA (factura subida > 7 días sin ningún link)
  with cand as (
    select f.id as factura_id, 'FACTURA_HUERFANA' as tipo, 'MEDIA' as severidad,
      'Factura ' || f.numero_factura || ' subida hace ' || (v_hoy - f.created_at::date) ||
      ' días sin conciliar con ningún pago.' as mensaje
    from cp_facturas f
    left join cp_factura_pago_link l on l.factura_id = f.id
    where l.id is null and (v_hoy - f.created_at::date) > 7
  ),
  ins as (
    insert into cp_alertas (factura_id, tipo, severidad, mensaje)
    select factura_id, tipo, severidad, mensaje from cand c
    where not exists (
      select 1 from cp_alertas a
      where a.factura_id = c.factura_id and a.tipo = c.tipo and a.resuelta = false
    )
    returning id
  )
  select array_agg(id) into v_tmp from ins;
  v_ids := v_ids || coalesce(v_tmp, '{}');

  return query
    select * from cp_alertas
    where id = any(v_ids)
    order by case severidad when 'ALTA' then 1 when 'MEDIA' then 2 else 3 end, created_at;
end;
$$;

-- Al registrarse el pago, la solicitud deja de estar esperando plata.
create or replace function cp_resolver_solicitud_al_pagar()
returns trigger
language plpgsql
as $$
begin
  update cp_alertas set resuelta = true, resuelta_at = now()
  where compra_id = new.compra_id
    and tipo in ('SOLICITUD_SIN_PAGAR', 'COMPRA_SIN_PAGO')
    and resuelta = false;
  return new;
end;
$$;

drop trigger if exists trg_cp_resolver_solicitud_al_pagar on cp_pagos;
create trigger trg_cp_resolver_solicitud_al_pagar
  after insert on cp_pagos
  for each row execute function cp_resolver_solicitud_al_pagar();
