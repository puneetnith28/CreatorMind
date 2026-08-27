import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Support running from root or scripts/ folder
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
const POLLING_INTERVAL_MS = 10000;
const isDryRun = process.argv.includes('--dry-run');
const runOnce = process.argv.includes('--once');

async function processPendingTasks() {
  console.log(`[Worker] Polling for pending tasks...`);
  
  // 0. Recover stuck tasks (in_progress for > 5 minutes)
  const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await supabase
    .from('agent_tasks')
    .update({ status: 'pending' })
    .eq('status', 'in_progress')
    .lte('started_at', fiveMinsAgo);
    
  // 1. Fetch pending tasks that are scheduled to run now or in the past
  const { data: tasks, error } = await supabase
    .from('agent_tasks')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(5);

  if (error) {
    console.error("[Worker] Error fetching tasks:", error);
    return;
  }

  if (!tasks || tasks.length === 0) {
    return;
  }

  console.log(`[Worker] Found ${tasks.length} pending task(s).`);

  // 2. Process each task
  for (const task of tasks) {
    console.log(`[Worker] Claiming task ${task.id} [${task.task_type}]`);
    
    if (isDryRun) {
      console.log(`[Dry Run] Would process task: ${task.task_type} with payload:`, task.payload);
      continue;
    }

    // Attempt to lock task
    const { data: lockData, error: lockErr } = await supabase
      .from('agent_tasks')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', task.id)
      .eq('status', 'pending')
      .select('id')
      .single();
    
    if (lockErr || !lockData) {
      console.log(`[Worker] Task ${task.id} already claimed by another worker.`);
      continue;
    }

    try {
      // 3. Execute task logic based on task_type
      const result = await executeTask(task);
      
      // 4. Mark completed
      await supabase
        .from('agent_tasks')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', task.id);
        
      console.log(`[Worker] Task ${task.id} completed successfully.`);
      
      // 5. Decide follow-up actions (Level 3 Autonomy)
      await decideFollowUpAction(task, result);
      
    } catch (err) {
      console.error(`[Worker] Task ${task.id} [${task.task_type}] failed with payload:`, JSON.stringify(task.payload), err);
      
      // 5. Retry logic (Max 3 retries)
      const nextRetryCount = task.retry_count + 1;
      if (nextRetryCount <= 3) {
        // Exponential backoff (1m, 2m, 4m)
        const delayMinutes = Math.pow(2, nextRetryCount - 1);
        const nextScheduledTime = new Date(Date.now() + delayMinutes * 60 * 1000).toISOString();
        
        console.log(`[Worker] Retrying task ${task.id} in ${delayMinutes} minute(s) (Retry ${nextRetryCount}/3)`);
        
        await supabase
          .from('agent_tasks')
          .update({ 
            status: 'pending',
            scheduled_for: nextScheduledTime,
            error_message: err instanceof Error ? err.message : String(err),
            retry_count: nextRetryCount
          })
          .eq('id', task.id);
      } else {
        console.log(`[Worker] Task ${task.id} exceeded max retries. Marking as failed.`);
        await supabase
          .from('agent_tasks')
          .update({ 
            status: 'failed', 
            error_message: err instanceof Error ? err.message : String(err),
            retry_count: nextRetryCount
          })
          .eq('id', task.id);
      }
    }
  }
}

async function executeTask(task) {
  const { task_type, payload } = task;
  
  // We use the service role key to invoke functions, passing it as Authorization
  const authConfig = {
    global: { headers: { Authorization: `Bearer ${supabaseServiceKey}` } }
  };
  
  switch (task_type) {
    case 'analyze_youtube_video':
      console.log(`[Worker] Executing analyze_youtube_video...`);
      const { data: ytData, error: ytErr } = await createClient(supabaseUrl, supabaseServiceKey, authConfig)
        .functions.invoke('queue-youtube-analysis', { body: payload });
      if (ytErr) throw ytErr;
      return ytData;
      
    case 'generate_opportunity':
      console.log(`[Worker] Executing generate_opportunity...`);
      const { data: oppData, error: oppErr } = await createClient(supabaseUrl, supabaseServiceKey, authConfig)
        .functions.invoke('generate-opportunity', { body: payload });
      if (oppErr) throw oppErr;
      return oppData;
      
    case 'run_pipeline':
      console.log(`[Worker] Executing run_pipeline...`);
      const { data: pipeData, error: pipeErr } = await createClient(supabaseUrl, supabaseServiceKey, authConfig)
        .functions.invoke('run-pipeline', { body: payload });
      if (pipeErr) throw pipeErr;
      return pipeData;
      
    default:
      throw new Error(`Unknown task type: ${task_type}`);
  }
}

async function isDuplicateTask(userId, taskType, payloadKey, payloadValue) {
  // Check if a pending, in_progress, or completed task already exists with this specific payload value
  const { data, error } = await supabase
    .from('agent_tasks')
    .select('id')
    .eq('user_id', userId)
    .eq('task_type', taskType)
    .in('status', ['pending', 'in_progress', 'completed'])
    .contains('payload', { [payloadKey]: payloadValue })
    .limit(1);
    
  if (error) {
    console.error(`[Worker] Error checking for duplicate task:`, error);
    return false; // Fail open to allow task if error, or maybe fail closed?
  }
  
  return data && data.length > 0;
}

async function decideFollowUpAction(completedTask, resultData) {
  console.log(`[Worker] Evaluating follow-up actions for task ${completedTask.id}...`);

  try {
    if (completedTask.task_type === 'analyze_youtube_video') {
      if (resultData?.videoId) {
        // Prevent duplicate opportunity generation for the same video
        const isDupe = await isDuplicateTask(completedTask.user_id, 'generate_opportunity', 'videoId', resultData.videoId);
        if (isDupe) {
           console.log(`[Worker] Decision: Duplicate generate_opportunity for video ${resultData.videoId} detected. Skipping.`);
           return;
        }

        console.log(`[Worker] Decision: Spawn generate_opportunity for video ${resultData.videoId}`);
        await supabase.from('agent_tasks').insert({
          user_id: completedTask.user_id,
          task_type: 'generate_opportunity',
          payload: { videoId: resultData.videoId }
        });
      }
    } 
    else if (completedTask.task_type === 'generate_opportunity') {
      if (resultData?.opportunity?.score && resultData.opportunity.score > 80) {
        
        const isDupe = await isDuplicateTask(completedTask.user_id, 'run_pipeline', 'opportunityId', resultData.opportunity.id);
        if (isDupe) {
           console.log(`[Worker] Decision: Duplicate run_pipeline for opportunity ${resultData.opportunity.id} detected. Skipping.`);
           return;
        }

        console.log(`[Worker] Decision: High score opportunity (${resultData.opportunity.score})! Spawning run_pipeline...`);
        await supabase.from('agent_tasks').insert({
          user_id: completedTask.user_id,
          task_type: 'run_pipeline',
          payload: { 
            opportunityId: resultData.opportunity.id, 
            topic: resultData.opportunity.title 
          }
        });
      } else {
        console.log(`[Worker] Decision: Opportunity score too low or missing. No follow-up.`);
      }
    }
  } catch (err) {
    console.error(`[Worker] Error deciding follow-up action:`, err);
  }
}

async function runLoop() {
  console.log("🚀 Agent Worker Started");
  if (isDryRun) console.log("⚠️ Running in DRY RUN mode");
  
  await processPendingTasks();
  
  if (!runOnce) {
    setInterval(processPendingTasks, POLLING_INTERVAL_MS);
  } else {
    console.log("Finished single pass.");
    process.exit(0);
  }
}

runLoop().catch(console.error);
