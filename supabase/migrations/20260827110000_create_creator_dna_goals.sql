-- Create creator_dna table
CREATE TABLE IF NOT EXISTS public.creator_dna (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    niche TEXT,
    target_audience TEXT,
    tone TEXT,
    preferred_formats TEXT[],
    avoid_topics TEXT[],
    primary_platform TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id) -- A creator should ideally have one main DNA profile, or we can remove unique if multiple profiles are allowed
);

-- Enable RLS
ALTER TABLE public.creator_dna ENABLE ROW LEVEL SECURITY;

-- RLS Policies for creator_dna
DROP POLICY IF EXISTS "Users can view own DNA" ON public.creator_dna;
CREATE POLICY "Users can view own DNA" ON public.creator_dna FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own DNA" ON public.creator_dna;
CREATE POLICY "Users can insert own DNA" ON public.creator_dna FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own DNA" ON public.creator_dna;
CREATE POLICY "Users can update own DNA" ON public.creator_dna FOR UPDATE USING (auth.uid() = user_id);

-- Create creator_goals table
CREATE TABLE IF NOT EXISTS public.creator_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    goal_type TEXT NOT NULL,
    target_metric TEXT NOT NULL,
    current_value NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'achieved', 'abandoned')),
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.creator_goals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for creator_goals
DROP POLICY IF EXISTS "Users can view own goals" ON public.creator_goals;
CREATE POLICY "Users can view own goals" ON public.creator_goals FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own goals" ON public.creator_goals;
CREATE POLICY "Users can insert own goals" ON public.creator_goals FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own goals" ON public.creator_goals;
CREATE POLICY "Users can update own goals" ON public.creator_goals FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own goals" ON public.creator_goals;
CREATE POLICY "Users can delete own goals" ON public.creator_goals FOR DELETE USING (auth.uid() = user_id);
