-- Planned routes + on-route compliance for schedules

ALTER TYPE public.alert_type ADD VALUE IF NOT EXISTS 'off_route';
COMMIT;

CREATE TYPE public.route_status AS ENUM ('not_started', 'on_route', 'off_route', 'completed');

CREATE TABLE IF NOT EXISTS public.routes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  waypoints JSONB NOT NULL DEFAULT '[]',
  corridor_radius_m INTEGER NOT NULL DEFAULT 500,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT routes_waypoints_array CHECK (jsonb_typeof(waypoints) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_routes_name ON public.routes(name);

ALTER TABLE public.driver_schedules
  ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES public.routes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS route_status public.route_status NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS last_route_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS off_route_count INTEGER NOT NULL DEFAULT 0;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.routes TO authenticated;
GRANT ALL ON public.routes TO service_role;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "routes_select_auth" ON public.routes FOR SELECT TO authenticated USING (true);
CREATE POLICY "routes_write_manager" ON public.routes FOR ALL TO authenticated
  USING (public.can_manage_fleet(auth.uid()))
  WITH CHECK (public.can_manage_fleet(auth.uid()));

CREATE TRIGGER trg_routes_touch
  BEFORE UPDATE ON public.routes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
