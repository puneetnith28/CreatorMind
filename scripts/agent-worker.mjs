import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Support running from root or scripts/ folder
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Clean up environment variables in case they have quotes or spaces from copy-pasting
const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/['"]/g, '').trim();
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/['"]/g, '').trim();

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
        .functions.invoke('queue-youtube-analysis', { body: { ...payload, userId: task.user_id } });
      if (ytErr) throw ytErr;
      return ytData;
      
    case 'generate_opportunity':
      console.log(`[Worker] Executing generate_opportunity...`);
      const { data: oppData, error: oppErr } = await createClient(supabaseUrl, supabaseServiceKey, authConfig)
        .functions.invoke('generate-opportunity', { body: { ...payload, userId: task.user_id } });
      if (oppErr) throw oppErr;
      return oppData;
      
    case 'run_pipeline':
      console.log(`[Worker] Executing run_pipeline...`);
      const { data: pipeData, error: pipeErr } = await createClient(supabaseUrl, supabaseServiceKey, authConfig)
        .functions.invoke('run-pipeline', { body: { ...payload, userId: task.user_id } });
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

async function observeExperimentOutcomes() {
  console.log(`[Worker] Checking for mature experiments to evaluate...`);
  // Look for active experiments older than 24 hours
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const { data: experiments, error } = await supabase
    .from('experiments')
    .select('*')
    .eq('status', 'active')
    .lte('updated_at', twentyFourHoursAgo);
    
  if (error || !experiments || experiments.length === 0) {
    return;
  }

  const youtubeApiKey = process.env.YOUTUBE_API_KEY;
  if (!youtubeApiKey) {
    console.warn(`[Worker] Missing YOUTUBE_API_KEY. Cannot observe experiment outcomes.`);
    return;
  }

  for (const exp of experiments) {
    // If we don't have a video id tied to it, we can't observe it yet
    if (!exp.youtube_video_id) {
      continue;
    }

    try {
      console.log(`[Worker] Evaluating experiment ${exp.id} on YouTube Video ${exp.youtube_video_id}`);
      const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${exp.youtube_video_id}&key=${youtubeApiKey}`);
      const data = await res.json();
      
      if (data.items && data.items.length > 0) {
        const stats = data.items[0].statistics;
        const viewCount = parseInt(stats.viewCount, 10);
        
        // Simple logic for learning: if views > 1000, consider Variant A successful (winner = A)
        // In a real scenario, this compares baseline to current metrics.
        const baselineViews = exp.baseline_metric?.views || 0;
        const winner = viewCount > baselineViews + 500 ? 'A' : (viewCount > baselineViews ? 'inconclusive' : 'B');
        
        await supabase.from('experiments').update({
          status: 'completed',
          winner: winner,
          success_metric: { ...exp.success_metric, final_views: viewCount },
          updated_at: new Date().toISOString()
        }).eq('id', exp.id);
        
        console.log(`[Worker] Experiment ${exp.id} completed. Winner: ${winner}. Views: ${viewCount}`);

        // Phase 9 Step 4: The Learning Extractor
        if (winner === 'A' || winner === 'B') {
          const winningVariant = winner === 'A' ? exp.variant_a : exp.variant_b;
          const learningSummary = `Experiment concluded: The hypothesis "${exp.hypothesis}" proved successful. The winning approach is "${winningVariant}". Use this as a rule for future content.`;
          
          await supabase.from('agent_memory').insert({
            user_id: exp.user_id,
            video_id: exp.video_id,
            key: `experiment_learning_${exp.id}`,
            value: {
              learning: learningSummary,
              hypothesis: exp.hypothesis,
              winning_variant: winningVariant,
              baseline_views: baselineViews,
              final_views: viewCount
            },
            source: 'experiment',
            priority: 2 // High priority since it's scientifically proven
          });
          
          await supabase.from('growth_events').insert({
            user_id: exp.user_id,
            event_type: 'EXPERIMENT_WON',
            metadata: { experiment_id: exp.id, winner: winner, learning: learningSummary }
          });
          
          console.log(`[Worker] Extracted learning and saved to Creator Preferences.`);
        }
      }
    } catch (e) {
      console.error(`[Worker] Failed to evaluate experiment ${exp.id}:`, e);
    }
  }
}

async function observeCreatorGoals() {
  console.log(`[Worker] Polling for active creator goals...`);
  
  const { data: goals, error } = await supabase
    .from('creator_goals')
    .select('user_id')
    .eq('status', 'active');
    
  if (error || !goals || goals.length === 0) return;
  
  const uniqueUsers = [...new Set(goals.map(g => g.user_id))];
  
  for (const userId of uniqueUsers) {
    // Only spawn a generic opportunity if we haven't done so in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data: recentTasks, error: taskErr } = await supabase
      .from('agent_tasks')
      .select('id')
      .eq('user_id', userId)
      .eq('task_type', 'generate_opportunity')
      .gte('created_at', oneHourAgo);
      
    if (taskErr) continue;
    
    if (!recentTasks || recentTasks.length === 0) {
      console.log(`[Worker] Decision: Creator ${userId} has active goals but no recent opportunities. Spawning generate_opportunity task.`);
      
      await supabase.from('agent_tasks').insert({
        user_id: userId,
        task_type: 'generate_opportunity',
        payload: { context: "Autonomous periodic check" }
      });
      
      await supabase.from('growth_events').insert({
        user_id: userId,
        event_type: 'OPPORTUNITY_FOUND',
        metadata: { source: 'worker_periodic_polling' }
      });
    }
  }
}

import http from 'http';

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Agent Worker is running\n');
}).listen(PORT, () => {
  console.log(`[Worker] HTTP Server listening on port ${PORT} (for Render health checks)`);
});

async function runLoop() {
  console.log("🚀 Agent Worker Started");
  if (isDryRun) console.log("⚠️ Running in DRY RUN mode");
  
  try {
    await processPendingTasks();
    await observeCreatorGoals();
    await observeExperimentOutcomes();
  } catch (err) {
    console.error("[Worker] Error during initial loop pass:", err);
  }
  
  if (!runOnce) {
    setInterval(async () => {
      try {
        await processPendingTasks();
        await observeCreatorGoals();
        await observeExperimentOutcomes();
      } catch (err) {
        console.error("[Worker] Error during loop pass:", err);
      }
    }, POLLING_INTERVAL_MS);
  } else {
    console.log("Finished single pass.");
    process.exit(0);
  }
}

runLoop().catch(console.error);
