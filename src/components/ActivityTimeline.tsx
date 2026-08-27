import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, Clock, Video, Zap, Wand2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";

interface AgentTask {
  id: string;
  task_type: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  completed_at: string | null;
  payload: Record<string, any>;
  error_message: string | null;
}

export function ActivityTimeline() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    // Initial fetch
    const fetchTasks = async () => {
      const { data } = await supabase
        .from('agent_tasks')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      
      setTasks(data || []);
      setLoading(false);
    };

    fetchTasks();

    // Subscribe to changes
    const channel = supabase.channel('agent_tasks_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_tasks',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Re-fetch on any change to keep sorting simple
          fetchTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      case 'failed': return <XCircle className="h-5 w-5 text-red-500" />;
      case 'in_progress': return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'pending': return <Clock className="h-5 w-5 text-slate-400" />;
      default: return <Clock className="h-5 w-5 text-slate-400" />;
    }
  };

  const getTaskIcon = (type: string) => {
    switch (type) {
      case 'analyze_youtube_video': return <Video className="h-4 w-4" />;
      case 'generate_opportunity': return <Zap className="h-4 w-4" />;
      case 'run_pipeline': return <Wand2 className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const formatTaskType = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const generateActionSummary = (task: AgentTask) => {
    if (task.status === 'failed') return `Attempted to ${task.task_type.replace(/_/g, ' ')} but encountered an error.`;
    
    switch (task.task_type) {
      case 'analyze_youtube_video':
        return `Analyzed video engagement metrics and extracted viewer sentiment.`;
      case 'generate_opportunity':
        return `Cross-referenced Creator DNA with market trends to discover a new content opportunity.`;
      case 'run_pipeline':
        return `Executed the autonomous content review pipeline for the latest upload.`;
      case 'observe_experiments':
        return `Checked live YouTube APIs to observe active A/B experiment outcomes.`;
      case 'extract_learnings':
        return `Analyzed a completed experiment to extract and save a new Creator Preference.`;
      default:
        return `Autonomously executed ${task.task_type.replace(/_/g, ' ')}.`;
    }
  };

  return (
    <Card className="glass-card mt-6">
      <CardHeader>
        <CardTitle className="text-xl flex items-center gap-2">
          <Zap className="h-5 w-5 text-purple-500" />
          Autonomous Activity Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center p-6 text-slate-500">
            <Clock className="h-12 w-12 mx-auto text-slate-300 mb-3" />
            <p>No autonomous tasks yet.</p>
            <p className="text-sm mt-1">Background tasks will appear here in real-time.</p>
          </div>
        ) : (
          <div className="relative border-l border-slate-200 ml-3 space-y-6 pb-2">
            {tasks.map((task) => (
              <div key={task.id} className="relative pl-6">
                <span className="absolute -left-3 top-1 bg-white rounded-full">
                  {getStatusIcon(task.status)}
                </span>
                
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                      {getTaskIcon(task.task_type)}
                      {formatTaskType(task.task_type)}
                    </span>
                    <Badge variant={
                      task.status === 'completed' ? 'default' :
                      task.status === 'failed' ? 'destructive' :
                      task.status === 'in_progress' ? 'secondary' : 'outline'
                    } className="text-[10px] h-5 px-2">
                      {task.status}
                    </Badge>
                  </div>
                  
                  <div className="text-sm font-mono text-slate-500 flex items-center gap-2">
                    <span className="font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                      {new Date(task.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span>
                      {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
                    </span>
                    {task.completed_at && task.status === 'completed' && (
                      <span className="text-emerald-600 ml-1">
                        (took {Math.round((new Date(task.completed_at).getTime() - new Date(task.created_at).getTime()) / 1000)}s)
                      </span>
                    )}
                  </div>
                  
                  <div className="mt-1 text-sm text-slate-700 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100 leading-relaxed shadow-sm">
                    {generateActionSummary(task)}
                  </div>

                  {task.error_message && (
                    <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">
                      {task.error_message}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
