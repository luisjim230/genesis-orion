-- ============================================================================
-- Fix seguridad: habilitar RLS en public.neo_compras_historico
-- ----------------------------------------------------------------------------
-- El Security Advisor de Supabase la marcó como `rls_disabled_in_public`:
-- era la única tabla neo_* del sync con Row-Level Security apagado, por lo que
-- cualquiera con la URL del proyecto podía leer/editar/borrar sus 1866 filas.
--
-- Se replica EXACTAMENTE el patrón de sus tablas hermanas escritas por el mismo
-- sync de NEO (neo_items_comprados, neo_minimos_maximos, ...): RLS habilitado +
-- política permisiva para que el daemon de sync siga escribiendo igual, ya sea
-- con service_role (bypassa RLS) o con la anon key. No rompe nada del flujo
-- actual y silencia el advisor.
-- ============================================================================

alter table public.neo_compras_historico enable row level security;

create policy "allow_all"
  on public.neo_compras_historico
  for all
  to public
  using (true)
  with check (true);

create policy "allow_insert_anon_neo_compras_historico"
  on public.neo_compras_historico
  for insert
  to anon
  with check (true);

create policy "allow_insert_neo_compras_historico"
  on public.neo_compras_historico
  for insert
  to authenticated
  with check (true);

create policy "allow_select_anon_neo_compras_historico"
  on public.neo_compras_historico
  for select
  to anon
  using (true);

create policy "allow_select_neo_compras_historico"
  on public.neo_compras_historico
  for select
  to authenticated
  using (true);
