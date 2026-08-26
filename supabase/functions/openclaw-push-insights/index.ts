import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type InsightInput = {
  key: string;
  value: string;
  priority?: number;
  agentName?: string | null;
  appliesGlobally?: boolean;
  score?: number;
};

function isAuthorized(req: Request): boolean {
  const token = req.headers.get("x-openclaw-token") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const expected = Deno.env.get("OPENCLAW_SERVICE_TOKEN");
  return Boolean(expected && token && token === expected);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  if (!isAuthorized(req)) return jsonResponse(401, { error: "Unauthorized" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse(500, { error: "Missing required environment variables" });

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const body = await req.json().catch(() => null) as {
    jobId?: string;
    userId?: string;
    videoId?: string;
    source?: string;
    insightType?: string;
    rawSummary?: string;
    insights?: InsightInput[];
    status?: "completed" | "failed";
    errorMessage?: string;
    score?: number;
  } | null;

  const userId = body?.userId?.trim();
  const source = body?.source?.trim() || "openclaw";
  const insightType = body?.insightType?.trim() || "youtube_performance";
  const videoId = body?.videoId?.trim() || null;
  const jobId = body?.jobId?.trim();
  const rawSummary = body?.rawSummary?.trim() || null;
  const status = body?.status || "completed";
  const insights = Array.isArray(body?.insights) ? body!.insights : [];

  if (!userId) return jsonResponse(400, { error: "userId is required" });

  const normalizedInsights = insights
    .filter((insight) => insight?.key && insight?.value)
    .map((insight) => ({
      key: insight.key.trim(),
      value: insight.value.trim(),
      priority: Math.max(1, Number(insight.priority ?? 1)),
      score: Number(insight.score ?? body?.score ?? 0),
      agent_name: insight.agentName ?? null,
      applies_globally: Boolean(insight.appliesGlobally),
    }));

  if (normalizedInsights.length > 0) {
    const memoryRows = normalizedInsights.map((insight) => ({
      user_id: userId,
      video_id: insight.applies_globally ? null : videoId,
      key: insight.key,
      value: {
        text: insight.value,
        source,
        ingested_at: new Date().toISOString(),
      },
      source: "external_insight",
      agent_name: insight.agent_name,
      priority: insight.priority,
      updated_at: new Date().toISOString(),
    }));

    const { error: memoryError } = await adminClient.from("agent_memory").insert(memoryRows);
    if (memoryError) return jsonResponse(500, { error: memoryError.message });
  }

  const { data: insertedInsight, error: insightError } = await adminClient.from("external_insights").insert({
    user_id: userId,
    video_id: videoId,
    source,
    insight_type: insightType,
    score: Number(body?.score ?? normalizedInsights[0]?.score ?? 0) || null,
    insights: normalizedInsights,
    raw_summary: rawSummary,
    applied_to_memory: normalizedInsights.length > 0,
  }).select("id").maybeSingle();

  if (insightError) return jsonResponse(500, { error: insightError.message });

  if (normalizedInsights.length > 0) {
    await adminClient.from("agent_modification_log").insert({
      user_id: userId,
      video_id: videoId,
      source: "external_insight",
      change_summary: `Applied ${normalizedInsights.length} external insight(s) from ${source}`,
      metadata: {
        insight_type: insightType,
        external_insight_id: insertedInsight?.id ?? null,
      },
    });
  }

  if (jobId) {
    if (status === "failed") {
      const { data: job } = await adminClient
        .from("analysis_jobs")
        .select("attempt_count")
        .eq("id", jobId)
        .maybeSingle();

      const nextAttempt = Number(job?.attempt_count ?? 0) + 1;
      const deadLetter = nextAttempt >= 5;
      const backoffMinutes = Math.min(60, Math.max(5, nextAttempt * 5));
      const runAfter = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();

      await adminClient
        .from("analysis_jobs")
        .update({
          status: deadLetter ? "dead_letter" : "pending",
          attempt_count: nextAttempt,
          last_error: body?.errorMessage ?? "Worker marked as failed",
          run_after: runAfter,
          payload: {
            processed_at: new Date().toISOString(),
            insight_count: normalizedInsights.length,
            error: body?.errorMessage ?? null,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    } else {
      await adminClient
        .from("analysis_jobs")
        .update({
          status: "completed",
          last_error: null,
          payload: {
            processed_at: new Date().toISOString(),
            insight_count: normalizedInsights.length,
            error: null,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }
  }

  return jsonResponse(200, { success: true, insightCount: normalizedInsights.length });
});
