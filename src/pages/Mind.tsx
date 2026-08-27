import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Brain, Dna, Lightbulb, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";

export default function Mind() {
  const { user } = useAuth();
  const [dna, setDna] = useState<any>(null);
  const [memories, setMemories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    async function fetchData() {
      const [dnaRes, memRes] = await Promise.all([
        supabase.from("creator_dna").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("agent_memory").select("*").eq("user_id", user.id).order("priority", { ascending: false })
      ]);
      
      if (dnaRes.data) setDna(dnaRes.data);
      if (memRes.data) setMemories(memRes.data);
      setLoading(false);
    }
    
    fetchData();
  }, [user]);

  if (loading) {
    return (
      <AppLayout>
        <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
          <div className="h-40 bg-slate-100 rounded-xl" />
          <div className="h-64 bg-slate-100 rounded-xl" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl md:text-4xl font-display font-bold flex items-center gap-3">
            <Brain className="w-8 h-8 text-indigo-600" />
            What Your Mind Knows
          </h1>
          <p className="text-slate-500 mt-2 text-lg">
            A transparent view into the core identity, learned preferences, and scientific patterns your autonomous agent has built.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Creator DNA Section */}
          <Card className="glass-card shadow-sm border-indigo-100/50">
            <CardHeader className="bg-indigo-50/50 border-b border-indigo-100/50 pb-4">
              <CardTitle className="flex items-center gap-2 text-indigo-900">
                <Dna className="w-5 h-5 text-indigo-600" />
                Creator DNA
              </CardTitle>
              <p className="text-sm text-indigo-700 opacity-80 mt-1">The foundational identity driving all decisions.</p>
            </CardHeader>
            <CardContent className="pt-6 space-y-5">
              {dna ? (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Niche & Focus</h3>
                    <p className="text-slate-900 font-medium">{dna.niche}</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Target Audience</h3>
                    <p className="text-slate-900">{dna.target_audience}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <Sparkles className="w-4 h-4 text-amber-500" /> Content Tone
                      </h3>
                      <p className="text-slate-900">{dna.content_tone}</p>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                        <ShieldAlert className="w-4 h-4 text-red-500" /> Topics to Avoid
                      </h3>
                      <p className="text-slate-900">{dna.topics_to_avoid}</p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-slate-500">No Creator DNA established yet.</p>
              )}
            </CardContent>
          </Card>

          {/* Learned Preferences & Patterns */}
          <Card className="glass-card shadow-sm border-purple-100/50">
            <CardHeader className="bg-purple-50/50 border-b border-purple-100/50 pb-4">
              <CardTitle className="flex items-center gap-2 text-purple-900">
                <Lightbulb className="w-5 h-5 text-purple-600" />
                Learned Preferences & Patterns
              </CardTitle>
              <p className="text-sm text-purple-700 opacity-80 mt-1">Rules dynamically learned from your feedback and scientific experiments.</p>
            </CardHeader>
            <CardContent className="pt-6 space-y-4 max-h-[500px] overflow-y-auto">
              {memories.length > 0 ? (
                memories.map((mem) => (
                  <div key={mem.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex items-center gap-2">
                        {mem.source === 'experiment' ? (
                          <Badge className="bg-green-100 text-green-800 hover:bg-green-200 border-green-200">
                            <TrendingUp className="w-3 h-3 mr-1" /> Proven Experiment
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-white">
                            Human Feedback
                          </Badge>
                        )}
                        <span className="text-xs text-slate-400 font-mono hidden sm:inline-block">{mem.key}</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-500 bg-slate-200/50 px-2 py-1 rounded-md">
                        Weight: {mem.priority}
                      </span>
                    </div>
                    
                    {mem.source === 'experiment' ? (
                      <p className="text-slate-800 text-sm font-medium leading-relaxed">
                        {mem.value?.learning}
                      </p>
                    ) : (
                      <p className="text-slate-800 text-sm font-medium leading-relaxed">
                        {mem.value?.latest_free_text || `Avoided issue: ${mem.value?.latest_reason_code}`}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-10">
                  <p className="text-slate-500">The Mind has not learned any specific preferences yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
