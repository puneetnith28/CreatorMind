import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  onboardingCompleted: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  onboardingCompleted: false,
  refreshProfile: async () => {},
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [onboardingCompleted, setOnboardingCompleted] = useState(false);

  const loadProfile = async (userId: string | null) => {
    if (!userId) {
      setOnboardingCompleted(false);
      return;
    }

    const { data } = await supabase
      .from("profiles")
      .select("onboarding_completed_at")
      .eq("user_id", userId)
      .maybeSingle();

    setOnboardingCompleted(Boolean(data?.onboarding_completed_at));
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      loadProfile(session?.user?.id ?? null).finally(() => {
        setLoading(false);
      });
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      loadProfile(session?.user?.id ?? null).finally(() => {
        setLoading(false);
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    await loadProfile(user?.id ?? null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, onboardingCompleted, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
