import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Video, Zap, TrendingUp, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface VideoRow {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
}

async function readFunctionErrorMessage(error: unknown): Promise<string> {
  const fallback = error instanceof Error ? error.message : "Unknown error";
  const maybe = error as { context?: { json?: () => Promise<{ error?: string }> } };
  if (!maybe.context?.json) return fallback;
  const payload = await maybe.context.json().catch(() => null);
  return payload?.error || fallback;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [titleSuggestion, setTitleSuggestion] = useState("");
  const [descriptionSuggestion, setDescriptionSuggestion] = useState("");
  const [suggestingTarget, setSuggestingTarget] = useState<"title" | "description" | null>(null);
  const [runCounts, setRunCounts] = useState<Record<string, number>>({});

  const fetchVideos = async () => {
    const { data } = await supabase.from("videos").select("*").order("created_at", { ascending: false });
    setVideos(data || []);

    // Fetch run counts for each video
    if (data && data.length > 0) {
      const { data: runs } = await supabase.from("runs").select("video_id");
      const counts: Record<string, number> = {};
      (runs || []).forEach((r: any) => {
        counts[r.video_id] = (counts[r.video_id] || 0) + 1;
      });
      setRunCounts(counts);
    }
    setLoading(false);
  };

  useEffect(() => { fetchVideos(); }, []);

  const createVideo = async () => {
    if (!newTitle.trim() || !user) return;
    const { error } = await supabase.from("videos").insert({ title: newTitle.trim(), description: newDesc.trim() || null, user_id: user.id });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setNewTitle("");
      setNewDesc("");
      setTitleSuggestion("");
      setDescriptionSuggestion("");
      setDialogOpen(false);
      fetchVideos();
    }
  };

  const suggestCopy = async (target: "title" | "description") => {
    setSuggestingTarget(target);
    const { data, error } = await supabase.functions.invoke("suggest-video-copy", {
      body: {
        target,
        currentText: target === "title" ? newTitle : newDesc,
        contextText: target === "title" ? newDesc : newTitle,
      },
    });

    if (error || (data as { error?: string } | null)?.error) {
      const description = error ? await readFunctionErrorMessage(error) : (data as { error?: string } | null)?.error || "Unknown error";
      toast({
        title: "Suggestion failed",
        description,
        variant: "destructive",
      });
      setSuggestingTarget(null);
      return;
    }

    const suggestion = ((data as { suggestion?: string } | null)?.suggestion || "").trim();
    if (!suggestion) {
      toast({ title: "Suggestion failed", description: "No suggestion returned", variant: "destructive" });
      setSuggestingTarget(null);
      return;
    }

    if (target === "title") {
      setTitleSuggestion(suggestion);
    } else {
      setDescriptionSuggestion(suggestion);
    }

    setSuggestingTarget(null);
  };

  const totalRuns = Object.values(runCounts).reduce((a, b) => a + b, 0);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <Card className="glass-card">
          <CardContent className="pt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-display font-bold">Dashboard</h1>
              <p className="text-slate-500 mt-1">Create, run, and iterate every content project from one workspace.</p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />New Video</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create Video Project</DialogTitle></DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Title</Label>
                      <Button variant="outline" size="sm" onClick={() => suggestCopy("title")} disabled={suggestingTarget !== null}>
                        <Wand2 className="mr-2 h-3.5 w-3.5" />
                        {suggestingTarget === "title" ? "Suggesting..." : "Suggest Title"}
                      </Button>
                    </div>
                    <Input placeholder="e.g. I tried to learn guitar in 24 hours" value={newTitle} onChange={e => setNewTitle(e.target.value)} />
                    {titleSuggestion && (
                      <div className="rounded-xl border border-slate-200 bg-white/90 p-3">
                        <p className="text-xs text-slate-500 mb-1">Suggested Title</p>
                        <p className="text-sm text-slate-800">{titleSuggestion}</p>
                        <Button size="sm" variant="secondary" className="mt-2" onClick={() => setNewTitle(titleSuggestion)}>Apply</Button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Idea / Description</Label>
                      <Button variant="outline" size="sm" onClick={() => suggestCopy("description")} disabled={suggestingTarget !== null}>
                        <Wand2 className="mr-2 h-3.5 w-3.5" />
                        {suggestingTarget === "description" ? "Suggesting..." : "Suggest Description"}
                      </Button>
                    </div>
                    <Textarea placeholder="Describe your video concept..." value={newDesc} onChange={e => setNewDesc(e.target.value)} />
                    {descriptionSuggestion && (
                      <div className="rounded-xl border border-slate-200 bg-white/90 p-3">
                        <p className="text-xs text-slate-500 mb-1">Suggested Description</p>
                        <p className="text-sm whitespace-pre-wrap text-slate-800">{descriptionSuggestion}</p>
                        <Button size="sm" variant="secondary" className="mt-2" onClick={() => setNewDesc(descriptionSuggestion)}>Apply</Button>
                      </div>
                    )}
                  </div>
                  <Button onClick={createVideo} className="w-full">Create Project</Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="surface-card">
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Video className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold font-display text-slate-900">{videos.length}</p>
                <p className="text-sm text-slate-500">Total Videos</p>
              </div>
            </CardContent>
          </Card>
          <Card className="surface-card">
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                <Zap className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold font-display text-slate-900">{totalRuns}</p>
                <p className="text-sm text-slate-500">Total Runs</p>
              </div>
            </CardContent>
          </Card>
          <Card className="surface-card">
            <CardContent className="pt-6 flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold font-display text-slate-900">∞</p>
                <p className="text-sm text-slate-500">Runs Remaining</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : videos.length === 0 ? (
          <Card className="surface-card text-center py-12">
            <CardContent>
              <Video className="h-12 w-12 mx-auto text-slate-400 mb-4" />
              <h3 className="text-lg font-display font-semibold mb-2">No videos yet</h3>
              <p className="text-slate-500 mb-4">Create your first content project to get started</p>
              <Button onClick={() => setDialogOpen(true)}><Plus className="mr-2 h-4 w-4" />New Video</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map((video) => (
              <Link key={video.id} to={`/video/${video.id}`}>
                <Card className="surface-card h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_40px_-30px_rgba(15,23,42,0.55)]">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-lg font-display leading-tight">{video.title}</CardTitle>
                      <Badge variant={video.status === "draft" ? "secondary" : "default"} className="ml-2 shrink-0">
                        {video.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {video.description && (
                      <p className="text-sm text-slate-600 line-clamp-2 mb-3">{video.description}</p>
                    )}
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{runCounts[video.id] || 0} runs</span>
                      <span>{format(new Date(video.created_at), "MMM d, yyyy")}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
