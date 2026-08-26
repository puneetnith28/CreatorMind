import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

const VALID_REASON_CODES = ["too_long", "not_engaging", "wrong_tone", "poor_hook", "other"];

function inferMemoryKey(reasonCode: string, agentName: string | null): string {
  if (reasonCode === "too_long") return `${agentName ?? "global"}_length_preference`;
  if (reasonCode === "wrong_tone") return `${agentName ?? "global"}_tone_preference`;
  if (reasonCode === "poor_hook") return `${agentName ?? "global"}_hook_preference`;
  if (reasonCode === "not_engaging") return `${agentName ?? "global"}_engagement_preference`;
  return `${agentName ?? "global"}_general_feedback`;
}

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

  const body = await req.json().catch(() => null) as {
    runId?: string;
    artifactId?: string;
    reasonCode?: string;
    freeText?: string;
    appliesGlobally?: boolean;
  } | null;

  const runId = body?.runId?.trim();
  const artifactId = body?.artifactId?.trim() || null;
  const reasonCode = body?.reasonCode?.trim();
  const freeText = body?.freeText?.trim() || null;
  const appliesGlobally = Boolean(body?.appliesGlobally);

  if (!runId || !reasonCode) {
    return jsonResponse(400, { error: "runId and reasonCode are required" });
  }

  if (!VALID_REASON_CODES.includes(reasonCode)) {
    return jsonResponse(400, { error: "Invalid reasonCode" });
  }

  const { data: run, error: runError } = await userClient
    .from("runs")
    .select("id, video_id")
    .eq("id", runId)
    .eq("user_id", user.id)
    .single();

  if (runError || !run) {
    return jsonResponse(404, { error: "Run not found" });
  }

  let artifactAgentName: string | null = null;
  let normalizedArtifactId: string | null = null;

  if (artifactId) {
    const { data: artifact, error: artifactError } = await userClient
      .from("artifacts")
      .select("id, agent_name")
      .eq("id", artifactId)
      .eq("run_id", runId)
      .single();

    if (artifactError || !artifact) {
      return jsonResponse(404, { error: "Artifact not found for this run" });
    }

    normalizedArtifactId = artifact.id;
    artifactAgentName = artifact.agent_name;
  }

  const targetAgentName = appliesGlobally ? null : artifactAgentName;

  const feedbackInsert = {
    run_id: runId,
    user_id: user.id,
    video_id: run.video_id,
    reason_code: reasonCode,
    free_text: freeText,
    artifact_id: normalizedArtifactId,
    agent_name: targetAgentName,
    applies_globally: appliesGlobally,
    feedback_weight: 1,
  };

  const { error: feedbackError } = await adminClient.from("run_feedback").insert(feedbackInsert);
  if (feedbackError) {
    return jsonResponse(500, { error: feedbackError.message });
  }

  const memoryVideoId = appliesGlobally ? null : run.video_id;
  const memoryAgent = appliesGlobally ? null : targetAgentName;
  const memoryKey = inferMemoryKey(reasonCode, memoryAgent);

  let memoryLookup = adminClient
    .from("agent_memory")
    .select("id, value, priority")
    .eq("user_id", user.id)
    .eq("key", memoryKey)
    .limit(1);

  memoryLookup = memoryAgent ? memoryLookup.eq("agent_name", memoryAgent) : memoryLookup.is("agent_name", null);
  memoryLookup = memoryVideoId ? memoryLookup.eq("video_id", memoryVideoId) : memoryLookup.is("video_id", null);

  const { data: existingMemory } = await memoryLookup.maybeSingle();

  if (existingMemory?.id) {
    const previousValue = (existingMemory.value ?? {}) as Record<string, unknown>;
    const existingWeight = Number(previousValue.feedback_weight ?? existingMemory.priority ?? 1);
    const mergedExamples = [
      ...(Array.isArray(previousValue.examples) ? previousValue.examples : []),
      {
        reason_code: reasonCode,
        free_text: freeText,
        run_id: runId,
        artifact_id: normalizedArtifactId,
        submitted_at: new Date().toISOString(),
      },
    ].slice(-10);

    const nextWeight = existingWeight + 1;

    await adminClient
      .from("agent_memory")
      .update({
        value: {
          ...previousValue,
          latest_reason_code: reasonCode,
          latest_free_text: freeText,
          feedback_weight: nextWeight,
          applies_globally: appliesGlobally,
          examples: mergedExamples,
        },
        source: "feedback",
        priority: nextWeight,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingMemory.id);
  } else {
    await adminClient.from("agent_memory").insert({
      user_id: user.id,
      video_id: memoryVideoId,
      key: memoryKey,
      value: {
        latest_reason_code: reasonCode,
        latest_free_text: freeText,
        feedback_weight: 1,
        applies_globally: appliesGlobally,
        examples: [
          {
            reason_code: reasonCode,
            free_text: freeText,
            run_id: runId,
            artifact_id: normalizedArtifactId,
            submitted_at: new Date().toISOString(),
          },
        ],
      },
      source: "feedback",
      agent_name: memoryAgent,
      priority: 1,
    });
  }

  await adminClient.from("agent_modification_log").insert({
    user_id: user.id,
    video_id: run.video_id,
    run_id: runId,
    agent_name: targetAgentName,
    source: "feedback",
    change_summary: `Feedback submitted: ${reasonCode}`,
    metadata: {
      reason_code: reasonCode,
      free_text: freeText,
      applies_globally: appliesGlobally,
      artifact_id: normalizedArtifactId,
    },
  });

  return jsonResponse(200, {
    success: true,
    agentName: targetAgentName,
    appliesGlobally,
  });
});
