-- Migration for agent_tasks table

CREATE TABLE IF NOT EXISTS public.agent_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    task_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    payload JSONB DEFAULT '{}'::jsonb,
    scheduled_for TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own agent_tasks"
    ON public.agent_tasks FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own agent_tasks"
    ON public.agent_tasks FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own agent_tasks"
    ON public.agent_tasks FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own agent_tasks"
    ON public.agent_tasks FOR DELETE
    USING (auth.uid() = user_id);

-- Create index for background worker queries
CREATE INDEX IF NOT EXISTS agent_tasks_status_scheduled_for_idx 
ON public.agent_tasks (status, scheduled_for);

CREATE INDEX IF NOT EXISTS agent_tasks_user_id_idx 
ON public.agent_tasks (user_id);
