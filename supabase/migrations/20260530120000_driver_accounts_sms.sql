-- Driver accounts, SMS logs, and scoped access for drivers

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'driver';
COMMIT;

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS drivers_user_id_unique
  ON public.drivers(user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  alert_id UUID REFERENCES public.alerts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  provider_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_logs_driver_created ON public.sms_logs(driver_id, created_at DESC);

GRANT SELECT ON public.sms_logs TO authenticated;
GRANT ALL ON public.sms_logs TO service_role;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_logs_select_manager" ON public.sms_logs
  FOR SELECT TO authenticated
  USING (public.can_manage_fleet(auth.uid()));

CREATE POLICY "sms_logs_select_own_driver" ON public.sms_logs
  FOR SELECT TO authenticated
  USING (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );

-- Helpers
CREATE OR REPLACE FUNCTION public.is_driver(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'driver')
$$;

CREATE OR REPLACE FUNCTION public.driver_vehicle_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT vehicle_id FROM public.drivers WHERE user_id = _user_id LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.is_driver(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.driver_vehicle_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_driver(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.driver_vehicle_id(uuid) TO authenticated;

-- Drivers: read own profile
CREATE POLICY "drivers_select_own" ON public.drivers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Sensor logs: drivers see only their assigned vehicle
CREATE POLICY "sensor_logs_select_driver" ON public.sensor_logs
  FOR SELECT TO authenticated
  USING (
    public.is_driver(auth.uid())
    AND vehicle_id = public.driver_vehicle_id(auth.uid())
  );

-- Alerts: drivers see alerts for their vehicle
CREATE POLICY "alerts_select_driver" ON public.alerts
  FOR SELECT TO authenticated
  USING (
    public.is_driver(auth.uid())
    AND vehicle_id = public.driver_vehicle_id(auth.uid())
  );

-- Vehicles: drivers see their assigned vehicle
CREATE POLICY "vehicles_select_driver" ON public.vehicles
  FOR SELECT TO authenticated
  USING (
    public.is_driver(auth.uid())
    AND id = public.driver_vehicle_id(auth.uid())
  );

-- Devices: drivers see device on their vehicle
CREATE POLICY "devices_select_driver" ON public.devices
  FOR SELECT TO authenticated
  USING (
    public.is_driver(auth.uid())
    AND vehicle_id = public.driver_vehicle_id(auth.uid())
  );

-- Link driver profile when signing up with matching email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  matched_driver_id UUID;
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));

  SELECT id INTO matched_driver_id
  FROM public.drivers
  WHERE user_id IS NULL
    AND email IS NOT NULL
    AND lower(trim(email)) = lower(trim(NEW.email))
  LIMIT 1;

  IF matched_driver_id IS NOT NULL THEN
    UPDATE public.drivers SET user_id = NEW.id WHERE id = matched_driver_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'driver');
  ELSIF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'operator');
  END IF;

  RETURN NEW;
END;
$$;
