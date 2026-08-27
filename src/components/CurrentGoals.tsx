import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, TrendingUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";

export function CurrentGoals() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    
    async function fetchGoals() {
      const { data } = await supabase
        .from("creator_goals")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
        
      if (data) setGoals(data);
      setLoading(false);
    }
    
    fetchGoals();
  }, [user]);

  if (loading) return <div className="animate-pulse h-24 bg-slate-100 rounded-xl" />;
  if (goals.length === 0) return null; // Don't show if no goals

  return (
    <Card className="glass-card mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Target className="w-5 h-5 text-indigo-500" />
          Active Creator Goals
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {goals.map(goal => (
            <div key={goal.id} className="p-4 bg-white/50 border border-slate-200 rounded-lg flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold block mb-1">
                  {goal.goal_type.replace(/_/g, ' ')}
                </span>
                <span className="font-medium text-slate-900">
                  {goal.current_value} <span className="text-slate-400 mx-1">â†’</span> {goal.target_metric}
                </span>
              </div>
              <Badge variant={goal.status === 'active' ? 'default' : 'secondary'} className="ml-4">
                {goal.status}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
