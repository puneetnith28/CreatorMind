CREATE TABLE IF NOT EXISTS public.growth_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- e.g., 'CREATOR_REJECTED', 'CREATOR_APPROVED'
    artifact_id UUID REFERENCES public.artifacts(id) ON DELETE CASCADE,
    run_id UUID REFERENCES public.runs(id) ON DELETE CASCADE,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.growth_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own growth events" ON public.growth_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own growth events" ON public.growth_events FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_growth_events_user_created ON public.growth_events(user_id, created_at DESC);
