
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('super_admin', 'fleet_manager', 'operator');
CREATE TYPE public.fuel_type AS ENUM ('gasoline', 'diesel');
CREATE TYPE public.vehicle_status AS ENUM ('active', 'inactive', 'maintenance');
CREATE TYPE public.device_status AS ENUM ('online', 'offline', 'warning');
CREATE TYPE public.alert_type AS ENUM ('high_temperature', 'device_offline', 'high_emission');
CREATE TYPE public.alert_severity AS ENUM ('info', 'warning', 'critical');
CREATE TYPE public.alert_status AS ENUM ('open', 'acknowledged', 'resolved');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_all_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own"     ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own"     ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.can_manage_fleet(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('super_admin','fleet_manager'))
$$;

-- ============ NEW USER TRIGGER ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)));
  -- First user becomes super_admin; others operator
  IF NOT EXISTS (SELECT 1 FROM public.user_roles LIMIT 1) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'operator');
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ VEHICLES ============
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number TEXT NOT NULL UNIQUE,
  model TEXT NOT NULL,
  fuel_type public.fuel_type NOT NULL DEFAULT 'gasoline',
  status public.vehicle_status NOT NULL DEFAULT 'active',
  driver_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vehicles_select_auth" ON public.vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "vehicles_write_manager" ON public.vehicles FOR ALL TO authenticated
  USING (public.can_manage_fleet(auth.uid())) WITH CHECK (public.can_manage_fleet(auth.uid()));

-- ============ DRIVERS ============
CREATE TABLE public.drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  license_number TEXT,
  phone TEXT,
  email TEXT,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drivers TO authenticated;
GRANT ALL ON public.drivers TO service_role;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drivers_select_auth" ON public.drivers FOR SELECT TO authenticated USING (true);
CREATE POLICY "drivers_write_manager" ON public.drivers FOR ALL TO authenticated
  USING (public.can_manage_fleet(auth.uid())) WITH CHECK (public.can_manage_fleet(auth.uid()));

ALTER TABLE public.vehicles ADD CONSTRAINT vehicles_driver_fk
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE SET NULL;

-- ============ DEVICES ============
CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number TEXT NOT NULL UNIQUE,
  status public.device_status NOT NULL DEFAULT 'offline',
  last_seen TIMESTAMPTZ,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT ALL ON public.devices TO service_role;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devices_select_auth" ON public.devices FOR SELECT TO authenticated USING (true);
CREATE POLICY "devices_write_manager" ON public.devices FOR ALL TO authenticated
  USING (public.can_manage_fleet(auth.uid())) WITH CHECK (public.can_manage_fleet(auth.uid()));

-- ============ SENSOR LOGS ============
CREATE TABLE public.sensor_logs (
  id BIGSERIAL PRIMARY KEY,
  device_id UUID REFERENCES public.devices(id) ON DELETE CASCADE,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
  temperature NUMERIC(6,2),
  latitude NUMERIC(10,6),
  longitude NUMERIC(10,6),
  fuel_used NUMERIC(8,3),
  speed NUMERIC(6,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sensor_logs_device_created ON public.sensor_logs(device_id, created_at DESC);
CREATE INDEX idx_sensor_logs_vehicle_created ON public.sensor_logs(vehicle_id, created_at DESC);
GRANT SELECT ON public.sensor_logs TO authenticated;
GRANT ALL ON public.sensor_logs TO service_role;
ALTER TABLE public.sensor_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sensor_logs_select_auth" ON public.sensor_logs FOR SELECT TO authenticated USING (true);

-- ============ CARBON LOGS ============
CREATE TABLE public.carbon_logs (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
  fuel_used NUMERIC(8,3) NOT NULL,
  emission_kg NUMERIC(10,3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_carbon_logs_vehicle_created ON public.carbon_logs(vehicle_id, created_at DESC);
CREATE INDEX idx_carbon_logs_created ON public.carbon_logs(created_at DESC);
GRANT SELECT ON public.carbon_logs TO authenticated;
GRANT ALL ON public.carbon_logs TO service_role;
ALTER TABLE public.carbon_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "carbon_logs_select_auth" ON public.carbon_logs FOR SELECT TO authenticated USING (true);

-- ============ ALERTS ============
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE CASCADE,
  device_id UUID REFERENCES public.devices(id) ON DELETE SET NULL,
  type public.alert_type NOT NULL,
  severity public.alert_severity NOT NULL DEFAULT 'warning',
  message TEXT NOT NULL,
  status public.alert_status NOT NULL DEFAULT 'open',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerts_status_created ON public.alerts(status, created_at DESC);
GRANT SELECT, UPDATE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts_select_auth" ON public.alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "alerts_update_manager" ON public.alerts FOR UPDATE TO authenticated
  USING (public.can_manage_fleet(auth.uid())) WITH CHECK (public.can_manage_fleet(auth.uid()));

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  alert_id UUID REFERENCES public.alerts(id) ON DELETE SET NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_select_own" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());

-- ============ TIMESTAMP TRIGGER ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_vehicles_touch BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_drivers_touch  BEFORE UPDATE ON public.drivers  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_devices_touch  BEFORE UPDATE ON public.devices  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_alerts_touch   BEFORE UPDATE ON public.alerts   FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ REALTIME ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.sensor_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.devices;
