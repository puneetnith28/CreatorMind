import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

const TONE_OPTIONS = ["clear_confident", "educational", "playful", "authoritative"];
const PACING_OPTIONS = ["fast", "balanced", "deep_dive"];
const HOOK_OPTIONS = ["curiosity_with_value", "bold_claim", "question_led", "story_first"];
const LENGTH_OPTIONS = ["short_form", "mid_form", "long_form"];

interface InspirationItem {
  id?: string;
  youtube_url: string;
  note: string;
}

interface LogItem {
  id: string;
  source: string;
  change_summary: string;
  created_at: string;
  agent_name: string | null;
}

interface FeedbackItem {
  id: string;
  reason_code: string;
  free_text: string | null;
  agent_name: string | null;
  created_at: string;
}

export default function Preferences() {
  const navigate = useNavigate();
  const { user, refreshProfile } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [channelStyleGoal, setChannelStyleGoal] = useState("");
  const [channelSummaryPrompt, setChannelSummaryPrompt] = useState("");
  const [tone, setTone] = useState("clear_confident");
  const [pacing, setPacing] = useState("fast");
  const [hookStyle, setHookStyle] = useState("curiosity_with_value");
  const [scriptLengthPreference, setScriptLengthPreference] = useState("short_form");
  const [ctaStyle, setCtaStyle] = useState("");
  const [notes, setNotes] = useState("");
  const [bannedPhrasesInput, setBannedPhrasesInput] = useState("");
  const [inspirations, setInspirations] = useState<InspirationItem[]>([]);

  const [modLog, setModLog] = useState<LogItem[]>([]);
  const [feedbackLog, setFeedbackLog] = useState<FeedbackItem[]>([]);
  const [youtubeChannelId, setYoutubeChannelId] = useState<string | null>(null);
  const [youtubeConnectedAt, setYoutubeConnectedAt] = useState<string | null>(null);
  const [youtubeBusy, setYoutubeBusy] = useState<"connect" | "sync" | "inspiration" | null>(null);

  const bannedPhrases = useMemo(
    () => bannedPhrasesInput.split(",").map((item) => item.trim()).filter(Boolean),
    [bannedPhrasesInput],
  );

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);

    const [profileResult, prefResult, inspirationResult, modResult, feedbackResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("channel_style_goal, channel_summary_prompt, youtube_channel_id, youtube_connected_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("channel_preferences")
        .select("tone, pacing, hook_style, script_length_preference, banned_phrases, cta_style, notes")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("channel_inspirations")
        .select("id, youtube_url, note")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("agent_modification_log")
        .select("id, source, change_summary, created_at, agent_name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("run_feedback")
        .select("id, reason_code, free_text, created_at, agent_name")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    if (profileResult.error || prefResult.error || inspirationResult.error || modResult.error || feedbackResult.error) {
      toast({
        title: "Load failed",
        description:
          profileResult.error?.message ||
          prefResult.error?.message ||
          inspirationResult.error?.message ||
          modResult.error?.message ||
          feedbackResult.error?.message ||
          "Unknown error",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    setChannelStyleGoal(profileResult.data?.channel_style_goal || "");
    setChannelSummaryPrompt(profileResult.data?.channel_summary_prompt || "");
    setYoutubeChannelId(profileResult.data?.youtube_channel_id || null);
    setYoutubeConnectedAt(profileResult.data?.youtube_connected_at || null);
    setTone(prefResult.data?.tone || "clear_confident");
    setPacing(prefResult.data?.pacing || "fast");
    setHookStyle(prefResult.data?.hook_style || "curiosity_with_value");
    setScriptLengthPreference(prefResult.data?.script_length_preference || "short_form");
    setCtaStyle(prefResult.data?.cta_style || "");
    setNotes(prefResult.data?.notes || "");
    setBannedPhrasesInput(Array.isArray(prefResult.data?.banned_phrases) ? prefResult.data?.banned_phrases.join(", ") : "");
    setInspirations((inspirationResult.data || []).map((item) => ({
      id: item.id,
      youtube_url: item.youtube_url,
      note: item.note || "",
    })));
    setModLog((modResult.data || []) as LogItem[]);
    setFeedbackLog((feedbackResult.data || []) as FeedbackItem[]);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const updateInspiration = (index: number, key: keyof InspirationItem, value: string) => {
    setInspirations((prev) => prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  };

  const addInspiration = () => {
    setInspirations((prev) => [...prev, { youtube_url: "", note: "" }]);
  };

  const removeInspiration = (index: number) => {
    setInspirations((prev) => prev.filter((_, i) => i !== index));
  };

  const savePreferences = async () => {
    if (!user) return;

    setSaving(true);
    const now = new Date().toISOString();

    const [profileUpdate, existingPrefResult] = await Promise.all([
      supabase
        .from("profiles")
        .update({
          channel_style_goal: channelStyleGoal.trim() || null,
          channel_summary_prompt: channelSummaryPrompt.trim() || null,
          updated_at: now,
        })
        .eq("user_id", user.id),
      supabase
        .from("channel_preferences")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    if (profileUpdate.error || existingPrefResult.error) {
      toast({
        title: "Save failed",
        description: profileUpdate.error?.message || existingPrefResult.error?.message || "Unknown error",
        variant: "destructive",
      });
      setSaving(false);
      return;
    }

    const preferencePayload = {
      user_id: user.id,
      tone,
      pacing,
      hook_style: hookStyle,
      script_length_preference: scriptLengthPreference,
      banned_phrases: bannedPhrases,
      cta_style: ctaStyle.trim() || null,
      notes: notes.trim() || null,
      updated_at: now,
    };

    const prefWrite = existingPrefResult.data?.id
      ? await supabase.from("channel_preferences").update(preferencePayload).eq("id", existingPrefResult.data.id)
      : await supabase.from("channel_preferences").insert(preferencePayload);

    if (prefWrite.error) {
      toast({ title: "Save failed", description: prefWrite.error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    const deleteResult = await supabase.from("channel_inspirations").delete().eq("user_id", user.id);
    if (deleteResult.error) {
      toast({ title: "Save failed", description: deleteResult.error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    const inspirationRows = inspirations
      .map((item) => ({
        user_id: user.id,
        youtube_url: item.youtube_url.trim(),
        note: item.note.trim() || null,
        label: null,
      }))
      .filter((item) => item.youtube_url);

    if (inspirationRows.length > 0) {
      const insertResult = await supabase.from("channel_inspirations").insert(inspirationRows);
      if (insertResult.error) {
        toast({ title: "Save failed", description: insertResult.error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    await supabase.from("agent_modification_log").insert({
      user_id: user.id,
      source: "manual_pref_edit",
      change_summary: "Updated channel preferences",
      metadata: {
        tone,
        pacing,
        hook_style: hookStyle,
        script_length_preference: scriptLengthPreference,
        inspirations_count: inspirationRows.length,
      },
    });

    toast({ title: "Saved", description: "Channel preferences updated." });
    setSaving(false);
    fetchData();
  };

  const resetOnboarding = async () => {
    if (!user) return;
    setResetting(true);

    const now = new Date().toISOString();

    const [profileUpdate, prefDelete, inspirationDelete] = await Promise.all([
      supabase
        .from("profiles")
        .update({
          onboarding_completed_at: null,
          channel_style_goal: null,
          channel_summary_prompt: null,
          updated_at: now,
        })
        .eq("user_id", user.id),
      supabase.from("channel_preferences").delete().eq("user_id", user.id),
      supabase.from("channel_inspirations").delete().eq("user_id", user.id),
    ]);

    if (profileUpdate.error || prefDelete.error || inspirationDelete.error) {
      toast({
        title: "Reset failed",
        description: profileUpdate.error?.message || prefDelete.error?.message || inspirationDelete.error?.message || "Unknown error",
        variant: "destructive",
      });
      setResetting(false);
      return;
    }

    await refreshProfile();
    toast({ title: "Onboarding reset", description: "You can now go through onboarding again." });
    navigate("/onboarding");
  };

  const connectYoutube = async () => {
    setYoutubeBusy("connect");
    const { data, error } = await supabase.functions.invoke("youtube-connect-start", { body: {} });
    if (error || (data as { error?: string } | null)?.error || !(data as { url?: string } | null)?.url) {
      toast({
        title: "YouTube connect failed",
        description: error?.message || (data as { error?: string } | null)?.error || "No OAuth URL returned",
        variant: "destructive",
      });
      setYoutubeBusy(null);
      return;
    }
    window.location.href = (data as { url: string }).url;
  };

  const syncYoutubeChannel = async () => {
    setYoutubeBusy("sync");
    const { data, error } = await supabase.functions.invoke("youtube-sync-channel", { body: {} });
    if (error || (data as { error?: string } | null)?.error) {
      toast({
        title: "YouTube sync failed",
        description: error?.message || (data as { error?: string } | null)?.error || "Unknown error",
        variant: "destructive",
      });
      setYoutubeBusy(null);
      return;
    }
    toast({ title: "YouTube synced", description: "Recent video metrics/comments were ingested." });
    setYoutubeBusy(null);
    fetchData();
  };

  const refreshInspirations = async () => {
    setYoutubeBusy("inspiration");
    const { data, error } = await supabase.functions.invoke("sync-inspiration-channels", { body: {} });
    if (error || (data as { error?: string } | null)?.error) {
      toast({
        title: "Inspiration refresh failed",
        description: error?.message || (data as { error?: string } | null)?.error || "Unknown error",
        variant: "destructive",
      });
      setYoutubeBusy(null);
      return;
    }
    toast({ title: "Inspirations refreshed", description: "External inspiration insights were queued and ingested." });
    setYoutubeBusy(null);
  };

  const mappedFeedback = feedbackLog.map((item) => ({
    id: `feedback-${item.id}`,
    source: "feedback",
    change_summary: `${item.reason_code}${item.free_text ? ` - ${item.free_text}` : ""}`,
    created_at: item.created_at,
    agent_name: item.agent_name,
  }));

  const history = [...modLog, ...mappedFeedback]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 40);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        <Card className="glass-card">
          <CardHeader className="pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex w-fit items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  Channel baseline
                </div>
                <h1 className="text-3xl md:text-4xl font-display font-bold mt-3">Preferences</h1>
                <p className="text-slate-500 mt-1">Define your persistent style profile used by all projects and agents.</p>
              </div>
              <Button variant="outline" onClick={resetOnboarding} disabled={resetting}>
                {resetting ? "Resetting..." : "Run Onboarding Again"}
              </Button>
            </div>
          </CardHeader>
        </Card>

        {loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
        ) : (
          <>
            <Card className="surface-card">
              <CardHeader>
                <CardTitle className="font-display">Channel Summary Prompt</CardTitle>
                <CardDescription>Editable master instruction block for the conductor and specialist agents.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Channel style goal</Label>
                  <Input value={channelStyleGoal} onChange={(event) => setChannelStyleGoal(event.target.value)} placeholder="What your channel is trying to achieve..." />
                </div>
                <div className="space-y-2">
                  <Label>Master channel summary prompt</Label>
                  <Textarea value={channelSummaryPrompt} onChange={(event) => setChannelSummaryPrompt(event.target.value)} className="min-h-[220px]" />
                </div>
                <Button variant="outline" onClick={() => setAdvancedOpen((prev) => !prev)}>
                  {advancedOpen ? "Hide Advanced Settings" : "Advanced Settings"}
                </Button>
              </CardContent>
            </Card>

            <Card className="surface-card">
              <CardHeader>
                <CardTitle className="font-display">YouTube Intelligence</CardTitle>
                <CardDescription>Connect and sync your YouTube data for iterative OpenClaw analysis loops.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-slate-600">
                  Status: {youtubeChannelId ? `Connected (${youtubeChannelId})` : "Not connected"}
                  {youtubeConnectedAt ? ` · ${format(new Date(youtubeConnectedAt), "MMM d, yyyy · h:mm a")}` : ""}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={connectYoutube} disabled={youtubeBusy !== null}>
                    {youtubeBusy === "connect" ? "Connecting..." : youtubeChannelId ? "Reconnect YouTube" : "Connect YouTube"}
                  </Button>
                  <Button variant="outline" onClick={syncYoutubeChannel} disabled={youtubeBusy !== null || !youtubeChannelId}>
                    {youtubeBusy === "sync" ? "Syncing..." : "Sync My Channel"}
                  </Button>
                  <Button variant="outline" onClick={refreshInspirations} disabled={youtubeBusy !== null}>
                    {youtubeBusy === "inspiration" ? "Refreshing..." : "Refresh Inspiration Channels"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {advancedOpen && (
              <>
                <Card className="surface-card">
                  <CardHeader>
                    <CardTitle className="font-display">Style Controls</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tone</Label>
                      <Select value={tone} onValueChange={setTone}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TONE_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Pacing</Label>
                      <Select value={pacing} onValueChange={setPacing}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PACING_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Hook style</Label>
                      <Select value={hookStyle} onValueChange={setHookStyle}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{HOOK_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Script length preference</Label>
                      <Select value={scriptLengthPreference} onValueChange={setScriptLengthPreference}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LENGTH_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>CTA style</Label>
                      <Input value={ctaStyle} onChange={(event) => setCtaStyle(event.target.value)} placeholder="Example: end with a challenge question" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Banned phrases (comma separated)</Label>
                      <Input value={bannedPhrasesInput} onChange={(event) => setBannedPhrasesInput(event.target.value)} placeholder="guaranteed viral, smash that like" />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>Notes</Label>
                      <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Additional style rules..." />
                    </div>
                  </CardContent>
                </Card>

                <Card className="surface-card">
                  <CardHeader>
                    <CardTitle className="font-display">YouTube Inspirations</CardTitle>
                    <CardDescription>Channel links and what to emulate from each one.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button variant="outline" size="sm" onClick={addInspiration}>Add inspiration</Button>
                    {inspirations.length === 0 && <p className="text-sm text-slate-500">No inspirations yet.</p>}
                    {inspirations.map((item, index) => (
                      <div key={item.id || index} className="rounded-xl border border-slate-200 bg-white/90 p-3 space-y-2">
                        <Input value={item.youtube_url} onChange={(event) => updateInspiration(index, "youtube_url", event.target.value)} placeholder="https://www.youtube.com/@creator" />
                        <Input value={item.note} onChange={(event) => updateInspiration(index, "note", event.target.value)} placeholder="What to emulate" />
                        <Button variant="ghost" size="sm" onClick={() => removeInspiration(index)}>Remove</Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            )}

            <div className="flex justify-end">
              <Button onClick={savePreferences} disabled={saving}>{saving ? "Saving..." : "Save Preferences"}</Button>
            </div>

            <Card className="surface-card">
              <CardHeader>
                <CardTitle className="font-display">Past Agent Modifications</CardTitle>
                <CardDescription>Feedback and preference changes that shaped your current baseline.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {history.length === 0 ? (
                    <p className="text-sm text-slate-500">No history yet.</p>
                  ) : (
                    history.map((item) => (
                      <div key={item.id} className="rounded-xl border border-slate-200 bg-white/90 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-slate-800">{item.change_summary}</p>
                          <span className="text-xs text-slate-500">{item.source}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {item.agent_name ? `${item.agent_name} · ` : ""}
                          {format(new Date(item.created_at), "MMM d, yyyy · h:mm a")}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}
