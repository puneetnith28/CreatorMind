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

  try {
    // 1. Fetch pending external insights for this user
    const { data: pendingInsights, error: fetchError } = await adminClient
      .from("external_insights")
      .select("*")
      .eq("user_id", user.id)
      .eq("applied_to_memory", false)
      .order("created_at", { ascending: true });

    if (fetchError) throw fetchError;

    if (!pendingInsights || pendingInsights.length === 0) {
      return jsonResponse(200, { message: "No new insights to sync.", count: 0 });
    }

    // 2. Format insights into a payload
    const insightLines = pendingInsights.map(insight => {
      let lines = `[${insight.source.toUpperCase()} INSIGHT] ${insight.insight_type}: ${insight.raw_summary}`;
      if (Array.isArray(insight.insights) && insight.insights.length > 0) {
        insight.insights.forEach((i: any) => {
          lines += `\n  - Signal: ${i.value}`;
        });
      }
      return lines;
    });

    const memoryPayload = `
[EXTERNAL PERFORMANCE DATA UPDATE]
The following new performance metrics and insights have been gathered from the creator's real-world channels.
Please permanently store these findings and adjust your strategies and recommendations accordingly:

${insightLines.join("\n\n")}
    `.trim();

    // 3. Send payload to Minds SDK
    const mindsClient = getMindsClient();
    const mindId = getMindId();
    
    // We'll use a dedicated conversation for performance data
    const conversationAlias = "creator_mind_performance_context";
    await mindsClient.ensureConversation(conversationAlias, mindId);
    await mindsClient.sendMessage({ alias: conversationAlias, messageText: memoryPayload });
    await mindsClient.waitForReply({ alias: conversationAlias, timeoutMs: 30000 }); // ensure it's processed

    // 4. Mark insights as applied
    const insightIds = pendingInsights.map(i => i.id);
    const { error: updateError } = await adminClient
      .from("external_insights")
      .update({ applied_to_memory: true })
      .in("id", insightIds);

    if (updateError) throw updateError;

    return jsonResponse(200, { 
      message: "Insights successfully synced to Mind.", 
      count: insightIds.length 
    });

  } catch (err: any) {
    console.error("Error in sync-insights-to-mind:", err);
    return jsonResponse(500, { error: err.message || "Internal server error" });
  }
});
