import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

function memoryKeyForType(type: string): string {
  if (type === "hook") return "approved_hook_patterns";
  if (type === "script") return "approved_script_patterns";
  if (type === "title") return "approved_title_patterns";
  if (type === "strategy") return "approved_strategy_patterns";
  return "approved_artifact_patterns";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1-mini";

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !openAiApiKey) {
    return jsonResponse(500, { error: "Missing required environment variables" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse(401, { error: "Missing authorization header" });

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return jsonResponse(401, { error: "Unauthorized" });

  const body = await req.json().catch(() => null) as {
    artifactId?: string;
    userComment?: string;
  } | null;

  const artifactId = body?.artifactId?.trim();
  const userComment = body?.userComment?.trim() || "";
  if (!artifactId) return jsonResponse(400, { error: "artifactId is required" });

  const { data: artifact, error: artifactError } = await userClient
    .from("artifacts")
    .select("id, type, content, approval_status, agent_name, run_id")
    .eq("id", artifactId)
    .eq("user_id", user.id)
    .single();

  if (artifactError || !artifact) return jsonResponse(404, { error: "Artifact not found" });
  if (artifact.approval_status !== "approved") return jsonResponse(400, { error: "Artifact must be approved" });

  const { data: run } = await userClient
    .from("runs")
    .select("video_id")
    .eq("id", artifact.run_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const prompt = [
    "Analyze why this approved artifact works and create reusable guidance.",
    `Artifact type: ${artifact.type}`,
    `Agent: ${artifact.agent_name ?? "unknown"}`,
    `Artifact content:\n${artifact.content ?? ""}`,
    `Optional user comment: ${userComment || "none"}`,
    "Return JSON exactly: {\"insight_summary\":\"...\",\"rules\":[\"...\"],\"reasoning\":\"...\"}",
  ].join("\n\n");

  const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a content quality analyst. Extract durable rules from successful approved artifacts.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!aiResponse.ok) {
    const text = await aiResponse.text();
    return jsonResponse(500, { error: `OpenAI error: ${text}` });
  }

  const aiJson = await aiResponse.json();
  const raw = aiJson?.choices?.[0]?.message?.content;
  if (!raw || typeof raw !== "string") return jsonResponse(500, { error: "Invalid AI response" });

  let insightSummary = "";
  let rules: string[] = [];
  let reasoning = "";

  try {
    const parsed = JSON.parse(raw) as { insight_summary?: string; rules?: string[]; reasoning?: string };
    insightSummary = parsed.insight_summary?.trim() || "";
    rules = Array.isArray(parsed.rules) ? parsed.rules.map((item) => String(item).trim()).filter(Boolean).slice(0, 12) : [];
    reasoning = parsed.reasoning?.trim() || "";
  } catch {
    return jsonResponse(500, { error: "Failed to parse AI JSON" });
  }

  if (!insightSummary) return jsonResponse(500, { error: "Empty insight summary" });

  const key = memoryKeyForType(artifact.type);
  const { data: existing } = await adminClient
    .from("agent_memory")
    .select("id, value, priority")
    .eq("user_id", user.id)
    .eq("key", key)
    .eq("agent_name", artifact.agent_name)
    .is("video_id", null)
    .maybeSingle();

  const now = new Date().toISOString();

  if (existing?.id) {
    const value = (existing.value ?? {}) as Record<string, unknown>;
    const existingExamples = Array.isArray(value.examples) ? value.examples : [];

    await adminClient
      .from("agent_memory")
      .update({
        value: {
          ...value,
          latest_summary: insightSummary,
          latest_reasoning: reasoning,
          latest_rules: rules,
          examples: [
            ...existingExamples,
            {
              artifact_id: artifact.id,
              run_id: artifact.run_id,
              insight_summary: insightSummary,
              rules,
              user_comment: userComment || null,
              saved_at: now,
            },
          ].slice(-15),
        },
        source: "feedback",
        priority: Number(existing.priority ?? 1) + 1,
        updated_at: now,
      })
      .eq("id", existing.id);
  } else {
    await adminClient.from("agent_memory").insert({
      user_id: user.id,
      video_id: null,
      key,
      source: "feedback",
      agent_name: artifact.agent_name,
      priority: 1,
      value: {
        latest_summary: insightSummary,
        latest_reasoning: reasoning,
        latest_rules: rules,
        examples: [
          {
            artifact_id: artifact.id,
            run_id: artifact.run_id,
            insight_summary: insightSummary,
            rules,
            user_comment: userComment || null,
            saved_at: now,
          },
        ],
      },
    });
  }

  await adminClient.from("agent_modification_log").insert({
    user_id: user.id,
    video_id: run?.video_id ?? null,
    run_id: artifact.run_id,
    agent_name: artifact.agent_name,
    source: "feedback",
    change_summary: `Auto-learned from approved ${artifact.type}`,
    metadata: {
      artifact_id: artifact.id,
      key,
      insight_summary: insightSummary,
      rules_count: rules.length,
      user_comment: userComment || null,
    },
  });

  return jsonResponse(200, {
    saved: true,
    key,
    insightSummary,
    rules,
  });
});
