import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return jsonResponse(500, { error: "Missing required environment variables" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse(401, { error: "Missing authorization header" });

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return jsonResponse(401, { error: "Unauthorized" });

  const body = await req.json().catch(() => null) as {
    videoId?: string;
    youtubeChannelId?: string;
    youtubeVideoId?: string;
  } | null;

  const videoId = body?.videoId?.trim() || null;
  const youtubeChannelId = body?.youtubeChannelId?.trim() || null;
  const youtubeVideoId = body?.youtubeVideoId?.trim() || null;

  if (videoId) {
    const { data: video, error: videoError } = await userClient
      .from("videos")
      .select("id")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single();

    if (videoError || !video) return jsonResponse(404, { error: "Video not found" });
  }

  if (youtubeChannelId) {
    const { error: profileError } = await adminClient
      .from("profiles")
      .update({
        youtube_channel_id: youtubeChannelId,
        youtube_connected_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);

    if (profileError) return jsonResponse(500, { error: profileError.message });
  }

  const payload = {
    youtube_channel_id: youtubeChannelId,
    youtube_video_id: youtubeVideoId,
    queued_at: new Date().toISOString(),
  };

  const { data: job, error: jobError } = await adminClient
    .from("analysis_jobs")
    .insert({
      user_id: user.id,
      video_id: videoId,
      source: "youtube",
      job_type: "video_performance",
      status: "pending",
      run_after: new Date().toISOString(),
      payload,
    })
    .select("id, status, source, created_at")
    .single();

  if (jobError || !job) return jsonResponse(500, { error: jobError?.message ?? "Failed to queue job" });

  return jsonResponse(200, { job });
});
