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
  const { data: inspirations, error } = await adminClient
    .from("channel_inspirations")
    .select("user_id, youtube_url")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return jsonResponse(500, { error: error.message });

  let queued = 0;
  for (const inspiration of inspirations || []) {
    await adminClient.from("analysis_jobs").insert({
      user_id: inspiration.user_id,
      video_id: null,
      source: "youtube_inspiration",
      job_type: "inspiration_refresh",
      status: "pending",
      run_after: new Date().toISOString(),
      payload: {
        youtube_url: inspiration.youtube_url,
        queued_by: "daily",
      },
    });
    queued += 1;
  }

  return jsonResponse(200, { queued });
});
