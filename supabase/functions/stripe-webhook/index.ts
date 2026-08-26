import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14.25.0?target=deno";
import { corsHeaders, jsonResponse } from "../_shared/cors.ts";

function toIso(seconds?: number | null) {
  return seconds ? new Date(seconds * 1000).toISOString() : null;
}

async function updateProfileByCustomer(
  supabase: ReturnType<typeof createClient>,
  customerId: string,
  values: Record<string, unknown>,
) {
  return supabase.from("profiles").update(values).eq("stripe_customer_id", customerId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !stripeWebhookSecret) {
    return jsonResponse(500, { error: "Missing required environment variables" });
  }

  const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-06-20" });
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return jsonResponse(400, { error: "Missing stripe-signature header" });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid signature";
    return jsonResponse(400, { error: message });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const customerId = typeof session.customer === "string" ? session.customer : null;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
      const userId = session.client_reference_id || session.metadata?.user_id || null;

      if (customerId && subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price?.id ?? null;
        const status = subscription.status ?? null;
        const periodEnd = toIso(subscription.current_period_end);

        const values = {
          stripe_customer_id: customerId,
          stripe_subscription_id: subscription.id,
          stripe_price_id: priceId,
          subscription_status: status,
          subscription_current_period_end: periodEnd,
        };

        const { error: byCustomerError } = await updateProfileByCustomer(supabase, customerId, values);

        if (byCustomerError && userId) {
          const { error: byUserError } = await supabase.from("profiles").update(values).eq("user_id", userId);
          if (byUserError) throw byUserError;
        } else if (byCustomerError) {
          throw byCustomerError;
        }
      }
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = typeof subscription.customer === "string" ? subscription.customer : null;

      if (customerId) {
        const priceId = subscription.items.data[0]?.price?.id ?? null;
        const isDeleted = event.type === "customer.subscription.deleted";
        const values = {
          stripe_subscription_id: isDeleted ? null : subscription.id,
          stripe_price_id: isDeleted ? null : priceId,
          subscription_status: isDeleted ? "canceled" : subscription.status,
          subscription_current_period_end: isDeleted ? null : toIso(subscription.current_period_end),
        };

        const { error } = await updateProfileByCustomer(supabase, customerId, values);
        if (error) throw error;
      }
    }

    return jsonResponse(200, { received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed";
    return jsonResponse(500, { error: message });
  }
});
