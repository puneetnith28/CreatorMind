import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

function isServiceAuthorized(req: Request): boolean {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || req.headers.get("x-openclaw-token");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openclawToken = Deno.env.get("OPENCLAW_SERVICE_TOKEN");
  return Boolean(token && (token === serviceRole || (openclawToken && token === openclawToken)));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  if (!isServiceAuthorized(req)) return jsonResponse(401, { error: "Unauthorized" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse(500, { error: "Missing required environment variables" });

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: profiles, error: profilesError } = await adminClient
    .from("profiles")
    .select("user_id, youtube_channel_id")
    .not("youtube_channel_id", "is", null)
    .limit(200);

  if (profilesError) return jsonResponse(500, { error: profilesError.message });

  let queued = 0;
  for (const profile of profiles || []) {
    const { data: videos } = await adminClient
      .from("videos")
      .select("id, youtube_video_id")
      .eq("user_id", profile.user_id)
      .order("updated_at", { ascending: false })
      .limit(5);

    if (!videos || videos.length === 0) {
      await adminClient.from("analysis_jobs").insert({
        user_id: profile.user_id,
        video_id: null,
        source: "youtube",
        job_type: "video_performance",
        status: "pending",
        run_after: new Date().toISOString(),
        payload: { youtube_channel_id: profile.youtube_channel_id, queued_by: "hourly" },
      });
      queued += 1;
      continue;
    }

    for (const video of videos) {
      const { data: existing } = await adminClient
        .from("analysis_jobs")
        .select("id")
        .eq("user_id", profile.user_id)
        .eq("video_id", video.id)
        .eq("job_type", "video_performance")
        .in("status", ["pending", "processing"])
        .limit(1)
        .maybeSingle();

      if (existing?.id) continue;

      await adminClient.from("analysis_jobs").insert({
        user_id: profile.user_id,
        video_id: video.id,
        source: "youtube",
        job_type: "video_performance",
        status: "pending",
        run_after: new Date().toISOString(),
        payload: { youtube_channel_id: profile.youtube_channel_id, youtube_video_id: video.youtube_video_id, queued_by: "hourly" },
      });
      queued += 1;
    }
  }

  return jsonResponse(200, { queued });
});
