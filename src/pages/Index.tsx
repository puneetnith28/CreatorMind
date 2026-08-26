import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, ArrowRight, Brain, CheckCircle2, Sparkles } from "lucide-react";

const valueProps = [
  "4+1 specialist orchestration for hooks, scripts, titles, and strategy",
  "Deterministic feedback memory that improves future runs automatically",
  "Per-agent observability: latency, tokens, costs, status, prompts",
  "YouTube + OpenClaw insight ingestion for continuous channel adaptation",
];

const pipelineAgents = [
  { name: "HookAgent", status: "running", color: "bg-blue-500", ping: "bg-blue-300/70" },
  { name: "ScriptAgent", status: "running", color: "bg-purple-500", ping: "bg-purple-300/70" },
  { name: "TitleAgent", status: "completed", color: "bg-emerald-500", ping: "bg-emerald-300/70" },
  { name: "StrategyAgent", status: "running", color: "bg-orange-500", ping: "bg-orange-300/70" },
];

export default function Index() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen relative overflow-hidden px-5 py-10 md:px-10">
      <div className="hero-orb h-80 w-80 bg-blue-300/30 left-[-8rem] top-[-4rem]" />
      <div className="hero-orb h-96 w-96 bg-purple-300/25 right-[-10rem] top-[-5rem]" />

      <main className="max-w-6xl mx-auto space-y-8">
        <section className="glass-card p-6 md:p-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/85 px-3 py-1 text-xs font-medium text-slate-600">
                <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                UK AI Agent Hackathon EP4
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold leading-[1.05]">
                Multi-Agent
                <br />
                <span className="text-slate-700">Content Autopilot</span>
              </h1>

              <p className="text-base md:text-lg text-slate-600 max-w-2xl">
                Turn one creator idea into coordinated outputs, review each artifact, and continuously improve with
                memory-aware agents plus production observability.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link to="/auth">
                    Get Started
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link to="/auth">Log In</Link>
                </Button>
              </div>
            </div>

            <Card className="surface-card">
              <CardContent className="p-5 md:p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-500" />
                    <p className="text-sm font-semibold text-slate-900">Pipeline Activity</p>
                  </div>
                  <span className="text-xs rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5">Live</span>
                </div>

                <div className="space-y-3">
                  {pipelineAgents.map((agent) => (
                    <div key={agent.name} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className={`pulse-dot ${agent.color}`}>
                          <span className={`absolute inset-0 rounded-full animate-ping ${agent.ping}`} />
                        </span>
                        <span className="text-sm font-medium text-slate-800">{agent.name}</span>
                      </div>
                      <span className="text-xs text-slate-500 capitalize">{agent.status}</span>
                    </div>
                  ))}
                </div>

                <div className="rounded-xl bg-slate-900 p-4">
                  <p className="font-mono text-xs text-emerald-300">
                    trace_url: webapp.anyway.sh/traces/... <br />
                    total_tokens: 1,003 <br />
                    run_status: completed
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {valueProps.map((item) => (
            <Card key={item}>
              <CardContent className="pt-5 flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
                <p className="font-medium text-slate-800">{item}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 text-blue-600 mb-2">
                <Brain className="h-4 w-4" />
                <p className="text-sm font-semibold">Animoca Minds</p>
              </div>
              <p className="text-sm text-slate-600">Identity, memory, and cognition through specialized long-lived agent loops.</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 text-purple-600 mb-2">
                <Activity className="h-4 w-4" />
                <p className="text-sm font-semibold">Anyway</p>
              </div>
              <p className="text-sm text-slate-600">Per-agent cost and performance observability with trace linkability.</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2 text-emerald-600 mb-2">
                <Sparkles className="h-4 w-4" />
                <p className="text-sm font-semibold">OpenClaw</p>
              </div>
              <p className="text-sm text-slate-600">Background worker loop for ingestion and iterative external insight updates.</p>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
