import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

function isAuthorized(req: Request): boolean {
  const token = req.headers.get("x-openclaw-token") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = Deno.env.get("OPENCLAW_SERVICE_TOKEN");
  return Boolean(expected && token && token === expected);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") return jsonResponse(405, { error: "Method not allowed" });
  if (!isAuthorized(req)) return jsonResponse(401, { error: "Unauthorized" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse(500, { error: "Missing required environment variables" });

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit") ?? "5");
  const limit = Math.min(Math.max(limitParam, 1), 20);
  const workerId = req.headers.get("x-worker-id") ?? "openclaw-worker";

  const { data: jobs, error: jobsError } = await adminClient
    .from("analysis_jobs")
    .select("id, user_id, video_id, source, payload, status, created_at, job_type, run_after, attempt_count, last_error")
    .eq("status", "pending")
    .lte("run_after", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);

  if (jobsError) return jsonResponse(500, { error: jobsError.message });

  if (!jobs || jobs.length === 0) return jsonResponse(200, { jobs: [] });

  const ids = jobs.map((job) => job.id);
  await adminClient
    .from("analysis_jobs")
    .update({
      status: "processing",
      worker_id: workerId,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);

  return jsonResponse(200, {
    jobs: jobs.map((job) => ({ ...job, status: "processing", worker_id: workerId })),
  });
});
