-- Offline cycle work queue with realtime multi-user updates.
CREATE TABLE IF NOT EXISTS public.offline_cycles (
  cycle_number text PRIMARY KEY,
  status text NOT NULL,
  sort_order integer NOT NULL UNIQUE,
  completed boolean NOT NULL DEFAULT false,
  completed_by text,
  completed_at timestamptz,
  issue text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.offline_cycles ADD COLUMN IF NOT EXISTS issue text;

ALTER TABLE public.offline_cycles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view offline cycles" ON public.offline_cycles;
CREATE POLICY "Anyone can view offline cycles"
ON public.offline_cycles FOR SELECT TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Anyone can update offline cycles" ON public.offline_cycles;
CREATE POLICY "Anyone can update offline cycles"
ON public.offline_cycles FOR UPDATE TO anon, authenticated
USING (true)
WITH CHECK (true);

INSERT INTO public.offline_cycles (cycle_number, status, sort_order) VALUES
  ('CYC-98', 'OFFLINE', 1),
  ('CYC-96', 'CONTROLLER NOT UPDATED', 2),
  ('CYC-85', 'CONTROLLER NOT UPDATED', 3),
  ('CYC-84', 'OFFLINE', 4),
  ('CYC-79', 'OFFLINE', 5),
  ('CYC-77', 'CONTROLLER NOT UPDATED', 6),
  ('CYC-73', 'OFFLINE', 7),
  ('CYC-71', 'OFFLINE', 8),
  ('CYC-70', 'OFFLINE', 9),
  ('CYC-66', 'OFFLINE', 10),
  ('CYC-61', 'OFFLINE', 11),
  ('CYC-60', 'OFFLINE', 12),
  ('CYC-56', 'OFFLINE', 13),
  ('CYC-250', 'OFFLINE', 14),
  ('CYC-247', 'OFFLINE', 15),
  ('CYC-238', 'OFFLINE', 16),
  ('CYC-236', 'OFFLINE', 17),
  ('CYC-228', 'OFFLINE', 18),
  ('CYC-224', 'OFFLINE', 19),
  ('CYC-202', 'OFFLINE', 20),
  ('CYC-201', 'OFFLINE', 21),
  ('CYC-184', 'OFFLINE', 22),
  ('CYC-179', 'OFFLINE', 23),
  ('CYC-176', 'OFFLINE', 24),
  ('CYC-175', 'OFFLINE', 25),
  ('CYC-170', 'OFFLINE', 26),
  ('CYC-164', 'OFFLINE', 27),
  ('CYC-161', 'OFFLINE', 28),
  ('CYC-156', 'OFFLINE', 29),
  ('CYC-143', 'OFFLINE', 30),
  ('CYC-139', 'OFFLINE', 31),
  ('CYC-129', 'OFFLINE', 32),
  ('CYC-128', 'OFFLINE', 33),
  ('CYC-127', 'OFFLINE', 34),
  ('CYC-117', 'OFFLINE', 35),
  ('CYC-107', 'OFFLINE', 36),
  ('CYC-104', 'OFFLINE', 37)
ON CONFLICT (cycle_number) DO UPDATE SET
  status = EXCLUDED.status,
  sort_order = EXCLUDED.sort_order;

-- Supabase Realtime only needs this once. The duplicate-object guard makes
-- the complete script safe to run again.
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.offline_cycles;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
