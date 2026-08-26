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
    priceId?: string;
    successUrl?: string;
    cancelUrl?: string;
  } | null;

  const priceId = body?.priceId?.trim();
  const successUrl = body?.successUrl?.trim();
  const cancelUrl = body?.cancelUrl?.trim();

  if (!priceId || !successUrl || !cancelUrl) {
    return jsonResponse(400, { error: "priceId, successUrl and cancelUrl are required" });
  }

  const allowedPriceIds = [
    Deno.env.get("STRIPE_STARTER_PRICE_ID"),
    Deno.env.get("STRIPE_PRO_PRICE_ID"),
  ].filter((v): v is string => Boolean(v));

  if (allowedPriceIds.length > 0 && !allowedPriceIds.includes(priceId)) {
    return jsonResponse(400, { error: "Unsupported price ID" });
  }

  try {
    // Ensure a profile row exists so billing fields can be persisted reliably.
    const { error: profileUpsertError } = await adminClient.from("profiles").upsert(
      {
        user_id: user.id,
        name: user.email ?? "Creator",
      },
      { onConflict: "user_id" },
    );

    if (profileUpsertError) {
      return jsonResponse(500, { error: profileUpsertError.message });
    }

    const { data: profile, error: profileError } = await adminClient
      .from("profiles")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    if (profileError) {
      return jsonResponse(500, { error: profileError.message });
    }

    let customerId = profile?.stripe_customer_id || null;

    const createAndPersistCustomer = async () => {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id },
      });

      const nextCustomerId = customer.id;
      const { error: updateCustomerError } = await adminClient
        .from("profiles")
        .update({ stripe_customer_id: nextCustomerId })
        .eq("user_id", user.id);

      if (updateCustomerError) {
        throw new Error(updateCustomerError.message);
      }

      return nextCustomerId;
    };

    if (!customerId) {
      customerId = await createAndPersistCustomer();
    } else {
      try {
        await stripe.customers.retrieve(customerId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.toLowerCase().includes("no such customer")) {
          customerId = await createAndPersistCustomer();
        } else {
          throw error;
        }
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      metadata: { user_id: user.id, price_id: priceId },
    });

    if (!session.url) {
      return jsonResponse(500, { error: "Stripe did not return a checkout URL" });
    }

    return jsonResponse(200, { url: session.url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout session creation failed";
    return jsonResponse(500, { error: message });
  }
});
