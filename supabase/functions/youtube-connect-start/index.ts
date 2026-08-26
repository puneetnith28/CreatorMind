import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";
import { signState } from "../_shared/crypto.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const clientId = Deno.env.get("YOUTUBE_CLIENT_ID");
  const redirectUri = Deno.env.get("YOUTUBE_REDIRECT_URI");
  const stateSecret = Deno.env.get("YOUTUBE_OAUTH_STATE_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !clientId || !redirectUri || !stateSecret) {
    return jsonResponse(500, { error: "Missing required environment variables" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonResponse(401, { error: "Missing authorization header" });

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return jsonResponse(401, { error: "Unauthorized" });

  const issuedAt = Date.now();
  const nonce = crypto.randomUUID();
  const payload = `${user.id}|${issuedAt}|${nonce}`;
  const signature = await signState(payload, stateSecret);
  const state = btoa(`${payload}|${signature}`);

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("scope", [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
  ].join(" "));
  url.searchParams.set("state", state);

  return jsonResponse(200, { url: url.toString() });
});
