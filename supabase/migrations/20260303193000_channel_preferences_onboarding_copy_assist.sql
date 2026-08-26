ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS channel_summary_prompt TEXT,
  ADD COLUMN IF NOT EXISTS channel_style_goal TEXT;

CREATE TABLE IF NOT EXISTS public.channel_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tone TEXT NOT NULL DEFAULT 'clear_confident',
  pacing TEXT NOT NULL DEFAULT 'fast',
  hook_style TEXT NOT NULL DEFAULT 'curiosity_with_value',
  script_length_preference TEXT NOT NULL DEFAULT 'short_form',
  banned_phrases TEXT[] NOT NULL DEFAULT '{}'::text[],
  cta_style TEXT,
  notes TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_preferences_user_unique ON public.channel_preferences(user_id);

CREATE TABLE IF NOT EXISTS public.channel_inspirations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  youtube_url TEXT NOT NULL,
  label TEXT,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_modification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID REFERENCES public.videos(id) ON DELETE SET NULL,
  run_id UUID REFERENCES public.runs(id) ON DELETE SET NULL,
  agent_name TEXT,
  source TEXT NOT NULL,
  change_summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.channel_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_inspirations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_modification_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'channel_preferences' AND policyname = 'Users can view own channel preferences'
  ) THEN
    CREATE POLICY "Users can view own channel preferences" ON public.channel_preferences FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'channel_preferences' AND policyname = 'Users can insert own channel preferences'
  ) THEN
    CREATE POLICY "Users can insert own channel preferences" ON public.channel_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'channel_preferences' AND policyname = 'Users can update own channel preferences'
  ) THEN
    CREATE POLICY "Users can update own channel preferences" ON public.channel_preferences FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'channel_preferences' AND policyname = 'Users can delete own channel preferences'
  ) THEN
    CREATE POLICY "Users can delete own channel preferences" ON public.channel_preferences FOR DELETE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'channel_inspirations' AND policyname = 'Users can view own channel inspirations'
  ) THEN
    CREATE POLICY "Users can view own channel inspirations" ON public.channel_inspirations FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'channel_inspirations' AND policyname = 'Users can insert own channel inspirations'
  ) THEN
    CREATE POLICY "Users can insert own channel inspirations" ON public.channel_inspirations FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'channel_inspirations' AND policyname = 'Users can update own channel inspirations'
  ) THEN
    CREATE POLICY "Users can update own channel inspirations" ON public.channel_inspirations FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'channel_inspirations' AND policyname = 'Users can delete own channel inspirations'
  ) THEN
    CREATE POLICY "Users can delete own channel inspirations" ON public.channel_inspirations FOR DELETE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_modification_log' AND policyname = 'Users can view own modification log'
  ) THEN
    CREATE POLICY "Users can view own modification log" ON public.agent_modification_log FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_modification_log' AND policyname = 'Users can insert own modification log'
  ) THEN
    CREATE POLICY "Users can insert own modification log" ON public.agent_modification_log FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_modification_log' AND policyname = 'Users can update own modification log'
  ) THEN
    CREATE POLICY "Users can update own modification log" ON public.agent_modification_log FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_modification_log' AND policyname = 'Users can delete own modification log'
  ) THEN
    CREATE POLICY "Users can delete own modification log" ON public.agent_modification_log FOR DELETE USING (auth.uid() = user_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_channel_inspirations_user_created ON public.channel_inspirations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_modification_log_user_created ON public.agent_modification_log(user_id, created_at DESC);

CREATE TRIGGER update_channel_preferences_updated_at
BEFORE UPDATE ON public.channel_preferences
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
