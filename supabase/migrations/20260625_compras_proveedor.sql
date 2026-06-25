-- ============================================================================
-- Módulo: Control de Compras a Proveedor  (prefijo cp_)
-- ----------------------------------------------------------------------------
-- Controla el "limbo" entre que se paga a un proveedor (transferencia) y que
-- llega la factura fiscal. Registra compras, pagos (con PDF de comprobante),
-- facturas (con PDF) y la conciliación N:M factura<->pago. Genera alertas de
-- pagos sin factura vencidos, discrepancias de monto, etc.
--
-- Diseño: todo el acceso es vía API routes con service_role, por lo que las
-- tablas tienen RLS habilitado SIN políticas (deny-all para anon/authenticated;
-- el service_role bypassa RLS). Las funciones cp_recompute_estado y
-- cp_generar_alertas concentran la lógica de estados y alertas.
-- ============================================================================

-- ── Proveedores ─────────────────────────────────────────────────────────────
create table if not exists cp_proveedores (
  id              bigserial primary key,
  nombre          text not null,
  cedula_juridica text,
  contacto        text,
  email           text,
  telefono        text,
  dias_alerta_pago_sin_factura int not null default 8,
  activo          boolean not null default true,
  created_at      timestamptz not null default now()
);

-- ── Archivos adjuntos (PDFs de pagos y facturas) ────────────────────────────
-- Metadata únicamente; el binario vive en Supabase Storage (bucket privado
-- compras-proveedor). Los archivos NUNCA se borran (trazabilidad fiscal).
create table if not exists cp_archivos (
  id           bigserial primary key,
  nombre       text not null,
  mime_type    text not null,
  tamano_bytes bigint not null,
  storage_path text not null,
  sha256       text,
  uploaded_by  text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_cp_archivos_sha on cp_archivos(sha256);

-- ── Compras (la unidad de control) ──────────────────────────────────────────
create table if not exists cp_compras (
  id                     bigserial primary key,
  proveedor_id           bigint not null references cp_proveedores(id),
  venta_cliente_ref      text,
  cliente_nombre         text,
  descripcion            text not null,
  cantidad               numeric(12,3),
  unidad                 text,
  monto_cotizado         numeric(14,2),
  fecha_cotizacion       date,
  fecha_entrega          date,
  estado                 text not null default 'ABIERTA',  -- ABIERTA|PAGADA|FACTURADA|CERRADA
  bandera_alerta_vencida boolean not null default false,
  bandera_discrepancia   boolean not null default false,
  notas                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists idx_cp_compras_estado    on cp_compras(estado);
create index if not exists idx_cp_compras_proveedor on cp_compras(proveedor_id);

-- ── Pagos hechos al proveedor (uno por transferencia) ───────────────────────
create table if not exists cp_pagos (
  id                     bigserial primary key,
  compra_id              bigint not null references cp_compras(id) on delete restrict,
  fecha_pago             date not null,
  monto                  numeric(14,2) not null check (monto > 0),
  referencia_bancaria    text,
  banco_origen           text,
  comprobante_archivo_id bigint references cp_archivos(id),
  created_at             timestamptz not null default now()
);
create index if not exists idx_cp_pagos_compra on cp_pagos(compra_id);
create index if not exists idx_cp_pagos_fecha  on cp_pagos(fecha_pago);

-- ── Facturas recibidas del proveedor ────────────────────────────────────────
create table if not exists cp_facturas (
  id             bigserial primary key,
  proveedor_id   bigint not null references cp_proveedores(id),
  numero_factura text not null,
  fecha_factura  date not null,
  monto_total    numeric(14,2) not null check (monto_total > 0),
  archivo_id     bigint references cp_archivos(id),
  notas          text,
  created_at     timestamptz not null default now(),
  unique (proveedor_id, numero_factura)
);
create index if not exists idx_cp_facturas_proveedor on cp_facturas(proveedor_id);

-- ── Vínculo factura <-> pago (N:M, soporta facturas consolidadas) ───────────
-- unique(pago_id): un pago sólo puede estar en UNA factura (regla 11).
create table if not exists cp_factura_pago_link (
  id             bigserial primary key,
  factura_id     bigint not null references cp_facturas(id) on delete cascade,
  pago_id        bigint not null references cp_pagos(id) on delete cascade,
  monto_aplicado numeric(14,2) not null check (monto_aplicado > 0),
  created_at     timestamptz not null default now(),
  unique (pago_id)
);
create index if not exists idx_cp_link_factura on cp_factura_pago_link(factura_id);

-- ── Log de alertas emitidas (idempotente, no notificar dos veces) ───────────
create table if not exists cp_alertas (
  id          bigserial primary key,
  compra_id   bigint references cp_compras(id) on delete cascade,
  factura_id  bigint references cp_facturas(id) on delete cascade,
  tipo        text not null,   -- PAGO_SIN_FACTURA | PAGO_SIN_FACTURA_CRITICO | COMPRA_SIN_PAGO | COTIZACION_VENCIDA | DISCREPANCIA_MONTO | FACTURA_HUERFANA
  severidad   text not null,   -- BAJA | MEDIA | ALTA
  mensaje     text not null,
  resuelta    boolean not null default false,
  resuelta_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_cp_alertas_resueltas on cp_alertas(resuelta);
create index if not exists idx_cp_alertas_compra    on cp_alertas(compra_id);

-- ── RLS: habilitado sin políticas (sólo service_role accede, vía API) ───────
alter table cp_proveedores       enable row level security;
alter table cp_archivos          enable row level security;
alter table cp_compras           enable row level security;
alter table cp_pagos             enable row level security;
alter table cp_facturas          enable row level security;
alter table cp_factura_pago_link enable row level security;
alter table cp_alertas           enable row level security;

-- ============================================================================
-- Función: cp_recompute_estado(compra_id)
-- Recalcula estado + banderas de una compra a partir de sus pagos y links.
-- Maneja la alerta de discrepancia (tipo 5) y resuelve PAGO_SIN_FACTURA cuando
-- la compra queda totalmente facturada.
-- ============================================================================
create or replace function cp_recompute_estado(p_compra_id bigint)
returns void
language plpgsql
as $$
declare
  v_suma_pagos   numeric(14,2);
  v_suma_fact    numeric(14,2);
  v_estado_act   text;
  v_nuevo_estado text;
  v_disc         boolean := false;
  v_hay_no_fact  boolean;
begin
  select estado into v_estado_act from cp_compras where id = p_compra_id;
  if not found then return; end if;

  select coalesce(sum(monto), 0) into v_suma_pagos
    from cp_pagos where compra_id = p_compra_id;

  select coalesce(sum(l.monto_aplicado), 0) into v_suma_fact
    from cp_factura_pago_link l
    join cp_pagos p on p.id = l.pago_id
    where p.compra_id = p_compra_id;

  select exists (
    select 1 from cp_pagos p
    left join cp_factura_pago_link l on l.pago_id = p.id
    where p.compra_id = p_compra_id and l.id is null
  ) into v_hay_no_fact;

  if v_suma_pagos = 0 then
    v_nuevo_estado := 'ABIERTA'; v_disc := false;
  elsif v_suma_fact = 0 then
    v_nuevo_estado := 'PAGADA'; v_disc := false;
  elsif v_suma_fact = v_suma_pagos then
    v_nuevo_estado := 'FACTURADA'; v_disc := false;
  else
    v_nuevo_estado := 'PAGADA'; v_disc := true;
  end if;

  -- Respetar CERRADA (cierre manual) salvo que se quede sin pagos.
  if v_estado_act = 'CERRADA' and v_suma_pagos > 0 then
    update cp_compras set
      bandera_discrepancia   = v_disc,
      bandera_alerta_vencida = case when v_hay_no_fact then bandera_alerta_vencida else false end,
      updated_at = now()
    where id = p_compra_id;
  else
    update cp_compras set
      estado                 = v_nuevo_estado,
      bandera_discrepancia   = v_disc,
      bandera_alerta_vencida = case when v_hay_no_fact then bandera_alerta_vencida else false end,
      updated_at = now()
    where id = p_compra_id;
  end if;

  -- Tipo 5: DISCREPANCIA_MONTO (idempotente)
  if v_disc then
    if not exists (
      select 1 from cp_alertas
      where compra_id = p_compra_id and tipo = 'DISCREPANCIA_MONTO' and resuelta = false
    ) then
      insert into cp_alertas (compra_id, tipo, severidad, mensaje)
      values (p_compra_id, 'DISCREPANCIA_MONTO', 'ALTA',
        'Factura vinculada pero lo facturado (' || v_suma_fact ||
        ') no cuadra con lo pagado (' || v_suma_pagos || ').');
    end if;
  else
    update cp_alertas set resuelta = true, resuelta_at = now()
    where compra_id = p_compra_id and tipo = 'DISCREPANCIA_MONTO' and resuelta = false;
  end if;

  -- Si ya no quedan pagos sin factura, resolver PAGO_SIN_FACTURA*.
  if not v_hay_no_fact then
    update cp_alertas set resuelta = true, resuelta_at = now()
    where compra_id = p_compra_id
      and tipo in ('PAGO_SIN_FACTURA', 'PAGO_SIN_FACTURA_CRITICO')
      and resuelta = false;
  end if;
end;
$$;

-- ============================================================================
-- Función: cp_generar_alertas()
-- Corre 1x al día (cron). Genera alertas idempotentes (tipos 1,2,3,4,6) y
-- devuelve SÓLO las alertas nuevas insertadas en esta corrida (para Telegram).
-- Zona horaria America/Costa_Rica para todos los cálculos de días.
-- ============================================================================
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
