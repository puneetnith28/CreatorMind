import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Check, Download, FileArchive, MessageSquareWarning, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

interface ArtifactRow {
  id: string;
  type: string;
  content: string | null;
  approval_status: string;
  created_at: string;
  agent_name: string | null;
  agent_version: string | null;
  storage_path?: string | null;
  mime_type?: string | null;
  metadata?: Record<string, unknown> | null;
}

interface RunRow {
  id: string;
  video_id: string;
  status: string;
  cost_tokens: number | null;
  cost_usd: number | null;
  started_at: string;
  completed_at: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  strategy: "Strategy Notes",
  script: "Script Draft",
  hook: "Hook Options",
  title: "Title & Thumbnail",
  thumbnail: "Thumbnail",
  story: "Story Structure",
};

const FEEDBACK_OPTIONS = [
  { value: "too_long", label: "Too long" },
  { value: "not_engaging", label: "Not engaging" },
  { value: "wrong_tone", label: "Wrong tone" },
  { value: "poor_hook", label: "Poor hook" },
  { value: "other", label: "Other" },
] as const;

export default function RunDetail() {
  const { runId } = useParams();
  const { toast } = useToast();
  const [run, setRun] = useState<RunRow | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackReason, setFeedbackReason] = useState<string>("not_engaging");
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string>("run");
  const [limitToVideo, setLimitToVideo] = useState(false);
  const [rejectingArtifactId, setRejectingArtifactId] = useState<string | null>(null);
  const [advancedFeedbackOpen, setAdvancedFeedbackOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizedLinks, setFinalizedLinks] = useState<{ jsonUrl: string | null; pdfUrl: string | null } | null>(null);

  const fetchData = async () => {
    if (!runId) return;
    const [{ data: runData }, { data: artifactData }] = await Promise.all([
      supabase.from("runs").select("*").eq("id", runId).single(),
      supabase.from("artifacts").select("*").eq("run_id", runId).order("created_at"),
    ]);
    setRun(runData);
    setArtifacts(artifactData || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [runId]);

  const updateApproval = async (artifactId: string, status: "approved" | "rejected") => {
    const { error } = await supabase
      .from("artifacts")
      .update({
        approval_status: status,
        approved_at: status === "approved" ? new Date().toISOString() : null,
      })
      .eq("id", artifactId);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      return;
    }

    fetchData();
  };

  const submitFeedback = async () => {
    if (!runId) return;

    setFeedbackSubmitting(true);
    const artifactId = selectedArtifactId === "run" ? undefined : selectedArtifactId;
    const { data, error } = await supabase.functions.invoke("submit-run-feedback", {
      body: {
        runId,
        artifactId,
        reasonCode: feedbackReason,
        freeText: feedbackText.trim() || undefined,
        appliesGlobally: !limitToVideo,
      },
    });

    if (error || (data as { error?: string } | null)?.error) {
      toast({
        title: "Feedback failed",
        description: error?.message || (data as { error?: string } | null)?.error || "Unknown error",
        variant: "destructive",
      });
      setFeedbackSubmitting(false);
      return;
    }

    toast({ title: "Feedback saved", description: "Future runs will use this memory." });

    if (rejectingArtifactId) {
      const { error: rejectError } = await supabase
        .from("artifacts")
        .update({
          approval_status: "rejected",
          approved_at: null,
        })
        .eq("id", rejectingArtifactId);

      if (rejectError) {
        toast({ title: "Reject failed", description: rejectError.message, variant: "destructive" });
      }
    }

    setFeedbackText("");
    setFeedbackReason("not_engaging");
    setSelectedArtifactId("run");
    setLimitToVideo(false);
    setAdvancedFeedbackOpen(false);
    setRejectingArtifactId(null);
    setFeedbackDialogOpen(false);
    setFeedbackSubmitting(false);
    await fetchData();
  };

  const openFeedbackDialog = (artifactId?: string, forReject = false) => {
    setSelectedArtifactId(artifactId ?? "run");
    setLimitToVideo(false);
    setAdvancedFeedbackOpen(false);
    setRejectingArtifactId(forReject && artifactId ? artifactId : null);
    setFeedbackDialogOpen(true);
  };

  const autoAnalyzeApprovedArtifact = async (artifactId: string) => {
    const { data, error } = await supabase.functions.invoke("analyze-approved-artifact", {
      body: { artifactId },
    });

    if (error || (data as { error?: string } | null)?.error) {
      toast({
        title: "Auto-learning failed",
        description: error?.message || (data as { error?: string } | null)?.error || "Approved artifact analysis failed",
        variant: "destructive",
      });
      return;
    }

    toast({ title: "Memory improved", description: "Approved artifact patterns were added to channel memory." });
  };

  const finalizeApprovedOutput = async () => {
    if (!runId) return;
    setFinalizing(true);
    const { data, error } = await supabase.functions.invoke("finalize-approved-output", {
      body: { runId },
    });

    if (error || (data as { error?: string } | null)?.error) {
      toast({
        title: "Finalize failed",
        description: error?.message || (data as { error?: string } | null)?.error || "Unknown error",
        variant: "destructive",
      });
      setFinalizing(false);
      return;
    }

    const payload = data as { jsonUrl?: string | null; pdfUrl?: string | null };
    setFinalizedLinks({ jsonUrl: payload.jsonUrl || null, pdfUrl: payload.pdfUrl || null });
    toast({ title: "Approved output finalized", description: "JSON and PDF package generated." });
    setFinalizing(false);
  };

  const getThumbnailUrl = (artifact: ArtifactRow): string | null => {
    if (!artifact.storage_path) return null;
    const { data } = supabase.storage.from("thumbnails").getPublicUrl(artifact.storage_path);
    return data.publicUrl || null;
  };

  const statusBadge = (status: string) => {
    if (status === "approved") return <Badge className="bg-success text-success-foreground">Approved</Badge>;
    if (status === "rejected") return <Badge variant="destructive">Rejected</Badge>;
    return <Badge className="bg-warning text-warning-foreground">Pending</Badge>;
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!run) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <p className="text-slate-500">Run not found</p>
        </div>
      </AppLayout>
    );
  }

  const grouped = artifacts.reduce((acc, art) => {
    (acc[art.type] = acc[art.type] || []).push(art);
    return acc;
  }, {} as Record<string, ArtifactRow[]>);

  const requiredTypes = ["hook", "script", "title", "strategy"];
  const approvedTypes = new Set(
    artifacts.filter((artifact) => artifact.approval_status === "approved").map((artifact) => artifact.type),
  );
  const canFinalize = requiredTypes.every((type) => approvedTypes.has(type));

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <Link to={`/video/${run.video_id}`} className="inline-flex items-center text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="mr-1 h-4 w-4" />Back to Video
        </Link>

        <Card className="glass-card">
          <CardContent className="pt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl md:text-4xl font-display font-bold">Run #{run.id.slice(0, 8)}</h1>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-slate-500">
                <span>{format(new Date(run.started_at), "MMM d, yyyy · h:mm a")}</span>
                {run.cost_tokens && <span>{run.cost_tokens.toLocaleString()} tokens</span>}
                {run.cost_usd && <span>${Number(run.cost_usd).toFixed(4)}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={finalizeApprovedOutput} disabled={!canFinalize || finalizing}>
                <FileArchive className="mr-2 h-4 w-4" />
                {finalizing ? "Finalizing..." : "Finalize Output"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {finalizedLinks && (
          <Card className="surface-card">
            <CardContent className="pt-5 flex items-center gap-2">
              {finalizedLinks.jsonUrl && (
                <Button asChild variant="outline">
                  <a href={finalizedLinks.jsonUrl} target="_blank" rel="noreferrer">
                    <Download className="mr-2 h-4 w-4" />
                    Download JSON
                  </a>
                </Button>
              )}
              {finalizedLinks.pdfUrl && (
                <Button asChild variant="outline">
                  <a href={finalizedLinks.pdfUrl} target="_blank" rel="noreferrer">
                    <Download className="mr-2 h-4 w-4" />
                    Download PDF
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {Object.entries(grouped).map(([type, arts]) => (
          <div key={type}>
            <h2 className="text-lg font-display font-semibold mb-3">{TYPE_LABELS[type] || type}</h2>
            <div className="space-y-3">
              {arts.map((art) => (
                <Card key={art.id} className="surface-card">
                  <CardContent className="pt-5">
                    <div className="flex items-start justify-between mb-3">
                      <div className="space-y-2">
                        {statusBadge(art.approval_status)}
                        {art.agent_name && (
                          <p className="text-xs text-slate-500">
                            {art.agent_name}
                            {art.agent_version ? ` (${art.agent_version})` : ""}
                          </p>
                        )}
                      </div>
                      {art.approval_status === "pending" && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-success border-success hover:bg-success/10"
                            onClick={async () => {
                              await updateApproval(art.id, "approved");
                              await autoAnalyzeApprovedArtifact(art.id);
                            }}
                          >
                            <Check className="mr-1 h-3 w-3" />Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive border-destructive hover:bg-destructive/10"
                            onClick={() => openFeedbackDialog(art.id, true)}
                          >
                            <X className="mr-1 h-3 w-3" />Reject
                          </Button>
                        </div>
                      )}
                      {art.approval_status === "approved" && (
                        <Button size="sm" variant="outline" onClick={() => openFeedbackDialog(art.id)}>
                          <MessageSquareWarning className="mr-2 h-3.5 w-3.5" />
                          Add feedback (optional)
                        </Button>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap text-slate-700">{art.content || "No content"}</p>
                    {art.type === "thumbnail" && (
                      <div className="mt-3 space-y-2">
                        {getThumbnailUrl(art) && (
                          <img src={getThumbnailUrl(art) || ""} alt="Generated thumbnail" className="w-full max-w-md rounded-xl border border-slate-200" />
                        )}
                        {getThumbnailUrl(art) && (
                          <Button asChild size="sm" variant="outline">
                            <a href={getThumbnailUrl(art) || "#"} target="_blank" rel="noreferrer">
                              <Download className="mr-2 h-4 w-4" />
                              Download Thumbnail
                            </a>
                          </Button>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}

        {artifacts.length === 0 && (
          <Card className="surface-card text-center py-8">
            <CardContent>
              <p className="text-slate-500">No artifacts generated for this run.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog
        open={feedbackDialogOpen}
        onOpenChange={(open) => {
          setFeedbackDialogOpen(open);
          if (!open) {
            setRejectingArtifactId(null);
            setLimitToVideo(false);
            setAdvancedFeedbackOpen(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Why didn&apos;t this run work for you?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              {rejectingArtifactId ? (
                <>
                  <Label>Feedback target</Label>
                  <p className="text-sm text-slate-500">This rejection feedback will be attached to the selected artifact.</p>
                </>
              ) : (
                <>
                  <Label>Feedback target</Label>
                  <Select
                    value={selectedArtifactId}
                    onValueChange={(value) => {
                      setSelectedArtifactId(value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose target" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="run">Entire run (global preference)</SelectItem>
                      {artifacts.map((artifact) => (
                        <SelectItem key={artifact.id} value={artifact.id}>
                          {(TYPE_LABELS[artifact.type] || artifact.type) + (artifact.agent_name ? ` - ${artifact.agent_name}` : "")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              )}
            </div>
            <div className="space-y-2">
              <Label>Feedback reason</Label>
              <Select value={feedbackReason} onValueChange={setFeedbackReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a reason" />
                </SelectTrigger>
                <SelectContent>
                  {FEEDBACK_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Details (optional)</Label>
              <Textarea
                placeholder="Example: Keep hooks below 10 words and avoid clickbait phrasing."
                value={feedbackText}
                onChange={(event) => setFeedbackText(event.target.value)}
              />
            </div>
            <Button variant="outline" onClick={() => setAdvancedFeedbackOpen((prev) => !prev)}>
              {advancedFeedbackOpen ? "Hide Advanced Settings" : "Advanced Settings"}
            </Button>
            {advancedFeedbackOpen && (
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white/90 p-3">
                <div>
                  <p className="text-sm font-medium">Only keep memory for this specific video</p>
                  <p className="text-xs text-slate-500">Default is global so your whole channel improves over time.</p>
                </div>
                <Switch checked={limitToVideo} onCheckedChange={setLimitToVideo} />
              </div>
            )}
            <Button onClick={submitFeedback} disabled={feedbackSubmitting} className="w-full">
              {feedbackSubmitting ? "Saving..." : rejectingArtifactId ? "Save Feedback and Reject" : "Save Feedback"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
