-- Lista pública de patrocinadores (para el carrusel de logos del landing /rifa).
-- Solo expone nombre/tier/logo/orden de los activos; nada sensible.
create or replace function public.rifa_patrocinadores_publicos()
returns table(nombre text, tier text, logo_url text, orden int)
language sql security definer set search_path to 'public' as $$
  select nombre, tier, logo_url, orden from public.rifa_patrocinadores where activo order by orden, nombre;
$$;
grant execute on function public.rifa_patrocinadores_publicos() to anon, authenticated;
