import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";

const TONE_OPTIONS = ["clear_confident", "educational", "playful", "authoritative"];
const PACING_OPTIONS = ["fast", "balanced", "deep_dive"];
const HOOK_OPTIONS = ["curiosity_with_value", "bold_claim", "question_led", "story_first"];
const LENGTH_OPTIONS = ["short_form", "mid_form", "long_form"];

interface InspirationInput {
  youtubeUrl: string;
  note: string;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { onboardingCompleted, refreshProfile } = useAuth();
  const { toast } = useToast();

  const [goal, setGoal] = useState("");
  const [tone, setTone] = useState("clear_confident");
  const [pacing, setPacing] = useState("fast");
  const [hookStyle, setHookStyle] = useState("curiosity_with_value");
  const [scriptLengthPreference, setScriptLengthPreference] = useState("short_form");
  const [autoSelectStyles, setAutoSelectStyles] = useState(true);
  const [inspirationAdvancedOpen, setInspirationAdvancedOpen] = useState(false);
  const [bannedPhrasesInput, setBannedPhrasesInput] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [inspirations, setInspirations] = useState<InspirationInput[]>([{ youtubeUrl: "", note: "" }]);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (onboardingCompleted) {
      navigate("/dashboard", { replace: true });
    }
  }, [onboardingCompleted, navigate]);

  const bannedPhrases = useMemo(
    () => bannedPhrasesInput.split(",").map((item) => item.trim()).filter(Boolean),
    [bannedPhrasesInput],
  );

  const updateInspiration = (index: number, key: keyof InspirationInput, value: string) => {
    setInspirations((prev) => prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  };

  const addInspiration = () => {
    setInspirations((prev) => [...prev, { youtubeUrl: "", note: "" }]);
  };

  const removeInspiration = (index: number) => {
    setInspirations((prev) => prev.filter((_, i) => i !== index));
  };

  const runOnboarding = async () => {
    if (!goal.trim()) {
      toast({ title: "Goal required", description: "Channel goal + niche is required.", variant: "destructive" });
      return;
    }

    setSubmitting(true);

    const { data, error } = await supabase.functions.invoke("complete-onboarding", {
      body: {
        goal: goal.trim(),
        autoSelectStyles,
        tone,
        pacing,
        hookStyle,
        scriptLengthPreference,
        bannedPhrases,
        inspirations: inspirations
          .map((item) => ({
            youtubeUrl: item.youtubeUrl.trim(),
            note: item.note.trim(),
          }))
          .filter((item) => item.youtubeUrl),
        additionalNotes: additionalNotes.trim(),
      },
    });

    if (error || (data as { error?: string } | null)?.error) {
      let errorMessage = error?.message || (data as { error?: string } | null)?.error || "Unknown error";
      
      // Try to extract the actual JSON error from the edge function
      try {
        if (error && typeof error === "object" && "context" in error) {
          const context = (error as any).context;
          if (context && typeof context.json === "function") {
            const payload = await context.json();
            if (payload?.error) errorMessage = payload.error;
          }
        }
      } catch (e) {
        // fallback to default message
      }

      toast({
        title: "Onboarding failed",
        description: errorMessage,
        variant: "destructive",
      });
      setSubmitting(false);
      return;
    }

    await refreshProfile();
    toast({ title: "Onboarding complete", description: "Baseline created. You can refine it in Preferences." });
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen relative overflow-hidden p-6 md:p-10">
      <div className="hero-orb h-80 w-80 bg-blue-300/30 left-[-7rem] top-[-5rem]" />
      <div className="hero-orb h-96 w-96 bg-purple-300/20 right-[-10rem] top-[-5rem]" />

      <div className="max-w-4xl mx-auto space-y-6">
        <Card className="glass-card">
          <CardHeader className="pb-4">
            <div className="inline-flex w-fit items-center rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              Required setup
            </div>
            <CardTitle className="font-display text-4xl">Channel Onboarding</CardTitle>
            <CardDescription className="max-w-2xl">
              Define your channel baseline once. Every future run uses this profile by default and keeps learning over time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Channel goal + niche (required)</Label>
              <Textarea
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
                placeholder="Example: I help startup founders explain AI tools in under 60 seconds with practical examples."
                className="min-h-[120px]"
              />
            </div>

            <div className="surface-card p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800">Auto-select style controls from your goal</p>
                <p className="text-xs text-slate-500">Recommended for faster setup and consistent baseline quality.</p>
              </div>
              <Switch
                checked={autoSelectStyles}
                onCheckedChange={(checked) => {
                  setAutoSelectStyles(checked);
                }}
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label>YouTube inspirations (channel links)</Label>
                <Button variant="outline" size="sm" onClick={addInspiration}>
                  Add Channel
                </Button>
              </div>
              {inspirations.map((item, index) => (
                <div key={index} className="surface-card p-4 space-y-2">
                  <Input
                    value={item.youtubeUrl}
                    onChange={(event) => updateInspiration(index, "youtubeUrl", event.target.value)}
                    placeholder="https://www.youtube.com/@creator"
                  />
                  {inspirationAdvancedOpen && (
                    <Input
                      value={item.note}
                      onChange={(event) => updateInspiration(index, "note", event.target.value)}
                      placeholder="Advanced: what should we emulate from this channel"
                    />
                  )}
                  {inspirations.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeInspiration(index)}>
                      Remove
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div>
              <Button variant="outline" onClick={() => setInspirationAdvancedOpen((prev) => !prev)}>
                {inspirationAdvancedOpen ? "Hide Inspiration Advanced Options" : "Advanced: Inspiration Notes"}
              </Button>
            </div>

            {!autoSelectStyles && (
              <div className="surface-card p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tone</Label>
                    <Select value={tone} onValueChange={setTone}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TONE_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Pacing</Label>
                    <Select value={pacing} onValueChange={setPacing}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{PACING_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Hook style</Label>
                    <Select value={hookStyle} onValueChange={setHookStyle}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{HOOK_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Script length preference</Label>
                    <Select value={scriptLengthPreference} onValueChange={setScriptLengthPreference}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{LENGTH_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Banned phrases (comma separated)</Label>
                  <Input
                    value={bannedPhrasesInput}
                    onChange={(event) => setBannedPhrasesInput(event.target.value)}
                    placeholder="smash that like, guaranteed viral"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Additional notes</Label>
                  <Textarea value={additionalNotes} onChange={(event) => setAdditionalNotes(event.target.value)} placeholder="Anything else your agents should know..." />
                </div>
              </div>
            )}

            <Button onClick={runOnboarding} disabled={submitting} className="w-full">
              {submitting ? "Generating style baseline..." : "Finish Onboarding"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
