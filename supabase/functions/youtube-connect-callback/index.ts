import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { encryptText, verifyState } from "../_shared/crypto.ts";

function html(message: string): Response {
  return new Response(`<!doctype html><html><body style="font-family:sans-serif;padding:24px"><h2>${message}</h2><p>You can close this tab.</p></body></html>`, {
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clientId = Deno.env.get("YOUTUBE_CLIENT_ID");
  const clientSecret = Deno.env.get("YOUTUBE_CLIENT_SECRET");
  const redirectUri = Deno.env.get("YOUTUBE_REDIRECT_URI");
  const stateSecret = Deno.env.get("YOUTUBE_OAUTH_STATE_SECRET") || serviceRoleKey;
  const encryptionKey = Deno.env.get("APP_ENCRYPTION_KEY") || serviceRoleKey;
  const frontendUrl = Deno.env.get("APP_FRONTEND_URL") || Deno.env.get("FRONTEND_URL") || "";

  if (!supabaseUrl || !serviceRoleKey || !clientId || !clientSecret || !redirectUri || !stateSecret || !encryptionKey) {
    return html("Missing YouTube OAuth environment variables.");
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const url = new URL(req.url);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    if (frontendUrl) return Response.redirect(`${frontendUrl}/preferences?youtube=error&reason=${encodeURIComponent(error)}`, 302);
    return html(`Google OAuth error: ${error}`);
  }

  if (!code || !state) return html("Missing OAuth code/state.");

  let userId = "";
  try {
    const decoded = atob(state);
    const parts = decoded.split("|");
    if (parts.length !== 4) return html("Invalid OAuth state.");
    const payload = `${parts[0]}|${parts[1]}|${parts[2]}`;
    const signature = parts[3];
    const isValid = await verifyState(payload, signature, stateSecret);
    if (!isValid) return html("Invalid OAuth signature.");
    const issuedAt = Number(parts[1] || "0");
    if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > 20 * 60 * 1000) {
      return html("OAuth state expired. Start again.");
    }
    userId = parts[0];
  } catch {
    return html("Failed to parse OAuth state.");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text();
    return html(`Token exchange failed: ${text.slice(0, 200)}`);
  }

  const tokenJson = await tokenResponse.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!tokenJson.access_token) return html("Missing access token from Google.");

  const channelResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true", {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });

  if (!channelResponse.ok) {
    const text = await channelResponse.text();
    return html(`Failed to fetch YouTube channel: ${text.slice(0, 200)}`);
  }

  const channelJson = await channelResponse.json() as { items?: Array<{ id: string }> };
  const channelId = channelJson.items?.[0]?.id ?? null;

  const encryptedAccess = await encryptText(tokenJson.access_token, encryptionKey);
  const encryptedRefresh = tokenJson.refresh_token ? await encryptText(tokenJson.refresh_token, encryptionKey) : null;
  const expiresAt = tokenJson.expires_in ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString() : null;

  const { error: updateError } = await adminClient
    .from("profiles")
    .update({
      youtube_access_token_enc: encryptedAccess,
      youtube_refresh_token_enc: encryptedRefresh,
      youtube_token_expires_at: expiresAt,
      youtube_connected_at: new Date().toISOString(),
      youtube_channel_id: channelId,
    })
    .eq("user_id", userId);

  if (updateError) return html(`Failed to save YouTube connection: ${updateError.message}`);

  if (frontendUrl) {
    return Response.redirect(`${frontendUrl}/preferences?youtube=connected`, 302);
  }

  return html("YouTube connected successfully.");
});
