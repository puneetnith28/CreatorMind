import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { getPlanPriceId, PLANS, resolvePlanName } from "@/lib/billing";

type ProfileRow = {
  stripe_price_id: string | null;
  subscription_status: string | null;
  subscription_current_period_end: string | null;
};

async function readFunctionErrorMessage(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : "Unknown error";
  const maybe = error as { context?: { json?: () => Promise<{ error?: string }> } };
  if (!maybe.context?.json) return fallback;
  const payload = await maybe.context.json().catch(() => null);
  return payload?.error || fallback;
}

export default function Billing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [runsUsed, setRunsUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const fetchBillingData = async () => {
    if (!user) return;

    setLoading(true);

    const now = new Date();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [{ data: profileData, error: profileError }, { count: runCount, error: runError }] = await Promise.all([
      supabase
        .from("profiles")
        .select("stripe_price_id, subscription_status, subscription_current_period_end")
        .eq("user_id", user.id)
        .single(),
      supabase.from("runs").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("started_at", periodStart),
    ]);

    if (profileError) {
      toast({ title: "Error", description: profileError.message, variant: "destructive" });
    }

    if (runError) {
      toast({ title: "Error", description: runError.message, variant: "destructive" });
    }

    setProfile(profileData || null);
    setRunsUsed(runCount || 0);
    setLoading(false);
  };

  useEffect(() => {
    fetchBillingData();
  }, [user]);

  const currentPlanName = resolvePlanName(profile?.stripe_price_id ?? null);
  const statusText = profile?.subscription_status ?? "inactive";
  const nextBilling = profile?.subscription_current_period_end
    ? format(new Date(profile.subscription_current_period_end), "MMM d, yyyy")
    : "-";

  const planLimit = useMemo(() => {
    if (currentPlanName === "Pro") return 50;
    if (currentPlanName === "Starter") return 10;
    return 0;
  }, [currentPlanName]);

  const startCheckout = async (priceId: string) => {
    if (!priceId) {
      toast({
        title: "Missing price ID",
        description: "Set VITE_STRIPE_STARTER_PRICE_ID and VITE_STRIPE_PRO_PRICE_ID in env.",
        variant: "destructive",
      });
      return;
    }

    setCheckoutLoading(priceId);

    const origin = window.location.origin;
    const { data, error } = await supabase.functions.invoke("create-checkout-session", {
      body: {
        priceId,
        successUrl: `${origin}/billing?checkout=success`,
        cancelUrl: `${origin}/billing?checkout=cancel`,
      },
    });

    if (error) {
      const description = await readFunctionErrorMessage(error);
      toast({ title: "Checkout failed", description, variant: "destructive" });
      setCheckoutLoading(null);
      return;
    }

    const url = (data as { url?: string })?.url;
    if (!url) {
      toast({ title: "Checkout failed", description: "No checkout URL returned", variant: "destructive" });
      setCheckoutLoading(null);
      return;
    }

    window.location.href = url;
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <Card className="glass-card">
          <CardContent className="pt-6">
            <h1 className="text-3xl md:text-4xl font-display font-bold">Billing</h1>
            <p className="text-slate-500 mt-1">Manage subscription status, limits, and plan upgrades.</p>
          </CardContent>
        </Card>

        <Card className="surface-card">
          <CardHeader>
            <CardTitle className="font-display">Current Usage</CardTitle>
            <CardDescription>Your usage this billing period</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <p className="text-sm text-slate-500">Runs Used</p>
                  <p className="text-3xl font-bold font-display text-slate-900">
                    {runsUsed}
                    {planLimit > 0 ? ` / ${planLimit}` : ""}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Current Plan</p>
                  <div className="flex items-center gap-2">
                    <p className="text-3xl font-bold font-display text-slate-900">{currentPlanName}</p>
                    <Badge variant={statusText === "active" || statusText === "trialing" ? "default" : "secondary"}>{statusText}</Badge>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Next Billing</p>
                  <p className="text-3xl font-bold font-display text-slate-900">{nextBilling}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {PLANS.map((plan) => {
            const priceId = getPlanPriceId(plan);
            const isCurrent = profile?.stripe_price_id === priceId;

            return (
              <Card key={plan.key} className={plan.recommended ? "surface-card border-blue-300 shadow-[0_24px_40px_-30px_rgba(59,130,246,0.5)]" : "surface-card"}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="font-display">{plan.name}</CardTitle>
                    {isCurrent && <Badge variant="secondary">Current</Badge>}
                    {plan.recommended && <Badge>Recommended</Badge>}
                  </div>
                  <div className="mt-2">
                    <span className="text-4xl font-bold font-display text-slate-900">{plan.price}</span>
                    <span className="text-slate-500">{plan.period}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 mb-6">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center text-sm">
                        <Check className="mr-2 h-4 w-4 text-success" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full" variant={isCurrent ? "outline" : "default"} disabled={isCurrent || checkoutLoading === priceId} onClick={() => startCheckout(priceId)}>
                    {isCurrent ? "Current Plan" : checkoutLoading === priceId ? "Redirecting..." : "Upgrade"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </AppLayout>
  );
}
