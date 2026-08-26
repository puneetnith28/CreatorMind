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
    successUrl?: string;
    cancelUrl?: string;
    amountPence?: number;
    platformFeePence?: number;
    currency?: string;
  } | null;

  const successUrl = body?.successUrl?.trim();
  const cancelUrl = body?.cancelUrl?.trim();
  const amountPence = Number(body?.amountPence ?? 1000);
  const platformFeePence = Number(body?.platformFeePence ?? 200);
  const currency = body?.currency?.trim().toLowerCase() || "gbp";

  if (!successUrl || !cancelUrl) {
    return jsonResponse(400, { error: "successUrl and cancelUrl are required" });
  }

  if (Number.isNaN(amountPence) || amountPence < 50) {
    return jsonResponse(400, { error: "amountPence must be at least 50" });
  }

  if (Number.isNaN(platformFeePence) || platformFeePence < 0 || platformFeePence >= amountPence) {
    return jsonResponse(400, { error: "platformFeePence must be between 0 and amountPence - 1" });
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("stripe_connect_account_id")
    .eq("user_id", user.id)
    .single();

  if (profileError) {
    return jsonResponse(500, { error: profileError.message });
  }

  const destination = profile?.stripe_connect_account_id;
  if (!destination) {
    return jsonResponse(400, { error: "Connect account not found. Create one first." });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: [
      {
        price_data: {
          currency,
          unit_amount: amountPence,
          product_data: {
            name: "CreatorMind Connect Demo Payment",
          },
        },
        quantity: 1,
      },
    ],
    payment_intent_data: {
      application_fee_amount: platformFeePence,
      transfer_data: {
        destination,
      },
      metadata: {
        user_id: user.id,
        connect_destination: destination,
      },
    },
    metadata: {
      user_id: user.id,
      connect_destination: destination,
      mode: "connect_demo",
    },
  });

  if (!session.url) {
    return jsonResponse(500, { error: "Stripe did not return a checkout URL" });
  }

  return jsonResponse(200, {
    url: session.url,
    destination,
    applicationFeePence: platformFeePence,
  });
});
