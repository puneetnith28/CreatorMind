import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { decryptText, encryptText } from "../_shared/crypto.ts";

type TokenPayload = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
};

async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<TokenPayload> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${await response.text()}`);
  }

  return response.json();
}

async function fetchJson(url: string, accessToken: string): Promise<any> {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text.slice(0, 300));
  }
  return JSON.parse(text || "{}");
}

function compactText(value: string | undefined, max = 220): string {
  if (!value) return "";
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clientId = Deno.env.get("YOUTUBE_CLIENT_ID");
  const clientSecret = Deno.env.get("YOUTUBE_CLIENT_SECRET");
  const encryptionKey = Deno.env.get("APP_ENCRYPTION_KEY") || serviceRoleKey;
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !clientId || !clientSecret || !encryptionKey) {
    return jsonResponse(500, { error: "Missing required environment variables" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse(401, { error: "Missing authorization header" });

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return jsonResponse(401, { error: "Unauthorized" });

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("youtube_access_token_enc, youtube_refresh_token_enc, youtube_token_expires_at, youtube_channel_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError || !profile) return jsonResponse(404, { error: "Profile not found" });
  if (!profile.youtube_access_token_enc) return jsonResponse(400, { error: "YouTube not connected" });

  let accessToken = await decryptText(profile.youtube_access_token_enc, encryptionKey);
  const refreshToken = profile.youtube_refresh_token_enc ? await decryptText(profile.youtube_refresh_token_enc, encryptionKey) : null;

  const expiresAt = profile.youtube_token_expires_at ? new Date(profile.youtube_token_expires_at).getTime() : 0;
  if (refreshToken && expiresAt && expiresAt - Date.now() < 60_000) {
    const refreshed = await refreshAccessToken(refreshToken, clientId, clientSecret);
    accessToken = refreshed.access_token;

    await adminClient
      .from("profiles")
      .update({
        youtube_access_token_enc: await encryptText(refreshed.access_token, encryptionKey),
        youtube_token_expires_at: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : profile.youtube_token_expires_at,
        youtube_connected_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);
  }

  let channels: any;
  try {
    channels = await fetchJson("https://www.googleapis.com/youtube/v3/channels?part=id,snippet,contentDetails,statistics&mine=true", accessToken);
  } catch (error) {
    if (!refreshToken) return jsonResponse(500, { error: error instanceof Error ? error.message : "YouTube fetch failed" });
    const refreshed = await refreshAccessToken(refreshToken, clientId, clientSecret);
    accessToken = refreshed.access_token;
    channels = await fetchJson("https://www.googleapis.com/youtube/v3/channels?part=id,snippet,contentDetails,statistics&mine=true", accessToken);
    await adminClient.from("profiles").update({
      youtube_access_token_enc: await encryptText(refreshed.access_token, encryptionKey),
      youtube_token_expires_at: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : null,
    }).eq("user_id", user.id);
  }

  const channel = channels.items?.[0];
  if (!channel) return jsonResponse(404, { error: "No YouTube channel found" });

  const uploadsPlaylist = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylist) return jsonResponse(400, { error: "Uploads playlist not found" });

  const playlistItems = await fetchJson(
    `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails,snippet&maxResults=8&playlistId=${encodeURIComponent(uploadsPlaylist)}`,
    accessToken,
  );

  const videoIds = (playlistItems.items || [])
    .map((item: any) => item.contentDetails?.videoId)
    .filter(Boolean)
    .slice(0, 8);

  if (videoIds.length === 0) return jsonResponse(200, { synced: 0, insights: 0 });

  const videoDetails = await fetchJson(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${encodeURIComponent(videoIds.join(","))}`,
    accessToken,
  );

  const nowIso = new Date().toISOString();
  const insightRows: Array<Record<string, unknown>> = [];

  for (const video of (videoDetails.items || [])) {
    const videoId = String(video.id);
    const title = compactText(video.snippet?.title, 120);
    const description = compactText(video.snippet?.description, 180);
    const views = Number(video.statistics?.viewCount || 0);
    const likes = Number(video.statistics?.likeCount || 0);
    const comments = Number(video.statistics?.commentCount || 0);

    const tips = [
      views > 1000 ? "Recent format is attracting strong views." : "Strengthen hook and title specificity to improve view velocity.",
      likes > 0 && views > 0 ? `Like ratio ${(likes / Math.max(views, 1) * 100).toFixed(2)}%` : "Insufficient like data yet.",
      comments > 5 ? "Comment momentum suggests topic resonance." : "Prompt stronger audience interaction in CTA.",
    ];

    const commentInsights: string[] = [];
    try {
      const commentsResp = await fetchJson(
        `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${encodeURIComponent(videoId)}&maxResults=5&order=relevance&textFormat=plainText`,
        accessToken,
      );
      (commentsResp.items || []).forEach((item: any) => {
        const text = compactText(item.snippet?.topLevelComment?.snippet?.textDisplay, 120);
        if (text) commentInsights.push(text);
      });
    } catch {
      // non-fatal
    }

    const insights = [
      { key: "audience_prefers", value: `Video topic: ${title}.`, priority: 2, appliesGlobally: true },
      { key: "high_retention_pattern", value: tips[0], priority: 2, appliesGlobally: true },
      { key: "avoid_patterns", value: "Avoid vague openings without concrete payoff.", priority: 1, appliesGlobally: true },
      ...commentInsights.slice(0, 3).map((text) => ({ key: "audience_comment_signal", value: text, priority: 1, appliesGlobally: false })),
    ];

    insightRows.push({
      user_id: user.id,
      video_id: null,
      source: "youtube",
      insight_type: "youtube_performance",
      score: views,
      insights,
      raw_summary: `Video ${title}: views=${views}, likes=${likes}, comments=${comments}. ${description}`,
      applied_to_memory: false,
      created_at: nowIso,
    });

    await adminClient
      .from("videos")
      .update({
        youtube_video_id: videoId,
        youtube_published_at: video.snippet?.publishedAt || null,
        latest_youtube_sync_at: nowIso,
      })
      .eq("user_id", user.id)
      .eq("title", video.snippet?.title || "");
  }

  if (insightRows.length > 0) {
    const { error: insertError } = await adminClient.from("external_insights").insert(insightRows);
    if (insertError) return jsonResponse(500, { error: insertError.message });
  }

  await adminClient
    .from("profiles")
    .update({
      youtube_channel_id: channel.id,
      youtube_connected_at: nowIso,
    } as Record<string, unknown>)
    .eq("user_id", user.id);

  return jsonResponse(200, { synced: videoIds.length, insights: insightRows.length, channelId: channel.id });
});
