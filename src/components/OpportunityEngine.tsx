import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Check, X, BrainCircuit, Microscope } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Opportunity {
  id: string;
  title: string;
  description: string;
  reasoning: string;
  evidence: string[];
  status: string;
}

export function OpportunityEngine() {
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchOpportunity = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("opportunities")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== "PGRST116") {
      console.error("Error fetching opportunity:", error);
    } else {
      setOpportunity(data as Opportunity | null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchOpportunity();
  }, []);

  const handleAction = async (id: string, action: "approved" | "rejected") => {
    const { error } = await supabase
      .from("opportunities")
      .update({ status: action })
      .eq("id", id);

    if (error) {
      toast({
        title: "Action failed",
        description: error.message,
        variant: "destructive"
      });
      return;
    }

    toast({
      title: action === "approved" ? "Opportunity Approved!" : "Opportunity Rejected",
      description: action === "approved" ? "This is now an active goal." : "We'll look for other opportunities.",
    });

    setOpportunity(null);
    fetchOpportunity();
  };

  if (loading || !opportunity) return null;

  return (
    <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-50/50 to-emerald-100/30 shadow-lg shadow-emerald-500/5 mb-6">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-5 w-5 text-emerald-600" />
          <Badge variant="outline" className="bg-emerald-100 text-emerald-700 border-emerald-200">
            AI Opportunity Detected
          </Badge>
        </div>
        <CardTitle className="text-2xl font-display text-emerald-950 leading-tight">
          {opportunity.title}
        </CardTitle>
        <CardDescription className="text-emerald-800/80 text-base">
          {opportunity.description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="bg-white/80 rounded-xl p-5 text-sm text-emerald-950 border border-emerald-200 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
            <div className="flex items-center gap-2 mb-3">
              <BrainCircuit className="w-5 h-5 text-emerald-600" />
              <span className="font-bold text-base block">Why Did I Do This? (Mind Rationale)</span>
            </div>
            <p className="leading-relaxed mb-4 text-emerald-800">
              {opportunity.reasoning}
            </p>
            
            {opportunity.evidence && opportunity.evidence.length > 0 && (
              <div className="bg-emerald-50/50 p-3 rounded-lg border border-emerald-100">
                <span className="font-semibold text-emerald-900 mb-2 flex items-center gap-1.5">
                  <Microscope className="w-4 h-4 text-emerald-600" />
                  Supporting Evidence & DNA Alignment:
                </span>
                <ul className="space-y-1.5 ml-1">
                  {opportunity.evidence.map((ev, i) => (
                    <li key={i} className="flex items-start gap-2 text-emerald-800/90">
                      <span className="text-emerald-500 mt-0.5">•</span>
                      <span className="leading-tight">{ev}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button 
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => handleAction(opportunity.id, "approved")}
            >
              <Check className="h-4 w-4 mr-2" />
              Accept Strategy
            </Button>
            <Button 
              variant="outline"
              className="border-emerald-200 text-emerald-700 hover:bg-emerald-100"
              onClick={() => handleAction(opportunity.id, "rejected")}
            >
              <X className="h-4 w-4 mr-2" />
              Dismiss
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
