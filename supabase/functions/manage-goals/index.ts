import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { syncCreatorContext } from "../_shared/minds/context.ts";

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

  const body = await req.json().catch(() => null) as {
    action?: "create" | "update" | "delete";
    goal_id?: string;
    goal_data?: {
      goal_type?: string;
      target_metric?: string;
      current_value?: number;
      status?: "active" | "achieved" | "abandoned";
      priority?: "high" | "medium" | "low";
    };
  } | null;

  if (!body || !body.action) {
    return jsonResponse(400, { error: "Missing action in request body" });
  }

  const { action, goal_id, goal_data } = body;

  try {
    // 1. Perform the DB mutation
    if (action === "create") {
      if (!goal_data?.goal_type || !goal_data?.target_metric) {
        return jsonResponse(400, { error: "Missing required goal_data for create" });
      }
      const { error: insertError } = await adminClient.from("creator_goals").insert({
        user_id: user.id,
        goal_type: goal_data.goal_type,
        target_metric: goal_data.target_metric,
        current_value: goal_data.current_value || 0,
        status: goal_data.status || "active",
        priority: goal_data.priority || "medium",
      });
      if (insertError) throw insertError;
    } 
    else if (action === "update") {
      if (!goal_id) return jsonResponse(400, { error: "Missing goal_id for update" });
      const { error: updateError } = await adminClient.from("creator_goals").update({
        ...(goal_data?.goal_type && { goal_type: goal_data.goal_type }),
        ...(goal_data?.target_metric && { target_metric: goal_data.target_metric }),
        ...(goal_data?.current_value !== undefined && { current_value: goal_data.current_value }),
        ...(goal_data?.status && { status: goal_data.status }),
        ...(goal_data?.priority && { priority: goal_data.priority }),
        updated_at: new Date().toISOString(),
      }).eq("id", goal_id).eq("user_id", user.id);
      if (updateError) throw updateError;
    }
    else if (action === "delete") {
      if (!goal_id) return jsonResponse(400, { error: "Missing goal_id for delete" });
      const { error: deleteError } = await adminClient.from("creator_goals").delete()
        .eq("id", goal_id).eq("user_id", user.id);
      if (deleteError) throw deleteError;
    } else {
      return jsonResponse(400, { error: "Invalid action" });
    }

    // 2. Fetch fresh DNA and ALL active goals to sync to Mind
    const { data: dnaData, error: dnaError } = await adminClient
      .from("creator_dna")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
      
    if (dnaError) throw dnaError;

    const { data: goalsData, error: goalsFetchError } = await adminClient
      .from("creator_goals")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active"); // We only sync active goals to the Mind

    if (goalsFetchError) throw goalsFetchError;

    // 3. Sync to Minds API
    if (dnaData) {
      await syncCreatorContext({
        niche: dnaData.niche || "",
        audience: dnaData.target_audience || "",
        tone: dnaData.tone || "",
        preferred_formats: dnaData.preferred_formats || [],
        avoid: dnaData.avoid_topics || [],
        primary_platform: dnaData.primary_platform || "YouTube"
      }, goalsData || []);
      console.log(`Synced context to Mind successfully after goal ${action}`);
    }

    return jsonResponse(200, { success: true, action });

  } catch (err: any) {
    console.error(`Error in manage-goals (${action}):`, err);
    return jsonResponse(500, { error: err.message || "Internal server error" });
  }
});
