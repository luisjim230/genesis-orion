-- ============================================================================
-- Cargas en tránsito (Jonás): documentos + mercadería
-- ----------------------------------------------------------------------------
-- Hasta ahora el módulo /contenedores se llenaba 100% a mano. Esta migración
-- agrega:
--   1. neptuno_docs  → proformas / facturas / contratos subidos por envío.
--   2. neptuno_items → qué mercadería viene en cada contenedor (línea por línea).
--   3. Columnas nuevas en neptuno_envios con lo que se extrae del documento
--      (PI, puertos, CBM, % de adelanto, resumen, impuestos estimados).
--
-- REGLA DE ORO: lo que Luis escribió a mano NUNCA se sobrescribe solo. La
-- extracción guarda su lectura en neptuno_docs.extraido y el módulo muestra un
-- comparativo campo por campo; aplicar un valor es siempre un click manual.
--
-- RLS: mismo criterio que neptuno_envios (allow_all) porque el módulo escribe
-- desde el browser con la anon key y toda la app vive detrás del login.
-- ============================================================================

-- ── 1. Documentos ───────────────────────────────────────────────────────────
create table if not exists neptuno_docs (
  id             bigserial primary key,
  envio_id       text references neptuno_envios(id) on delete set null,
  nombre         text not null,
  mime_type      text,
  tamano_bytes   bigint,
  storage_path   text not null,
  sha256         text,
  tipo_doc       text,                                -- proforma|factura|contrato|packing|bl|otro
  estado         text not null default 'procesado',   -- procesado|error
  error          text,
  extraido       jsonb,          -- lectura cruda del documento (nunca se pisa sola)
  match_sugerido jsonb,          -- candidatos de envío cuando se sube sin asignar
  creado_por     text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_neptuno_docs_envio on neptuno_docs(envio_id);
create unique index if not exists idx_neptuno_docs_sha on neptuno_docs(sha256) where sha256 is not null;

-- ── 2. Mercadería (línea por línea) ─────────────────────────────────────────
-- origen='archivo' → salió de una proforma/factura. origen='manual' → lo
-- escribió Luis. editado=true marca una línea que Luis tocó: un reproceso del
-- mismo documento no la vuelve a pisar.
create table if not exists neptuno_items (
  id               bigserial primary key,
  envio_id         text references neptuno_envios(id) on delete cascade,
  doc_id           bigint references neptuno_docs(id) on delete set null,
  linea            int,
  item_no          text,
  descripcion      text,
  nombre_comercial text,          -- el nombre con que se vende acá (AMALFI, ROMA...)
  categoria        text,
  color            text,
  medida           text,
  unidad           text,
  cantidad         numeric,
  precio_unitario  numeric,
  monto            numeric,
  cbm              numeric,
  partida          text,          -- código arancelario sugerido (8 dígitos)
  dai_pct          numeric,       -- DAI efectivo de esa partida (TLC China)
  codigo_interno   text,          -- enlace opcional a neo_lista_items
  origen           text not null default 'archivo',
  editado          boolean not null default false,
  notas            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_neptuno_items_envio on neptuno_items(envio_id);
create index if not exists idx_neptuno_items_doc   on neptuno_items(doc_id);

-- ── 3. Datos del envío que salen del documento ──────────────────────────────
alter table neptuno_envios
  add column if not exists pi_num             text,
  add column if not exists moneda             text default 'USD',
  add column if not exists mercaderia_monto   numeric,   -- valor FOB/EXW de la mercadería
  add column if not exists cbm_total          numeric,
  add column if not exists contenedor_tipo    text,      -- 1x40HQ, 2x40HC...
  add column if not exists puerto_origen      text,
  add column if not exists puerto_destino     text,
  add column if not exists pct_adelanto       numeric,   -- 30 = 30% de depósito
  add column if not exists dias_produccion    text,
  add column if not exists resumen            text,      -- qué viene, en una frase
  add column if not exists impuestos_estimado numeric,
  add column if not exists impuestos_detalle  jsonb,
  add column if not exists impuestos_fijado   boolean not null default false;

comment on column neptuno_envios.impuestos_estimado is
  'Estimado automático (DAI + Ley 6946 + IVA sobre CIF). Referencial: el monto real que manda es impuestos_monto.';
comment on column neptuno_envios.impuestos_fijado is
  'true = Luis fijó impuestos_monto a mano; el módulo no vuelve a proponer pisarlo.';

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
alter table neptuno_docs  enable row level security;
alter table neptuno_items enable row level security;
drop policy if exists allow_all on neptuno_docs;
drop policy if exists allow_all on neptuno_items;
create policy allow_all on neptuno_docs  for all using (true) with check (true);
create policy allow_all on neptuno_items for all using (true) with check (true);

-- ── 5. Bucket privado de los documentos ─────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'contenedores', 'contenedores', false, 20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'image/png',
    'image/jpeg'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = 20971520,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── 6. Vistas para el agente analista (chat) ────────────────────────────────
-- eta/etd son text en neptuno_envios: se castean solo si vienen bien formadas.
create or replace view v_neptuno_transito as
select
  e.id                                   as envio_id,
  e.nombre                               as envio,
  e.proveedor,
  e.estado,
  e.incoterm,
  e.pi_num,
  case when e.eta ~ '^\d{4}-\d{2}-\d{2}$' then e.eta::date end as eta,
  case when e.etd ~ '^\d{4}-\d{2}-\d{2}$' then e.etd::date end as etd,
  i.item_no,
  i.descripcion,
  i.nombre_comercial,
  i.categoria,
  i.color,
  i.medida,
  i.unidad,
  i.cantidad,
  i.precio_unitario,
  i.monto,
  i.cbm,
  i.partida,
  i.dai_pct,
  i.codigo_interno,
  i.origen,
  i.editado
from neptuno_envios e
join neptuno_items i on i.envio_id = e.id
where coalesce(e.archivado, false) = false;

alter view v_neptuno_transito set (security_invoker = on);
comment on view v_neptuno_transito is
  'Una fila por producto que viene en camino, con el contexto de su contenedor. Para "¿qué viene en tránsito?" usá esta vista.';

create or replace view v_neptuno_envios_resumen as
select
  e.id                              as envio_id,
  e.nombre                          as envio,
  e.proveedor,
  e.estado,
  e.incoterm,
  e.pi_num,
  case when e.eta ~ '^\d{4}-\d{2}-\d{2}$' then e.eta::date end as eta,
  e.resumen,
  e.cbm_total,
  e.contenedor_tipo,
  coalesce(e.adelanto_monto,0) + coalesce(e.final_monto,0)     as mercaderia_pagos,
  coalesce(e.mercaderia_monto,0)                                as mercaderia_doc,
  coalesce(e.flete_monto,0)                                     as flete,
  coalesce(e.impuestos_monto,0)                                 as impuestos,
  e.impuestos_estimado,
  coalesce(e.transporte_local_monto,0)                          as transporte_local,
  coalesce(e.adelanto_monto,0) + coalesce(e.final_monto,0)
    + coalesce(e.flete_monto,0) + coalesce(e.impuestos_monto,0)
    + coalesce(e.transporte_local_monto,0)                      as costo_total,
  (select count(*) from neptuno_items i where i.envio_id = e.id) as lineas,
  (select coalesce(sum(i.cantidad),0) from neptuno_items i where i.envio_id = e.id) as unidades
from neptuno_envios e
where coalesce(e.archivado, false) = false;

alter view v_neptuno_envios_resumen set (security_invoker = on);
comment on view v_neptuno_envios_resumen is
  'Un contenedor en tránsito por fila, con su costo total comprometido y cuántas líneas/unidades trae.';
