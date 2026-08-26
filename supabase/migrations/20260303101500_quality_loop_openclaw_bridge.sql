ALTER TABLE public.run_feedback
  ADD COLUMN IF NOT EXISTS artifact_id UUID REFERENCES public.artifacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agent_name TEXT,
  ADD COLUMN IF NOT EXISTS applies_globally BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS feedback_weight INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.agent_memory
  ADD COLUMN IF NOT EXISTS agent_name TEXT,
  ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_applied_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.runs
  ADD COLUMN IF NOT EXISTS memory_applied JSONB,
  ADD COLUMN IF NOT EXISTS quality_delta JSONB,
  ADD COLUMN IF NOT EXISTS collector_export_status TEXT,
  ADD COLUMN IF NOT EXISTS collector_export_error TEXT;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS youtube_channel_id TEXT,
  ADD COLUMN IF NOT EXISTS youtube_connected_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS public.analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID REFERENCES public.videos(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  worker_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.external_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID REFERENCES public.videos(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  insights JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_summary TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_insights ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'analysis_jobs' AND policyname = 'Users can view own analysis jobs'
  ) THEN
    CREATE POLICY "Users can view own analysis jobs" ON public.analysis_jobs FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'analysis_jobs' AND policyname = 'Users can insert own analysis jobs'
  ) THEN
    CREATE POLICY "Users can insert own analysis jobs" ON public.analysis_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'analysis_jobs' AND policyname = 'Users can update own analysis jobs'
  ) THEN
    CREATE POLICY "Users can update own analysis jobs" ON public.analysis_jobs FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'external_insights' AND policyname = 'Users can view own external insights'
  ) THEN
    CREATE POLICY "Users can view own external insights" ON public.external_insights FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'external_insights' AND policyname = 'Users can insert own external insights'
  ) THEN
    CREATE POLICY "Users can insert own external insights" ON public.external_insights FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'external_insights' AND policyname = 'Users can update own external insights'
  ) THEN
    CREATE POLICY "Users can update own external insights" ON public.external_insights FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_run_feedback_run_artifact ON public.run_feedback(run_id, artifact_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_target ON public.agent_memory(user_id, agent_name, video_id, key);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status_created ON public.analysis_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_external_insights_user_created ON public.external_insights(user_id, created_at DESC);
