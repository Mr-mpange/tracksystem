-- Fix drivers visibility + manager write access

-- Ensure invite column exists
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;

-- sms_logs (if earlier migration was skipped)
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

ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sms_logs_select_manager" ON public.sms_logs;
CREATE POLICY "sms_logs_select_manager" ON public.sms_logs
  FOR SELECT TO authenticated
  USING (public.can_manage_fleet(auth.uid()));

DROP POLICY IF EXISTS "sms_logs_select_own_driver" ON public.sms_logs;
CREATE POLICY "sms_logs_select_own_driver" ON public.sms_logs
  FOR SELECT TO authenticated
  USING (driver_id IN (SELECT id FROM public.drivers WHERE user_id = auth.uid()));

GRANT SELECT ON public.sms_logs TO authenticated;

-- Explicit manager policies (avoid FOR ALL edge cases)
DROP POLICY IF EXISTS "drivers_insert_manager" ON public.drivers;
CREATE POLICY "drivers_insert_manager" ON public.drivers
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_fleet(auth.uid()));

DROP POLICY IF EXISTS "drivers_update_manager" ON public.drivers;
CREATE POLICY "drivers_update_manager" ON public.drivers
  FOR UPDATE TO authenticated
  USING (public.can_manage_fleet(auth.uid()))
  WITH CHECK (public.can_manage_fleet(auth.uid()));

DROP POLICY IF EXISTS "drivers_delete_manager" ON public.drivers;
CREATE POLICY "drivers_delete_manager" ON public.drivers
  FOR DELETE TO authenticated
  USING (public.can_manage_fleet(auth.uid()));

-- Super admins always count as fleet managers
CREATE OR REPLACE FUNCTION public.can_manage_fleet(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('super_admin', 'fleet_manager')
  )
$$;
