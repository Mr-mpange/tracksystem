-- Phone/browser GPS (no IoT device required)

CREATE TABLE IF NOT EXISTS public.driver_location_pings (
  id BIGSERIAL PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  latitude NUMERIC(10,6) NOT NULL,
  longitude NUMERIC(10,6) NOT NULL,
  speed NUMERIC(6,2),
  accuracy_m NUMERIC(8,2),
  source TEXT NOT NULL DEFAULT 'browser',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_location_vehicle_created
  ON public.driver_location_pings(vehicle_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_driver_location_driver_created
  ON public.driver_location_pings(driver_id, created_at DESC);

GRANT SELECT, INSERT ON public.driver_location_pings TO authenticated;
GRANT ALL ON public.driver_location_pings TO service_role;

ALTER TABLE public.driver_location_pings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "location_select_auth" ON public.driver_location_pings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "location_insert_driver" ON public.driver_location_pings
  FOR INSERT TO authenticated
  WITH CHECK (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_location_pings;
