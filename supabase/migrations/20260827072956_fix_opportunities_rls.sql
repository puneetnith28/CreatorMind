-- Fix RLS policies for opportunities to correctly join through profiles to auth.uid()

DROP POLICY IF EXISTS "Users can view own opportunities" ON public.opportunities;
CREATE POLICY "Users can view own opportunities" ON public.opportunities FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = opportunities.user_id
    AND profiles.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can insert own opportunities" ON public.opportunities;
CREATE POLICY "Users can insert own opportunities" ON public.opportunities FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = opportunities.user_id
    AND profiles.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update own opportunities" ON public.opportunities;
CREATE POLICY "Users can update own opportunities" ON public.opportunities FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = opportunities.user_id
    AND profiles.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can delete own opportunities" ON public.opportunities;
CREATE POLICY "Users can delete own opportunities" ON public.opportunities FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = opportunities.user_id
    AND profiles.user_id = auth.uid()
  )
);
