import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

function isServiceAuthorized(req: Request): boolean {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || req.headers.get("x-openclaw-token");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openclawToken = Deno.env.get("OPENCLAW_SERVICE_TOKEN");
  return Boolean(token && (token === serviceRole || (openclawToken && token === openclawToken)));
}

function parseChannelHint(url: string): { id?: string; query: string } {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const channelIndex = parts.findIndex((part) => part === "channel");
    if (channelIndex >= 0 && parts[channelIndex + 1]) {
      return { id: parts[channelIndex + 1], query: parts[channelIndex + 1] };
    }
    const last = parts[parts.length - 1] || parsed.hostname;
    return { query: last.replace(/^@/, "") };
  } catch {
    return { query: url.replace(/^@/, "") };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !youtubeApiKey) return jsonResponse(500, { error: "Missing required environment variables" });

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  let targetUserId: string | null = null;

  if (!isServiceAuthorized(req)) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse(401, { error: "Unauthorized" });
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) return jsonResponse(401, { error: "Unauthorized" });
    targetUserId = authData.user.id;
  }

  let inspirationsQuery = adminClient
    .from("channel_inspirations")
    .select("user_id, youtube_url, note")
    .order("created_at", { ascending: false })
    .limit(100);
  if (targetUserId) inspirationsQuery = inspirationsQuery.eq("user_id", targetUserId);
  const { data: inspirations, error } = await inspirationsQuery;

  if (error) return jsonResponse(500, { error: error.message });
  if (!inspirations || inspirations.length === 0) return jsonResponse(200, { synced: 0 });

  const rows: Array<Record<string, unknown>> = [];

  for (const inspiration of inspirations) {
    const hint = parseChannelHint(inspiration.youtube_url);

    let channelData: any = null;
    if (hint.id) {
      const byId = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${encodeURIComponent(hint.id)}&key=${youtubeApiKey}`);
      if (byId.ok) {
        const json = await byId.json();
        channelData = json.items?.[0] ?? null;
      }
    }

    if (!channelData) {
      const searchResp = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(hint.query)}&key=${youtubeApiKey}`);
      if (!searchResp.ok) continue;
      const searchJson = await searchResp.json();
      const channelId = searchJson.items?.[0]?.id?.channelId;
      if (!channelId) continue;
      const channelResp = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${encodeURIComponent(channelId)}&key=${youtubeApiKey}`);
      if (!channelResp.ok) continue;
      const channelJson = await channelResp.json();
      channelData = channelJson.items?.[0] ?? null;
    }

    if (!channelData) continue;

    const channelId = String(channelData.id || "");
    const title = String(channelData.snippet?.title || "");
    const subscribers = Number(channelData.statistics?.subscriberCount || 0);
    const views = Number(channelData.statistics?.viewCount || 0);

    const summary = [
      `Inspiration channel: ${title}`,
      `Subscribers: ${subscribers}`,
      `Total views: ${views}`,
      inspiration.note ? `Emulation target: ${inspiration.note}` : "",
    ].filter(Boolean).join(". ");

    rows.push({
      user_id: inspiration.user_id,
      video_id: null,
      source: "youtube_inspiration",
      insight_type: "inspiration_pattern",
      score: subscribers,
      insights: [
        { key: "audience_prefers", value: `Inspiration ${title} emphasizes clear niche framing.`, priority: 1, appliesGlobally: true },
        { key: "high_retention_pattern", value: inspiration.note || "Study repeatable packaging from this inspiration channel.", priority: 2, appliesGlobally: true },
      ],
      raw_summary: summary,
      applied_to_memory: false,
    });
  }

  if (rows.length > 0) {
    const { error: insertError } = await adminClient.from("external_insights").insert(rows);
    if (insertError) return jsonResponse(500, { error: insertError.message });
  }

  return jsonResponse(200, { synced: rows.length });
});
