-- ════════════════════════════════════════════════════════════════════════
-- BÓVEDA DE ACCESOS · campo "fecha de pago de licencia"
-- Campo opcional para entradas que son licencias/suscripciones: guarda la
-- fecha del próximo pago para tenerla a mano junto a la credencial.
-- ════════════════════════════════════════════════════════════════════════

alter table public.boveda_accesos
  add column if not exists fecha_pago_licencia date;

-- ── boveda_listar: agrega la columna al retorno (drop+create por cambio de tipo)
drop function if exists public.boveda_listar();
create function public.boveda_listar()
returns table(
  id uuid, titulo text, categoria text, usuario_acceso text, correo text,
  descripcion text, fecha_pago_licencia date, tiene_clave boolean,
  created_by_nombre text, updated_by_nombre text,
  created_at timestamptz, updated_at timestamptz
)
language sql security definer set search_path = public
as $$
  select id, titulo, categoria, usuario_acceso, correo, descripcion,
         fecha_pago_licencia,
         (clave_cifrada is not null) as tiene_clave,
         created_by_nombre, updated_by_nombre, created_at, updated_at
  from public.boveda_accesos
  order by created_at desc;
$$;

-- ── boveda_crear: nuevo p_fecha_pago al final con default (no rompe llamadas viejas)
drop function if exists public.boveda_crear(text,text,text,text,text,text,uuid,text);
create function public.boveda_crear(
  p_titulo text, p_categoria text, p_usuario text, p_correo text,
  p_clave text, p_descripcion text, p_actor_id uuid, p_actor_nombre text,
  p_fecha_pago date default null
) returns uuid
language plpgsql security definer set search_path = public, vault, extensions
as $$
declare v_key text; v_id uuid;
begin
  if coalesce(trim(p_titulo), '') = '' then
    raise exception 'El título es obligatorio';
  end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'boveda_master_key' limit 1;
  if v_key is null then raise exception 'Falta la llave maestra de la bóveda'; end if;

  insert into public.boveda_accesos(
    titulo, categoria, usuario_acceso, correo, clave_cifrada, descripcion,
    fecha_pago_licencia,
    created_by, created_by_nombre, updated_by, updated_by_nombre
  ) values (
    trim(p_titulo), nullif(trim(p_categoria), ''), nullif(trim(p_usuario), ''),
    nullif(trim(p_correo), ''),
    case when coalesce(p_clave, '') = '' then null else pgp_sym_encrypt(p_clave, v_key) end,
    nullif(trim(p_descripcion), ''),
    p_fecha_pago,
    p_actor_id, p_actor_nombre, p_actor_id, p_actor_nombre
  ) returning id into v_id;

  insert into public.boveda_log(acceso_id, acceso_titulo, accion, actor_id, actor_nombre)
  values (v_id, trim(p_titulo), 'crear', p_actor_id, p_actor_nombre);
  return v_id;
end; $$;

-- ── boveda_editar: nuevo p_fecha_pago al final con default
drop function if exists public.boveda_editar(uuid,text,text,text,text,text,text,uuid,text);
create function public.boveda_editar(
  p_id uuid, p_titulo text, p_categoria text, p_usuario text, p_correo text,
  p_clave text, p_descripcion text, p_actor_id uuid, p_actor_nombre text,
  p_fecha_pago date default null
) returns void
language plpgsql security definer set search_path = public, vault, extensions
as $$
declare v_key text; v_titulo text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'boveda_master_key' limit 1;
  update public.boveda_accesos set
    titulo         = coalesce(nullif(trim(p_titulo), ''), titulo),
    categoria      = nullif(trim(p_categoria), ''),
    usuario_acceso = nullif(trim(p_usuario), ''),
    correo         = nullif(trim(p_correo), ''),
    clave_cifrada  = case
                       when p_clave is null then clave_cifrada   -- sin cambio
                       when p_clave = ''    then null            -- borrar clave
                       else pgp_sym_encrypt(p_clave, v_key)      -- nueva clave
                     end,
    descripcion    = nullif(trim(p_descripcion), ''),
    fecha_pago_licencia = p_fecha_pago,
    updated_by     = p_actor_id, updated_by_nombre = p_actor_nombre, updated_at = now()
  where id = p_id
  returning titulo into v_titulo;
  if v_titulo is null then raise exception 'Acceso no encontrado'; end if;

  insert into public.boveda_log(acceso_id, acceso_titulo, accion, actor_id, actor_nombre)
  values (p_id, v_titulo, 'editar', p_actor_id, p_actor_nombre);
end; $$;

-- ── Permisos: solo service_role ejecuta (las API corren con esa key) ──
revoke all on function public.boveda_listar()                                            from public, anon, authenticated;
revoke all on function public.boveda_crear(text,text,text,text,text,text,uuid,text,date)  from public, anon, authenticated;
revoke all on function public.boveda_editar(uuid,text,text,text,text,text,text,uuid,text,date) from public, anon, authenticated;
grant execute on function public.boveda_listar()                                            to service_role;
grant execute on function public.boveda_crear(text,text,text,text,text,text,uuid,text,date)  to service_role;
grant execute on function public.boveda_editar(uuid,text,text,text,text,text,text,uuid,text,date) to service_role;
