import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

type SuggestTarget = "title" | "description";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_SUGGEST_MODEL") ?? "gpt-4o-mini";

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
    videoId?: string;
    target?: SuggestTarget;
    currentText?: string;
    contextText?: string;
  } | null;

  const videoId = body?.videoId?.trim() || null;
  const target = body?.target;
  const currentText = body?.currentText?.trim() || "";
  const contextText = body?.contextText?.trim() || "";

  if (!target || !["title", "description"].includes(target)) {
    return jsonResponse(400, { error: "target must be 'title' or 'description'" });
  }

  let videoTitle = "";
  let videoDescription = "";

  if (videoId) {
    const { data: video, error: videoError } = await userClient
      .from("videos")
      .select("title, description")
      .eq("id", videoId)
      .eq("user_id", user.id)
      .single();

    if (videoError || !video) return jsonResponse(404, { error: "Video not found" });
    videoTitle = video.title ?? "";
    videoDescription = video.description ?? "";
  }

  const [{ data: profile }, { data: preference }, { data: inspirations }] = await Promise.all([
    adminClient
      .from("profiles")
      .select("channel_summary_prompt, channel_style_goal")
      .eq("user_id", user.id)
      .maybeSingle(),
    adminClient
      .from("channel_preferences")
      .select("tone, pacing, hook_style, script_length_preference, banned_phrases, cta_style, notes")
      .eq("user_id", user.id)
      .maybeSingle(),
    adminClient
      .from("channel_inspirations")
      .select("youtube_url, note")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const preferenceLines = [
    `Channel goal: ${profile?.channel_style_goal ?? "not set"}`,
    `Channel summary prompt: ${profile?.channel_summary_prompt ?? "not set"}`,
    `Tone: ${preference?.tone ?? "not set"}`,
    `Pacing: ${preference?.pacing ?? "not set"}`,
    `Hook style: ${preference?.hook_style ?? "not set"}`,
    `Script length preference: ${preference?.script_length_preference ?? "not set"}`,
    `Banned phrases: ${Array.isArray(preference?.banned_phrases) && preference?.banned_phrases.length > 0 ? preference?.banned_phrases.join(", ") : "none"}`,
    `CTA style: ${preference?.cta_style ?? "not set"}`,
    `Notes: ${preference?.notes ?? "none"}`,
    `Inspirations: ${(inspirations || []).length > 0
      ? (inspirations || [])
        .map((item) => `${item.youtube_url}${item.note ? ` (${item.note})` : ""}`)
        .join("; ")
      : "none"}`,
  ];

  const prompt = [
    `Target field: ${target}`,
    `Current text: ${currentText || "(empty)"}`,
    `Video title context: ${videoTitle || "(none)"}`,
    `Video description context: ${videoDescription || "(none)"}`,
    `Additional context: ${contextText || "(none)"}`,
    "Channel preferences:",
    ...preferenceLines,
    "Return JSON exactly: {\"suggestion\":\"...\",\"rationale\":\"...\",\"appliedPreferenceKeys\":[\"...\"]}.",
    "Suggestion constraints: if target=title keep under 80 chars. if target=description keep concise and skimmable.",
  ].join("\n");

  const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 220,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You rewrite creator copy to match channel style while preserving intent.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!aiResponse.ok) {
    const text = await aiResponse.text();
    return jsonResponse(500, { error: `OpenAI error: ${text}` });
  }

  const aiJson = await aiResponse.json();
  const rawContent = aiJson?.choices?.[0]?.message?.content;
  if (!rawContent || typeof rawContent !== "string") {
    return jsonResponse(500, { error: "Invalid AI response" });
  }

  try {
    const parsed = JSON.parse(rawContent) as {
      suggestion?: string;
      rationale?: string;
      appliedPreferenceKeys?: string[];
    };

    const suggestion = parsed.suggestion?.trim() || "";
    if (!suggestion) return jsonResponse(500, { error: "AI returned empty suggestion" });

    return jsonResponse(200, {
      suggestion,
      rationale: parsed.rationale?.trim() || "",
      appliedPreferenceKeys: Array.isArray(parsed.appliedPreferenceKeys)
        ? parsed.appliedPreferenceKeys.map((item) => String(item))
        : [],
    });
  } catch {
    return jsonResponse(500, { error: "Failed to parse AI JSON" });
  }
});
