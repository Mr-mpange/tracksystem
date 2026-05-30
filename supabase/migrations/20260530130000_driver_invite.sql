-- Driver invite tracking

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;
