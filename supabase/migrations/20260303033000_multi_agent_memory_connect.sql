ALTER TABLE public.artifacts
  ADD COLUMN IF NOT EXISTS agent_name TEXT,
  ADD COLUMN IF NOT EXISTS agent_version TEXT;

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS agent_metrics JSONB;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id TEXT;

CREATE TABLE IF NOT EXISTS public.agent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID REFERENCES public.videos(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL,
  source TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_memory' AND policyname = 'Users can view own memory'
  ) THEN
    CREATE POLICY "Users can view own memory" ON public.agent_memory FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_memory' AND policyname = 'Users can insert own memory'
  ) THEN
    CREATE POLICY "Users can insert own memory" ON public.agent_memory FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_memory' AND policyname = 'Users can update own memory'
  ) THEN
    CREATE POLICY "Users can update own memory" ON public.agent_memory FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agent_memory' AND policyname = 'Users can delete own memory'
  ) THEN
    CREATE POLICY "Users can delete own memory" ON public.agent_memory FOR DELETE USING (auth.uid() = user_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_agent_memory_user_video_key ON public.agent_memory(user_id, video_id, key);

CREATE TABLE IF NOT EXISTS public.run_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL,
  free_text TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.run_feedback ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'run_feedback' AND policyname = 'Users can view own feedback'
  ) THEN
    CREATE POLICY "Users can view own feedback" ON public.run_feedback FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'run_feedback' AND policyname = 'Users can insert own feedback'
  ) THEN
    CREATE POLICY "Users can insert own feedback" ON public.run_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'run_feedback' AND policyname = 'Users can update own feedback'
  ) THEN
    CREATE POLICY "Users can update own feedback" ON public.run_feedback FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'run_feedback' AND policyname = 'Users can delete own feedback'
  ) THEN
    CREATE POLICY "Users can delete own feedback" ON public.run_feedback FOR DELETE USING (auth.uid() = user_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_run_feedback_user_video_created ON public.run_feedback(user_id, video_id, created_at DESC);
