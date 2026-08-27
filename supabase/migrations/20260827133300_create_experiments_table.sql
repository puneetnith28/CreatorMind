-- Migration for experiments table

CREATE TABLE IF NOT EXISTS public.experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    video_id UUID REFERENCES public.videos(id) ON DELETE CASCADE,
    hypothesis TEXT NOT NULL,
    variant_a TEXT NOT NULL,
    variant_b TEXT NOT NULL,
    baseline_metric JSONB,
    success_metric JSONB,
    status TEXT NOT NULL DEFAULT 'proposed', -- 'proposed', 'active', 'completed', 'failed'
    winner TEXT, -- 'A', 'B', 'inconclusive', null
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own experiments"
    ON public.experiments FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own experiments"
    ON public.experiments FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own experiments"
    ON public.experiments FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own experiments"
    ON public.experiments FOR DELETE
    USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS experiments_user_id_idx ON public.experiments (user_id);
CREATE INDEX IF NOT EXISTS experiments_video_id_idx ON public.experiments (video_id);
CREATE INDEX IF NOT EXISTS experiments_status_idx ON public.experiments (status);
