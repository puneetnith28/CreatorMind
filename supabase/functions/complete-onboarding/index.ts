import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { syncCreatorContext } from "../_shared/minds/context.ts";

type InspirationInput = {
  youtubeUrl: string;
  note?: string;
};

function isValidYoutubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be");
  } catch {
    return false;
  }
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
    goal?: string;
    targetAudience?: string;
    autoSelectStyles?: boolean;
    tone?: string;
    pacing?: string;
    hookStyle?: string;
    scriptLengthPreference?: string;
    bannedPhrases?: string[];
    inspirations?: InspirationInput[];
    additionalNotes?: string;
  } | null;

  const goal = body?.goal?.trim() || "";
  const targetAudience = body?.targetAudience?.trim() || "";
  const autoSelectStyles = body?.autoSelectStyles !== false;
  const manualTone = body?.tone?.trim() || "clear_confident";
  const manualPacing = body?.pacing?.trim() || "fast";
  const manualHookStyle = body?.hookStyle?.trim() || "curiosity_with_value";
  const manualScriptLengthPreference = body?.scriptLengthPreference?.trim() || "short_form";
  const bannedPhrases = Array.isArray(body?.bannedPhrases)
    ? body!.bannedPhrases.map((item) => item.trim()).filter(Boolean).slice(0, 30)
    : [];
  const additionalNotes = body?.additionalNotes?.trim() || "";
  const inspirations = Array.isArray(body?.inspirations)
    ? body!.inspirations
      .map((item) => ({
        youtubeUrl: item.youtubeUrl?.trim() || "",
        note: item.note?.trim() || "",
      }))
      .filter((item) => item.youtubeUrl)
    : [];

  if (!goal) return jsonResponse(400, { error: "goal is required" });

  for (const inspiration of inspirations) {
    if (!isValidYoutubeUrl(inspiration.youtubeUrl)) {
      return jsonResponse(400, { error: `Invalid YouTube URL: ${inspiration.youtubeUrl}` });
    }
  }

  const prompt = [
    "Create an onboarding strategy pack for a creator channel.",
    `Channel goal + niche: ${goal}`,
    `Target audience: ${targetAudience}`,
    `Auto select styles: ${autoSelectStyles ? "yes" : "no"}`,
    `Manual tone: ${manualTone}`,
    `Manual pacing: ${manualPacing}`,
    `Manual hook style: ${manualHookStyle}`,
    `Manual script length preference: ${manualScriptLengthPreference}`,
    `Banned phrases: ${bannedPhrases.length ? bannedPhrases.join(", ") : "none"}`,
    `Inspiration references: ${inspirations.length ? inspirations.map((item) => `${item.youtubeUrl}${item.note ? ` (${item.note})` : ""}`).join("; ") : "none"}`,
    `Additional notes: ${additionalNotes || "none"}`,
    "Return JSON exactly: {\"channel_summary_prompt\":\"...\",\"recommended_tone\":\"...\",\"recommended_pacing\":\"...\",\"recommended_hook_style\":\"...\",\"recommended_script_length_preference\":\"...\"}.",
    "Use one of these values only for recommendations:",
    "tone: clear_confident|educational|playful|authoritative",
    "pacing: fast|balanced|deep_dive",
    "hook_style: curiosity_with_value|bold_claim|question_led|story_first",
    "script_length_preference: short_form|mid_form|long_form",
    "Keep channel_summary_prompt under 220 words.",
  ].join("\n");

  const useOpenAi = Deno.env.get("OPENCLAW_USE_OPENAI") !== "false";

  let channelSummaryPrompt = "";
  let recommendedTone = "clear_confident";
  let recommendedPacing = "fast";
  let recommendedHookStyle = "curiosity_with_value";
  let recommendedScriptLength = "short_form";

  if (useOpenAi && openAiApiKey) {
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
            content: "You are a channel strategy assistant that writes precise style prompts for multi-agent generation systems.",
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
      console.warn(`OpenAI failed, falling back to manual goal. Error: ${text}`);
      channelSummaryPrompt = `Focus on: ${goal}`;
    } else {
      const aiJson = await aiResponse.json();
      const rawContent = aiJson?.choices?.[0]?.message?.content;
      
      if (rawContent && typeof rawContent === "string") {
        try {
          const parsed = JSON.parse(rawContent) as {
            channel_summary_prompt?: string;
            recommended_tone?: string;
            recommended_pacing?: string;
            recommended_hook_style?: string;
            recommended_script_length_preference?: string;
          };

          channelSummaryPrompt = parsed.channel_summary_prompt?.trim() || `Focus on: ${goal}`;
          recommendedTone = parsed.recommended_tone?.trim() || recommendedTone;
          recommendedPacing = parsed.recommended_pacing?.trim() || recommendedPacing;
          recommendedHookStyle = parsed.recommended_hook_style?.trim() || recommendedHookStyle;
          recommendedScriptLength = parsed.recommended_script_length_preference?.trim() || recommendedScriptLength;
        } catch {
          console.warn("Failed to parse AI response JSON, falling back.");
          channelSummaryPrompt = `Focus on: ${goal}`;
        }
      } else {
        channelSummaryPrompt = `Focus on: ${goal}`;
      }
    }
  } else {
    // Bypass OpenAI entirely
    channelSummaryPrompt = `Focus on: ${goal}`;
  }

  if (!channelSummaryPrompt) {
    channelSummaryPrompt = `Focus on: ${goal}`;
  }

  const tone = autoSelectStyles ? recommendedTone : manualTone;
  const pacing = autoSelectStyles ? recommendedPacing : manualPacing;
  const hookStyle = autoSelectStyles ? recommendedHookStyle : manualHookStyle;
  const scriptLengthPreference = autoSelectStyles ? recommendedScriptLength : manualScriptLengthPreference;

  const now = new Date().toISOString();

  const { data: existingPreference } = await adminClient
    .from("channel_preferences")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingPreference?.id) {
    const { error: prefUpdateError } = await adminClient
      .from("channel_preferences")
      .update({
        tone,
        pacing,
        hook_style: hookStyle,
        script_length_preference: scriptLengthPreference,
        banned_phrases: bannedPhrases,
        notes: additionalNotes || null,
        updated_at: now,
      })
      .eq("id", existingPreference.id);

    if (prefUpdateError) return jsonResponse(500, { error: prefUpdateError.message });
  } else {
    const { error: prefInsertError } = await adminClient
      .from("channel_preferences")
      .insert({
        user_id: user.id,
        tone,
        pacing,
        hook_style: hookStyle,
        script_length_preference: scriptLengthPreference,
        banned_phrases: bannedPhrases,
        notes: additionalNotes || null,
      });

    if (prefInsertError) return jsonResponse(500, { error: prefInsertError.message });
  }

  const { error: profileUpdateError } = await adminClient
    .from("profiles")
    .upsert({
      user_id: user.id,
      channel_style_goal: goal,
      channel_summary_prompt: channelSummaryPrompt,
      onboarding_completed_at: now,
      updated_at: now,
    }, { onConflict: 'user_id' });

  if (profileUpdateError) return jsonResponse(500, { error: profileUpdateError.message });

  const { error: deleteInspirationError } = await adminClient
    .from("channel_inspirations")
    .delete()
    .eq("user_id", user.id);

  if (deleteInspirationError) return jsonResponse(500, { error: deleteInspirationError.message });

  if (inspirations.length > 0) {
    const { error: inspirationInsertError } = await adminClient
      .from("channel_inspirations")
      .insert(
        inspirations.map((item) => ({
          user_id: user.id,
          youtube_url: item.youtubeUrl,
          note: item.note || null,
          label: null,
        })),
      );

    if (inspirationInsertError) return jsonResponse(500, { error: inspirationInsertError.message });
  }

  const { error: logError } = await adminClient.from("agent_modification_log").insert({
    user_id: user.id,
    source: "onboarding",
    change_summary: "Completed onboarding and initialized channel preferences",
    metadata: {
      auto_select_styles: autoSelectStyles,
      tone,
      pacing,
      hook_style: hookStyle,
      script_length_preference: scriptLengthPreference,
      inspirations_count: inspirations.length,
    },
  });

  if (logError) return jsonResponse(500, { error: logError.message });

  // --- STEP 5: Save Creator DNA and Goals ---
  const { error: dnaError } = await adminClient.from("creator_dna").upsert({
    user_id: user.id,
    niche: goal,
    target_audience: targetAudience,
    tone,
    preferred_formats: [scriptLengthPreference],
    avoid_topics: bannedPhrases,
    primary_platform: "YouTube",
    updated_at: now,
  }, { onConflict: 'user_id' });

  if (dnaError) console.error("Failed to insert DNA:", dnaError);

  const { error: goalsError } = await adminClient.from("creator_goals").insert({
    user_id: user.id,
    goal_type: "Channel Baseline",
    target_metric: goal,
    current_value: 0,
    status: "active",
    priority: "high"
  });

  if (goalsError) console.error("Failed to insert Goals:", goalsError);

  // Sync to Minds SDK
  try {
    await syncCreatorContext({
      niche: goal,
      audience: targetAudience,
      tone,
      goal: goal,
      preferred_formats: [scriptLengthPreference],
      avoid: bannedPhrases,
      primary_platform: "YouTube"
    }, [{
      goal_type: "Channel Baseline",
      target_metric: goal,
      current_value: 0,
      status: "active",
      priority: "high"
    }]);
    console.log("Successfully synced context to Animoca Mind.");
  } catch (err) {
    console.error("Failed to sync context to Animoca Mind:", err);
  }

  return jsonResponse(200, {
    channelSummaryPrompt,
    saved: true,
  });
});
