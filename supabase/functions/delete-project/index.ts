import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(500, { error: "Missing required environment variables" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "Missing authorization header" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  const body = await req.json().catch(() => null) as { videoId?: string } | null;
  const videoId = body?.videoId?.trim();

  if (!videoId) {
    return jsonResponse(400, { error: "videoId is required" });
  }

  const { data: video, error: videoError } = await userClient
    .from("videos")
    .select("id")
    .eq("id", videoId)
    .eq("user_id", user.id)
    .single();

  if (videoError || !video) {
    return jsonResponse(404, { error: "Project not found" });
  }

  try {
    const { data: runRows, error: runReadError } = await adminClient
      .from("runs")
      .select("id")
      .eq("video_id", videoId)
      .eq("user_id", user.id);

    if (runReadError) {
      return jsonResponse(500, { error: `Failed to load runs: ${runReadError.message}` });
    }

    const runIds = (runRows || []).map((row) => row.id);

    if (runIds.length > 0) {
      const { error: artifactDeleteError } = await adminClient
        .from("artifacts")
        .delete()
        .in("run_id", runIds)
        .eq("user_id", user.id);

      if (artifactDeleteError) {
        return jsonResponse(500, { error: `Failed to delete artifacts: ${artifactDeleteError.message}` });
      }
    }

    const { error: feedbackDeleteError } = await adminClient
      .from("run_feedback")
      .delete()
      .eq("video_id", videoId)
      .eq("user_id", user.id);
    if (feedbackDeleteError) {
      return jsonResponse(500, { error: `Failed to delete feedback: ${feedbackDeleteError.message}` });
    }

    const { error: jobsDeleteError } = await adminClient
      .from("analysis_jobs")
      .delete()
      .eq("video_id", videoId)
      .eq("user_id", user.id);
    if (jobsDeleteError) {
      return jsonResponse(500, { error: `Failed to delete analysis jobs: ${jobsDeleteError.message}` });
    }

    const { error: insightsDeleteError } = await adminClient
      .from("external_insights")
      .delete()
      .eq("video_id", videoId)
      .eq("user_id", user.id);
    if (insightsDeleteError) {
      return jsonResponse(500, { error: `Failed to delete external insights: ${insightsDeleteError.message}` });
    }

    const { error: memoryDeleteError } = await adminClient
      .from("agent_memory")
      .delete()
      .eq("video_id", videoId)
      .eq("user_id", user.id);
    if (memoryDeleteError) {
      return jsonResponse(500, { error: `Failed to delete video memory: ${memoryDeleteError.message}` });
    }

    const { error: runsDeleteError } = await adminClient
      .from("runs")
      .delete()
      .eq("video_id", videoId)
      .eq("user_id", user.id);
    if (runsDeleteError) {
      return jsonResponse(500, { error: `Failed to delete runs: ${runsDeleteError.message}` });
    }

    const { error: videoDeleteError } = await adminClient
      .from("videos")
      .delete()
      .eq("id", videoId)
      .eq("user_id", user.id);

    if (videoDeleteError) {
      return jsonResponse(500, { error: `Failed to delete video: ${videoDeleteError.message}` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected delete-project error";
    return jsonResponse(500, { error: message });
  }

  return jsonResponse(200, { success: true, videoId });
});
