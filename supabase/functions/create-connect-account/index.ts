import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !stripeSecretKey) {
    return jsonResponse(500, { error: "Missing required environment variables" });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse(401, { error: "Missing authorization header" });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });

  const { data: authData, error: authError } = await userClient.auth.getUser();
  const user = authData?.user;
  if (authError || !user) {
    return jsonResponse(401, { error: "Unauthorized" });
  }

  const body = await req.json().catch(() => null) as {
    refreshUrl?: string;
    returnUrl?: string;
  } | null;

  const refreshUrl = body?.refreshUrl?.trim();
  const returnUrl = body?.returnUrl?.trim();

  if (!refreshUrl || !returnUrl) {
    return jsonResponse(400, { error: "refreshUrl and returnUrl are required" });
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("stripe_connect_account_id")
    .eq("user_id", user.id)
    .single();

  if (profileError) {
    return jsonResponse(500, { error: profileError.message });
  }

  let accountId = profile?.stripe_connect_account_id || null;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email: user.email,
      metadata: { user_id: user.id },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    accountId = account.id;

    const { error: updateError } = await adminClient
      .from("profiles")
      .update({ stripe_connect_account_id: accountId })
      .eq("user_id", user.id);

    if (updateError) {
      return jsonResponse(500, { error: updateError.message });
    }
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: refreshUrl,
    return_url: returnUrl,
  });

  return jsonResponse(200, {
    accountId,
    url: link.url,
  });
});
