import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, FlaskConical, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export function MindMemoryUI() {
  const { user } = useAuth();
  const [memories, setMemories] = useState<any[]>([]);
  const [experiments, setExperiments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    async function fetchData() {
      const [memRes, expRes] = await Promise.all([
        supabase.from("agent_memory").select("*").eq("user_id", user.id).eq("source", "experiment").order("created_at", { ascending: false }),
        supabase.from("experiments").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5)
      ]);
      
      if (memRes.data) setMemories(memRes.data);
      if (expRes.data) setExperiments(expRes.data);
      setLoading(false);
    }
    
    fetchData();
  }, [user]);

  if (loading) return <div className="animate-pulse h-32 bg-slate-100 rounded-xl" />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Brain className="w-5 h-5 text-purple-600" />
            Creator Preferences (Learned Rules)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {memories.length === 0 ? (
            <p className="text-sm text-slate-500">The Mind has not learned any rules from experiments yet.</p>
          ) : (
            <div className="space-y-4">
              {memories.map(m => (
                <div key={m.id} className="p-4 bg-purple-50 rounded-lg border border-purple-100">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-purple-600" />
                    <span className="font-semibold text-purple-900">Proven Preference</span>
                    <Badge variant="outline" className="bg-white ml-auto">Priority: {m.priority}</Badge>
                  </div>
                  <p className="text-sm text-purple-800">{m.value?.learning}</p>
                  <div className="mt-3 text-xs text-purple-600 flex gap-4">
                    <span>Hypothesis: {m.value?.hypothesis}</span>
                    <span>Winning Variant: {m.value?.winning_variant}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FlaskConical className="w-5 h-5 text-blue-600" />
            Recent Experiments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {experiments.length === 0 ? (
            <p className="text-sm text-slate-500">No experiments have been proposed yet.</p>
          ) : (
            <div className="space-y-3">
              {experiments.map(exp => (
                <div key={exp.id} className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-900 text-sm">{exp.hypothesis}</span>
                    <Badge variant={exp.status === 'completed' ? 'default' : 'secondary'}>
                      {exp.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-slate-50 rounded border border-slate-100">
                      <span className="text-slate-500 block mb-1">Variant A</span>
                      <span className={exp.winner === 'A' ? 'font-bold text-green-600' : 'text-slate-700'}>{exp.variant_a}</span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded border border-slate-100">
                      <span className="text-slate-500 block mb-1">Variant B</span>
                      <span className={exp.winner === 'B' ? 'font-bold text-green-600' : 'text-slate-700'}>{exp.variant_b}</span>
                    </div>
                  </div>
                  {exp.status === 'completed' && (
                    <div className="mt-2 text-xs text-slate-500">
                      <strong>Winner:</strong> {exp.winner} | <strong>Final Views:</strong> {exp.success_metric?.final_views || 0}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
