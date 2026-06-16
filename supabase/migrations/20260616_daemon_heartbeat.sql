-- daemon_heartbeat: latido del sync_daemon (M1) para que el health-check (en la
-- nube, GitHub Actions) detecte si el daemon murió en silencio. El daemon hace
-- upsert de last_beat en cada ciclo (~60s); health_check.mjs alerta si >90 min.
-- RLS activo sin políticas → solo service_role accede (daemon + health-check).
CREATE TABLE IF NOT EXISTS public.daemon_heartbeat (
  id integer PRIMARY KEY DEFAULT 1,
  last_beat timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT solo_una_fila CHECK (id = 1)
);
ALTER TABLE public.daemon_heartbeat ENABLE ROW LEVEL SECURITY;
INSERT INTO public.daemon_heartbeat (id, last_beat)
VALUES (1, now()) ON CONFLICT (id) DO NOTHING;
