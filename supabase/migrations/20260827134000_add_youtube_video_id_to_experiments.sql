-- Migration to add youtube_video_id to experiments table
ALTER TABLE public.experiments
ADD COLUMN IF NOT EXISTS youtube_video_id TEXT;
