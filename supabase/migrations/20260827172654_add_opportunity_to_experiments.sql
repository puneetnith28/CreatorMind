ALTER TABLE public.experiments 
ADD COLUMN opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE CASCADE;
