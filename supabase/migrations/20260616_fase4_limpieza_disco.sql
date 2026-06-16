-- FASE 4: limpieza de disco para bajar uso (autorizada por Luis; grep en el repo
-- confirmó que ninguna app/script/vista/FK referencia estas tablas).
-- Backup manual del 2-jun (201 MB) — Supabase tiene backups automáticos diarios.
DROP TABLE IF EXISTS public.neo_items_facturados_backup_20260602;
-- Tablas zombi de marzo: renombrar (reversible). El DROP final lo decide Luis.
ALTER TABLE IF EXISTS public.neo_antiguedad_saldos RENAME TO zz_neo_antiguedad_saldos;
ALTER TABLE IF EXISTS public.neo_antiguedad_saldos_clientes RENAME TO zz_neo_antiguedad_saldos_clientes;
