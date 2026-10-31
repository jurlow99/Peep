import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { channelBlackout } from "../lib/channelBlackout";

// Refresh while watching, not only when entering the page. The one-second clock
// also applies already-loaded schedules without waiting for another request.
export function useChannelBlackout(channelID, initialChannel = null) {
  const [snapshot, setSnapshot] = useState(null);
  const [now, setNow] = useState(Date.now);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (channelID == null) return;
    let active = true;
    let busy = false;
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try {
        const { data, error } = await supabase.from("channels")
          .select("id,blackout_enabled,blackout_message,blackout_starts_at,blackout_ends_at")
          .eq("id", channelID).maybeSingle();
        if (!active) return;
        if (error || !data) {
          setSnapshot(previous => previous?.id === channelID && previous.channel ? previous
            : { id: channelID, error: "Channel availability couldn’t be checked. Please try again." });
        } else setSnapshot({ id: channelID, channel: data });
      } catch {
        if (active) setSnapshot(previous => previous?.id === channelID && previous.channel ? previous
          : { id: channelID, error: "Channel availability couldn’t be checked. Please try again." });
      } finally { busy = false; }
    };
    refresh();
    const polling = setInterval(refresh, 10000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    const foreground = () => { if (document.visibilityState === "visible") { setNow(Date.now()); refresh(); } };
    document.addEventListener("visibilitychange", foreground);
    return () => { active = false; clearInterval(polling); clearInterval(clock); document.removeEventListener("visibilitychange", foreground); };
  }, [channelID, attempt]);
  if (channelID == null) return { message: null, loading: false, error: null };
  const current = snapshot?.id === channelID ? snapshot : null;
  return { message: channelBlackout(current?.channel || initialChannel, now), loading: !current,
    error: current?.error, retry: () => setAttempt(a => a + 1) };
}
