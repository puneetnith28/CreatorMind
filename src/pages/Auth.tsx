import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Sparkles, Activity } from "lucide-react";

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();

  if (user) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/dashboard");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        toast({
          title: "Account created",
          description: "Check your email to verify your account.",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-5 py-10 md:px-10 relative overflow-hidden">
      <div className="hero-orb h-72 w-72 bg-blue-300/30 left-[-6rem] top-[-3rem]" />
      <div className="hero-orb h-80 w-80 bg-purple-300/25 right-[-8rem] top-[8rem]" />

      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="surface-card p-1">
          <CardHeader className="text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 w-fit">
              <Sparkles className="h-3.5 w-3.5 text-blue-500" />
              Creator Access
            </div>
            <CardTitle className="text-4xl font-display">Welcome to CreatorMind</CardTitle>
            <CardDescription className="text-base">
              {isLogin
                ? "Sign in to continue your multi-agent content workflow."
                : "Create your account and start building a persistent channel memory."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="name">Creator Name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Loading..." : isLogin ? "Sign In" : "Create Account"}
              </Button>
            </form>
            <div className="mt-4 text-center text-sm text-slate-500">
              {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
              <button onClick={() => setIsLogin(!isLogin)} className="text-primary hover:underline font-medium">
                {isLogin ? "Sign up" : "Sign in"}
              </button>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card border-slate-200/70">
          <CardHeader>
            <CardTitle className="text-xl font-display flex items-center gap-2">
              <Activity className="h-5 w-5 text-blue-500" />
              Agent Pipeline Preview
            </CardTitle>
            <CardDescription>What happens immediately after you log in</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              "Define Creator DNA and growth goals",
              "Autonomous worker detects opportunities from audience signals",
              "Approve generated ideas and teach the Mind with feedback",
              "Mind runs experiments, learns what works, and adapts autonomously",
            ].map((step, index) => (
              <div key={step} className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">Step {index + 1}</p>
                <p className="text-sm font-medium text-slate-800">{step}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
