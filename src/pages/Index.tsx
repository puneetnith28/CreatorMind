import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, ArrowRight, Brain, CheckCircle2, Sparkles, Youtube, Target, Zap, Clock, RefreshCw } from "lucide-react";

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
    <div className="min-h-screen relative overflow-hidden bg-slate-50">
      {/* Seamless Grid Background across the whole screen */}
      <div className="absolute inset-0 z-0 h-full w-full bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px]"></div>

      <div className="hero-orb h-[30rem] w-[30rem] bg-indigo-300/20 left-[-10rem] top-[-10rem] z-0" />
      <div className="hero-orb h-[35rem] w-[35rem] bg-purple-300/20 right-[-15rem] top-[10rem] z-0" />

      <header className="sticky top-0 z-50 w-full border-b border-slate-200/50 bg-white/50 backdrop-blur-md">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="pulse-dot bg-indigo-500 relative">
              <span className="absolute inset-0 rounded-full animate-ping bg-indigo-500/40" />
            </span>
            <span className="font-display font-bold text-xl tracking-tight text-slate-900">CreatorMind</span>
          </div>
          <div className="flex items-center gap-4">
            <Link to="/auth" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
              Log in
            </Link>
            <Button asChild size="sm" className="rounded-full px-5 shadow-sm hover:shadow-md transition-all">
              <Link to="/auth">Sign Up</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 pt-16 pb-24 space-y-24">
        {/* Hero Section */}
        <section className="text-center max-w-4xl mx-auto space-y-8 mt-10 relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200/60 bg-white/60 px-4 py-1.5 text-sm font-medium text-indigo-700 shadow-sm backdrop-blur-md hover:bg-white/80 transition-colors cursor-default">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            Creative Minds Jam #1: Hong Kong
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-bold leading-[1.1] tracking-tight text-slate-900">
            Your Autonomous AI <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">
              Growth Manager
            </span>
          </h1>

          <p className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            An AI that remembers you, watches your YouTube channel, learns what works, and comes back with the next move.
          </p>

          <div className="flex items-center justify-center gap-4 pt-4">
            <Button asChild size="lg" className="rounded-full px-8 h-12 shadow-lg hover:shadow-xl hover:-translate-y-0.5 transition-all bg-indigo-600 hover:bg-indigo-700 text-base">
              <Link to="/auth">
                Start Growing
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </section>

        {/* The Loop Visualization */}
        <section className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-display font-bold text-slate-900 mb-3">How It Works</h2>
            <p className="text-slate-600">The continuous loop that powers your channel's growth.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 relative">
            <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-gradient-to-r from-indigo-100 via-purple-100 to-emerald-100 -translate-y-1/2 z-0" />
            
            {[
              { icon: Target, title: "Creator Goal", desc: "Define your niche & audience" },
              { icon: Youtube, title: "YouTube Signal", desc: "Worker detects audience trends" },
              { icon: Zap, title: "Opportunity", desc: "AI proposes the next video" },
              { icon: Activity, title: "Experiment", desc: "Test A/B hooks & titles" },
              { icon: Brain, title: "Mind Learning", desc: "Adapts to what wins" },
            ].map((step, i) => (
              <div key={step.title} className="relative z-10 flex flex-col items-center text-center group">
                <div className="h-16 w-16 rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center mb-4 transition-transform group-hover:-translate-y-1 group-hover:shadow-md">
                  <step.icon className="h-7 w-7 text-indigo-500" />
                </div>
                <h3 className="font-semibold text-slate-900 mb-1">{step.title}</h3>
                <p className="text-xs text-slate-500 px-2">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* The 3 Pillars */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto relative z-10">
          <Card className="glass-card hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_rgba(79,70,229,0.15)] transition-all duration-300 overflow-hidden group">
            <div className="h-1.5 w-full bg-gradient-to-r from-indigo-400 to-indigo-600" />
            <CardContent className="p-8">
              <div className="h-14 w-14 rounded-2xl bg-indigo-50/80 border border-indigo-100/50 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-indigo-100 transition-all duration-300 shadow-sm">
                <Brain className="h-7 w-7 text-indigo-600" />
              </div>
              <h3 className="text-2xl font-display font-bold text-slate-900 mb-3 group-hover:text-indigo-700 transition-colors">Persistent Memory</h3>
              <p className="text-slate-600 leading-relaxed mb-6">
                Unlike one-shot chatbots, CreatorMind maintains a persistent <strong>Creator DNA</strong>. It remembers your style, tone, and past feedback, meaning you never have to repeat yourself.
              </p>
              <ul className="space-y-3">
                {["Remembers your niche", "Adapts to feedback", "Stores past winners"].map(item => (
                  <li key={item} className="flex items-center text-sm font-medium text-slate-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mr-2 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="glass-card hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_rgba(147,51,234,0.15)] transition-all duration-300 overflow-hidden group">
            <div className="h-1.5 w-full bg-gradient-to-r from-purple-400 to-purple-600" />
            <CardContent className="p-8">
              <div className="h-14 w-14 rounded-2xl bg-purple-50/80 border border-purple-100/50 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-purple-100 transition-all duration-300 shadow-sm">
                <RefreshCw className="h-7 w-7 text-purple-600" />
              </div>
              <h3 className="text-2xl font-display font-bold text-slate-900 mb-3 group-hover:text-purple-700 transition-colors">Continuity</h3>
              <p className="text-slate-600 leading-relaxed mb-6">
                Your AI Growth Manager lives across sessions. Close the tab, come back tomorrow, and the Mind continues exactly from its previous state, learning from new experiment outcomes.
              </p>
              <ul className="space-y-3">
                {["Cross-session memory", "Experiment outcome tracking", "Continuous improvement"].map(item => (
                  <li key={item} className="flex items-center text-sm font-medium text-slate-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mr-2 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="glass-card hover:-translate-y-1 hover:shadow-[0_20px_40px_-15px_rgba(16,185,129,0.15)] transition-all duration-300 overflow-hidden group">
            <div className="h-1.5 w-full bg-gradient-to-r from-emerald-400 to-emerald-600" />
            <CardContent className="p-8">
              <div className="h-14 w-14 rounded-2xl bg-emerald-50/80 border border-emerald-100/50 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-emerald-100 transition-all duration-300 shadow-sm">
                <Clock className="h-7 w-7 text-emerald-600" />
              </div>
              <h3 className="text-2xl font-display font-bold text-slate-900 mb-3 group-hover:text-emerald-700 transition-colors">Autonomous Follow-up</h3>
              <p className="text-slate-600 leading-relaxed mb-6">
                You step away. The background worker runs. A new audience trend is detected on YouTube. The Mind acts. When you return, the next perfect video opportunity is waiting.
              </p>
              <ul className="space-y-3">
                {["Background signal polling", "Automated opportunity creation", "Proactive recommendations"].map(item => (
                  <li key={item} className="flex items-center text-sm font-medium text-slate-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mr-2 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
        
        {/* Interactive Timeline Mockup */}
        <section className="max-w-4xl mx-auto pt-10 relative z-10">
          <Card className="glass-card overflow-hidden shadow-2xl border-slate-200/50">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-indigo-400" />
                <h3 className="text-white font-medium">Activity Timeline</h3>
              </div>
              <span className="text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1 font-mono">Worker Online</span>
            </div>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                <div className="p-6 flex items-start gap-4 hover:bg-slate-50 transition-colors">
                  <div className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">New audience signal detected</p>
                    <p className="text-sm text-slate-500 mt-1">Worker identified high-urgency comments regarding "deploying AI agents".</p>
                    <p className="text-xs text-slate-400 mt-2 font-mono">2 mins ago</p>
                  </div>
                </div>
                <div className="p-6 flex items-start gap-4 hover:bg-slate-50 transition-colors">
                  <div className="mt-1 h-2.5 w-2.5 rounded-full bg-purple-500 shrink-0 shadow-[0_0_8px_rgba(168,85,247,0.6)]" />
                  <div>
                    <p className="text-sm font-medium text-slate-900">Creator DNA matched</p>
                    <p className="text-sm text-slate-500 mt-1">Signal perfectly aligns with your goal: "Grow AI/programming audience".</p>
                    <p className="text-xs text-slate-400 mt-2 font-mono">1 min ago</p>
                  </div>
                </div>
                <div className="p-6 flex items-start gap-4 bg-indigo-50/30 hover:bg-indigo-50/50 transition-colors">
                  <div className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse" />
                  <div>
                    <p className="text-sm font-medium text-slate-900 flex items-center gap-2">
                      Growth opportunity identified <Sparkles className="h-4 w-4 text-emerald-500" />
                    </p>
                    <p className="text-sm text-slate-500 mt-1">Generated full content strategy for: "How to Deploy AI Agents in Production"</p>
                    <div className="mt-3">
                      <Button size="sm" variant="outline" className="bg-white hover:bg-slate-50 h-8 text-xs" asChild>
                        <Link to="/auth">Review Opportunity</Link>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/50 bg-white/50 backdrop-blur-md py-8 relative z-10">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-slate-500">© 2026 CreatorMind. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <Link to="/privacy" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
