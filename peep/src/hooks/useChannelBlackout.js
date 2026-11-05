import { useEffect, useState } from "react";
import { supabase } from "../supabase";
import { channelBlackout } from "../lib/channelBlackout";

// The channel's live moment (Live TV → Live moments) rides along on the same 10 s check.
async function currentMoment(channelID) {
  const { data, error } = await supabase.from("channel_moments").select("id,moment,expires_at")
    .eq("channel_id", channelID).gt("expires_at", new Date().toISOString())
    .order("started_at", { ascending: false }).limit(1).maybeSingle();
  return error ? undefined : data || null;
}

// Refresh while watching, not only when entering the page. The one-second clock
// also applies already-loaded schedules without waiting for another request.
export function useChannelBlackout(channelID, initialChannel = null, { moments = false } = {}) {
  const [snapshot, setSnapshot] = useState(null);
  const [moment, setMoment] = useState(null);
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
        const [{ data, error }, live] = await Promise.all([
          supabase.from("channels").select("id,blackout_enabled,blackout_message,blackout_starts_at,blackout_ends_at").eq("id", channelID).maybeSingle(),
          moments ? currentMoment(channelID).catch(() => undefined) : Promise.resolve(null),
        ]);
        if (!active) return;
        if (live !== undefined) setMoment(live ? { ...live, channelID } : null);
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
  }, [channelID, attempt, moments]);
  if (channelID == null) return { message: null, loading: false, error: null, moment: null };
  const current = snapshot?.id === channelID ? snapshot : null;
  const liveMoment = moment && moment.channelID === channelID && new Date(moment.expires_at).getTime() > now ? moment : null;
  return { message: channelBlackout(current?.channel || initialChannel, now), loading: !current,
    error: current?.error, retry: () => setAttempt(a => a + 1), moment: liveMoment };
}
