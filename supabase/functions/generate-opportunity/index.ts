import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { getMindsClient, getMindId } from "../_shared/minds/client.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(200, { error: "Missing required environment variables" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse(401, { error: "Missing authorization header" });

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  let userId: string;

  if (authHeader === `Bearer ${serviceRoleKey}`) {
    // Autonomous worker invocation
    // To read the payload, we need to clone the request or parse it
    // Wait, the body is read later. Let's just clone and parse here.
    const body = await req.clone().json().catch(() => ({}));
    if (!body?.userId) return jsonResponse(400, { error: "Missing userId for autonomous invocation" });
    userId = body.userId;
  } else {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) return jsonResponse(200, { error: "Unauthorized" });
    userId = authData.user.id;
  }
  
  const user = { id: userId };

  try {
    // 1. Fetch Context (DNA, Goals, Insights)
    const { data: dnaData } = await adminClient.from("creator_dna").select("*").eq("user_id", user.id).single();
    const { data: goalsData } = await adminClient.from("creator_goals").select("*").eq("user_id", user.id);
    const { data: insightsData } = await adminClient.from("external_insights").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10);

    const dnaString = dnaData 
      ? `Niche: ${dnaData.niche}\nAudience: ${dnaData.target_audience}\nTone: ${dnaData.content_tone}\nAvoid: ${dnaData.topics_to_avoid}`
      : "No DNA configured.";
    
    const goalsString = (goalsData && goalsData.length > 0)
      ? goalsData.map((g: any) => `- ${g.goal_type}: ${g.current_value} -> ${g.target_metric} (Status: ${g.status})`).join("\n")
      : "No active goals.";

    const insightsString = (insightsData && insightsData.length > 0)
      ? insightsData.map((i: any) => `- ${i.insight_type}: ${i.raw_summary}`).join("\n")
      : "No recent performance insights.";

    // 2. Build the Engine Prompt
    const enginePrompt = `
Based on the following context about the creator:

[CREATOR DNA]
${dnaString}

[ACTIVE GOALS]
${goalsString}

[RECENT PERFORMANCE INSIGHTS]
${insightsString}

Identify the SINGLE most impactful next growth opportunity this creator should focus on right now to achieve their goals based on the performance insights. It could be a new video concept, a format pivot, or a community engagement tactic.

CRITICAL INSTRUCTION: Even if "No DNA configured" or "No active goals" is present, you MUST still provide a generic growth opportunity based purely on the performance insights (or general YouTube best practices if insights are also missing). You must NEVER refuse to answer.

Return your answer in the following strict JSON format ONLY. Do not include any conversational text, markdown formatting, or apologies.
{
  "title": "Short, punchy title",
  "description": "Clear explanation of what to do",
  "reasoning": "Why this is the best move right now based on my goals",
  "evidence": ["Data point 1", "Data point 2"],
  "experiment": {
    "hypothesis": "e.g., Using a problem-first hook will increase retention compared to a traditional hook.",
    "variant_a": "e.g., Problem-first hook (start with the user's pain point)",
    "variant_b": "e.g., Traditional hook (start with a high-energy intro)",
    "baseline_metric": {"metric": "Retention at 30s"},
    "success_metric": {"metric": "Retention at 30s"}
  }
}
`.trim();

    // 3. Query the Mind
    const mindsClient = getMindsClient();
    const mindId = getMindId();
    
    const alias = `opportunity_engine_${Date.now()}`;
    await mindsClient.ensureConversation(alias, mindId);
    
    // We send the message and wait for the reply
    await mindsClient.sendMessage({ alias, messageText: enginePrompt });
    const replyOutcome = await mindsClient.waitForReply({ alias, timeoutMs: 120000 });
    
    const fallbackData = {
      title: "Create Content Consistently",
      description: "We are still gathering baseline data for your channel. Focus on publishing consistently to give the AI more signals to analyze.",
      reasoning: "Without enough performance data, the best strategy is consistency. Establish a publishing rhythm so we can identify what resonates with your audience.",
      evidence: ["Insufficient historical performance data."],
      experiment: {
        hypothesis: "Publishing weekly will establish a baseline for audience retention and engagement.",
        variant_a: "Consistent weekly schedule",
        variant_b: "Ad-hoc publishing",
        baseline_metric: { metric: "Publishing Consistency" },
        success_metric: { metric: "Views per Video" }
      }
    };

    // Try to parse JSON. Sometimes LLMs wrap in ```json ... ``` or add conversational text
    let parsedData = fallbackData;
    const aiReplyText = !replyOutcome.timedOut ? (replyOutcome.reply?.messageText || "") : "";
    if (!replyOutcome.timedOut && aiReplyText) {
      try {
        let cleanJson = aiReplyText;
        const jsonStart = cleanJson.indexOf('{');
        const jsonEnd = cleanJson.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
          cleanJson = cleanJson.substring(jsonStart, jsonEnd + 1);
        }
        parsedData = JSON.parse(cleanJson);
      } catch (e) {
        console.error("Failed to parse AI response as JSON, using fallback:", aiReplyText);
        parsedData = fallbackData;
      }
    } else {
      console.warn("AI timed out or returned empty, using fallback data.");
    }

    // Ensure profile exists to avoid FK constraints
    let { data: profile } = await adminClient.from('profiles').select('id').eq('user_id', user.id).single();
    if (!profile) {
      const { data: newProfile } = await adminClient.from('profiles').insert({ user_id: user.id }).select('id').single();
      profile = newProfile;
    }

    if (!profile) {
      throw new Error("Failed to resolve user profile.");
    }

    // 4. Save to Database
    const { data: newOpportunity, error: insertError } = await adminClient.from("opportunities").insert({
      user_id: profile.id, // Must be profile.id because of REFERENCES public.profiles(id)
      title: parsedData.title,
      description: parsedData.description,
      reasoning: parsedData.reasoning,
      evidence: parsedData.evidence,
      status: "pending"
    }).select().single();

    if (insertError) throw insertError;

    // 5. Save the Proposed Experiment
    if (parsedData.experiment && newOpportunity) {
      const { error: expError } = await adminClient.from("experiments").insert({
        user_id: user.id, // references auth.users(id)
        opportunity_id: newOpportunity.id,
        hypothesis: parsedData.experiment.hypothesis,
        variant_a: parsedData.experiment.variant_a,
        variant_b: parsedData.experiment.variant_b,
        baseline_metric: parsedData.experiment.baseline_metric,
        success_metric: parsedData.experiment.success_metric,
        status: "proposed"
      });
      if (expError) {
        console.error("Failed to insert proposed experiment:", expError);
      }
    }

    return jsonResponse(200, { opportunity: newOpportunity });

  } catch (err: any) {
    console.error("Error in generate-opportunity:", err);
    return jsonResponse(200, { error: err.message || "Internal server error" });
  }
});
