import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Brain, CheckCircle2, Play, Search, AlertCircle, FileText } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type MindState = "DISCOVERING" | "GENERATING" | "AWAITING_APPROVAL" | "LOADING";

export function AgentStateMachine() {
  const { user } = useAuth();
  const [mindState, setMindState] = useState<MindState>("LOADING");
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [pendingArtifactsCount, setPendingArtifactsCount] = useState(0);
  const [hasPendingOpportunity, setHasPendingOpportunity] = useState(false);

  const fetchState = async () => {
    if (!user) return;

    // 1. Check for running pipeline
    const { data: runs } = await supabase
      .from("runs")
      .select("id, video_id")
      .eq("status", "running")
      .eq("user_id", user.id)
      .limit(1);

    const isRunning = runs && runs.length > 0;
    if (isRunning) {
      setActiveRunId(runs[0].id);
      setActiveVideoId(runs[0].video_id);
      setMindState("GENERATING");
      return;
    }

    // 2. Check for pending artifacts
    const { data: artifacts, count: artifactCount } = await supabase
      .from("artifacts")
      .select("id, run_id", { count: "exact", head: true })
      .eq("approval_status", "pending");

    if (artifactCount && artifactCount > 0) {
      // Find which run this belongs to, just taking the first one to link if possible
      const { data: sampleArt } = await supabase
        .from("artifacts")
        .select("run_id, runs(video_id)")
        .eq("approval_status", "pending")
        .limit(1)
        .single();
      
      if (sampleArt?.runs?.video_id) {
        setActiveVideoId(sampleArt.runs.video_id);
      }
      
      setPendingArtifactsCount(artifactCount);
      setMindState("AWAITING_APPROVAL");
      return;
    }

    // 3. Check for pending opportunities
    const { data: opportunities, count: oppCount } = await supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    if (oppCount && oppCount > 0) {
      setHasPendingOpportunity(true);
      setMindState("AWAITING_APPROVAL");
      return;
    }

    // 4. Default to Discovering
    setMindState("DISCOVERING");
    setActiveRunId(null);
    setActiveVideoId(null);
    setPendingArtifactsCount(0);
    setHasPendingOpportunity(false);
  };

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 10000);
    return () => clearInterval(interval);
  }, [user]);

  if (mindState === "LOADING") return null;

  return (
    <Card className="border-indigo-500/30 bg-gradient-to-r from-indigo-50/50 via-purple-50/30 to-indigo-50/50 shadow-sm mb-6 overflow-hidden relative">
      <div className="absolute top-0 left-0 w-1 bg-indigo-500 h-full"></div>
      <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="h-12 w-12 rounded-full bg-white shadow-sm border border-indigo-100 flex items-center justify-center relative z-10">
              <Brain className="h-6 w-6 text-indigo-600" />
            </div>
            {mindState === "GENERATING" && (
              <>
                <span className="absolute inset-0 rounded-full animate-ping bg-indigo-300/60 z-0"></span>
                <span className="absolute -bottom-1 -right-1 h-4 w-4 bg-emerald-500 rounded-full border-2 border-white z-20 shadow-sm"></span>
              </>
            )}
            {mindState === "DISCOVERING" && (
              <>
                <span className="absolute inset-0 rounded-full animate-pulse bg-blue-200/60 z-0 duration-2000"></span>
                <span className="absolute -bottom-1 -right-1 h-4 w-4 bg-blue-500 rounded-full border-2 border-white z-20 shadow-sm"></span>
              </>
            )}
            {mindState === "AWAITING_APPROVAL" && (
              <>
                <span className="absolute inset-0 rounded-full bg-amber-200/40 z-0"></span>
                <span className="absolute -bottom-1 -right-1 h-4 w-4 bg-amber-500 rounded-full border-2 border-white z-20 shadow-sm"></span>
              </>
            )}
          </div>
          
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-display font-semibold text-lg text-slate-900">CreatorMind Status</h3>
              <Badge variant="outline" className={
                mindState === "GENERATING" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                mindState === "DISCOVERING" ? "bg-blue-50 text-blue-700 border-blue-200" :
                "bg-amber-50 text-amber-700 border-amber-200"
              }>
                {mindState}
              </Badge>
            </div>
            
            {mindState === "GENERATING" && (
              <p className="text-sm text-slate-600 flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-indigo-500 animate-pulse" />
                Specialist agents are actively generating a content package.
              </p>
            )}
            {mindState === "DISCOVERING" && (
              <p className="text-sm text-slate-600 flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5 text-blue-500" />
                Analyzing audience data to detect the next strategic opportunity...
              </p>
            )}
            {mindState === "AWAITING_APPROVAL" && (
              <p className="text-sm text-slate-600 flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                {hasPendingOpportunity 
                  ? "A new strategic opportunity requires your review."
                  : `${pendingArtifactsCount} generated artifact(s) are awaiting your feedback.`}
              </p>
            )}
          </div>
        </div>

        <div className="flex-shrink-0">
          {mindState === "GENERATING" && activeVideoId && (
            <Link to={`/video/${activeVideoId}`} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 border border-input bg-white hover:bg-slate-100 hover:text-slate-900 h-9 px-4 py-2">
              <Play className="h-4 w-4 mr-2 text-indigo-500" />
              View Run Progress
            </Link>
          )}
          {mindState === "AWAITING_APPROVAL" && activeVideoId && !hasPendingOpportunity && (
            <Link to={`/video/${activeVideoId}`} className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-amber-500 text-primary-foreground hover:bg-amber-600 shadow-sm h-9 px-4 py-2">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Review Artifacts
            </Link>
          )}
          {/* If the state is DISCOVERING or pending opportunity, they just stay on the dashboard because OpportunityEngine is here */}
          {mindState === "DISCOVERING" && (
            <div className="text-xs font-mono bg-white/60 px-3 py-1.5 rounded border border-indigo-100 text-indigo-800">
              Agent Background Loop Active
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
