ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS youtube_access_token_enc TEXT,
  ADD COLUMN IF NOT EXISTS youtube_refresh_token_enc TEXT,
  ADD COLUMN IF NOT EXISTS youtube_token_expires_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS youtube_video_id TEXT,
  ADD COLUMN IF NOT EXISTS youtube_published_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS latest_youtube_sync_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE public.artifacts
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.analysis_jobs
  ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'video_performance',
  ADD COLUMN IF NOT EXISTS run_after TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

ALTER TABLE public.external_insights
  ADD COLUMN IF NOT EXISTS insight_type TEXT NOT NULL DEFAULT 'youtube_performance',
  ADD COLUMN IF NOT EXISTS score NUMERIC,
  ADD COLUMN IF NOT EXISTS applied_to_memory BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.approved_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.runs(id) ON DELETE CASCADE,
  json_storage_path TEXT NOT NULL,
  pdf_storage_path TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.approved_outputs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'approved_outputs' AND policyname = 'Users can view own approved outputs'
  ) THEN
    CREATE POLICY "Users can view own approved outputs" ON public.approved_outputs FOR SELECT USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'approved_outputs' AND policyname = 'Users can insert own approved outputs'
  ) THEN
    CREATE POLICY "Users can insert own approved outputs" ON public.approved_outputs FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'approved_outputs' AND policyname = 'Users can update own approved outputs'
  ) THEN
    CREATE POLICY "Users can update own approved outputs" ON public.approved_outputs FOR UPDATE USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'approved_outputs' AND policyname = 'Users can delete own approved outputs'
  ) THEN
    CREATE POLICY "Users can delete own approved outputs" ON public.approved_outputs FOR DELETE USING (auth.uid() = user_id);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_approved_outputs_run_version ON public.approved_outputs(run_id, version);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status_run_after_created ON public.analysis_jobs(status, run_after, created_at);
CREATE INDEX IF NOT EXISTS idx_external_insights_user_type_created ON public.external_insights(user_id, insight_type, created_at DESC);

INSERT INTO storage.buckets (id, name, public)
VALUES ('thumbnails', 'thumbnails', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('approved-outputs', 'approved-outputs', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can view own approved outputs objects'
  ) THEN
    CREATE POLICY "Users can view own approved outputs objects"
      ON storage.objects
      FOR SELECT
      USING (bucket_id = 'approved-outputs' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END
$$;

-- Cron scheduling is intentionally configured outside migration (dashboard/sql editor)
-- to avoid extension-specific syntax/availability issues across environments.
