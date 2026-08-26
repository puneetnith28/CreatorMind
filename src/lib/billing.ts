export type PlanKey = "starter" | "pro";

export interface PlanConfig {
  key: PlanKey;
  name: string;
  price: string;
  period: string;
  envVar: string;
  features: string[];
  recommended?: boolean;
}

export const PLANS: PlanConfig[] = [
  {
    key: "starter",
    name: "Starter",
    price: "$10",
    period: "/month",
    envVar: "VITE_STRIPE_STARTER_PRICE_ID",
    features: ["10 pipeline runs/month", "All artifact types", "Email support", "Basic analytics"],
  },
  {
    key: "pro",
    name: "Pro",
    price: "$25",
    period: "/month",
    envVar: "VITE_STRIPE_PRO_PRICE_ID",
    features: ["50 pipeline runs/month", "All artifact types", "Thumbnail prompt + brief output", "Priority support", "Advanced analytics", "API access"],
    recommended: true,
  },
];

export function getPlanPriceId(plan: PlanConfig): string {
  return import.meta.env[plan.envVar] ?? "";
}

export function resolvePlanName(priceId: string | null): string {
  if (!priceId) return "Free";

  const match = PLANS.find((plan) => getPlanPriceId(plan) === priceId);
  return match?.name ?? "Custom";
}
