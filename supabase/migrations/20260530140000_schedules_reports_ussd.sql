-- Driver schedules, USSD reports, bulk SMS support

CREATE TYPE public.schedule_status AS ENUM ('scheduled', 'completed', 'cancelled');
CREATE TYPE public.report_status AS ENUM ('open', 'reviewed', 'resolved');
CREATE TYPE public.report_source AS ENUM ('ussd', 'app');

CREATE TABLE IF NOT EXISTS public.driver_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status public.schedule_status NOT NULL DEFAULT 'scheduled',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_schedules_driver_at
  ON public.driver_schedules(driver_id, scheduled_at ASC);

CREATE TABLE IF NOT EXISTS public.driver_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  message TEXT NOT NULL,
  status public.report_status NOT NULL DEFAULT 'open',
  source public.report_source NOT NULL DEFAULT 'ussd',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_reports_status_created
  ON public.driver_reports(status, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_schedules TO authenticated;
GRANT SELECT, UPDATE ON public.driver_reports TO authenticated;
GRANT ALL ON public.driver_schedules TO service_role;
GRANT ALL ON public.driver_reports TO service_role;

ALTER TABLE public.driver_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_reports ENABLE ROW LEVEL SECURITY;

-- Schedules: admins manage all; drivers read own
CREATE POLICY "schedules_select_auth" ON public.driver_schedules
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "schedules_write_manager" ON public.driver_schedules
  FOR ALL TO authenticated
  USING (public.can_manage_fleet(auth.uid()))
  WITH CHECK (public.can_manage_fleet(auth.uid()));

CREATE POLICY "schedules_select_driver" ON public.driver_schedules
  FOR SELECT TO authenticated
  USING (
    public.is_driver(auth.uid())
    AND driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );

-- Reports: admins all; drivers read own
CREATE POLICY "reports_select_manager" ON public.driver_reports
  FOR SELECT TO authenticated USING (public.can_manage_fleet(auth.uid()));

CREATE POLICY "reports_update_manager" ON public.driver_reports
  FOR UPDATE TO authenticated
  USING (public.can_manage_fleet(auth.uid()))
  WITH CHECK (public.can_manage_fleet(auth.uid()));

CREATE POLICY "reports_select_driver" ON public.driver_reports
  FOR SELECT TO authenticated
  USING (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid())
  );

CREATE TRIGGER trg_driver_schedules_touch
  BEFORE UPDATE ON public.driver_schedules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_driver_reports_touch
  BEFORE UPDATE ON public.driver_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.driver_reports;
