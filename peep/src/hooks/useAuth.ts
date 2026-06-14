import { useState, useEffect, useRef } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import type { ProfileRole } from "../lib/auth";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [userAvatarId, setUserAvatarId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<ProfileRole | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState<false | "invite" | true>(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    return hash.get("type") === "invite" ? "invite" : false;
  });
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        // getUser() hits the server — always returns the current email even after a change
        const { data: { user: freshUser } } = await supabase.auth.getUser();
        const activeUser = freshUser ?? session.user;
        const { data: blocked } = await supabase
          .from("blocked_users")
          .select("id")
          .eq("email", activeUser.email)
          .maybeSingle();
        if (blocked) {
          await supabase.auth.signOut();
          setAuthChecked(true);
          return;
        }
        userIdRef.current = activeUser.id;
        const { data: profile } = await supabase
          .from("profiles")
          .select("avatar_id, role")
          .eq("id", activeUser.id)
          .maybeSingle();
        if (profile?.avatar_id) setUserAvatarId(profile.avatar_id);
        setUserRole((profile?.role as ProfileRole) || "viewer");
        setUser(activeUser);
      } else {
        setUser(null);
      }
      setAuthChecked(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (_event === "PASSWORD_RECOVERY") {
        setPasswordRecovery(true);
        return;
      }
      if (_event === "USER_UPDATED" && session?.user?.email) {
        const { id, email } = session.user;
        supabase.from("profiles").update({ email }).eq("id", id);
        supabase.from("subscriptions").update({ email }).eq("user_id", id);
      }
      if (_event === "SIGNED_IN") {
        sessionStorage.removeItem("lastAdAt");
        if (session?.user) {
          supabase
            .from("profiles")
            .select("avatar_id, role")
            .eq("id", session.user.id)
            .maybeSingle()
            .then(({ data }) => {
              if (data?.avatar_id) setUserAvatarId(data.avatar_id);
              setUserRole((data?.role as ProfileRole) || "viewer");
            });
        }
      }
      if (!session?.user) {
        setUserRole(null);
        if (userIdRef.current) localStorage.removeItem(`peep_profile_${userIdRef.current}`);
        userIdRef.current = null;
      } else {
        userIdRef.current = session.user.id;
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return {
    user,
    authChecked,
    userAvatarId,
    setUserAvatarId,
    userRole,
    passwordRecovery,
    setPasswordRecovery,
    userIdRef,
  };
}
