import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SERVICE_ROLE_KEY")!
    );

    const { data: { user }, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (userErr || !user) throw new Error("Invalid token");

    const { data: creator } = await supabase
      .from("creators")
      .select("id, name, email, payment_method, payment_handle, status, notes, created_at")
      .eq("email", user.email!.toLowerCase())
      .eq("status", "active")
      .maybeSingle();

    if (!creator) {
      return new Response(JSON.stringify({ creator: null }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const [
      { data: links },
      { data: movies },
      { data: shows },
      { data: podcasts },
      { data: payouts },
      { data: episodes },
      { data: podEps },
    ] = await Promise.all([
      supabase.from("content_creators").select("*").eq("creator_id", creator.id),
      supabase.from("movies").select("id, title"),
      supabase.from("shows").select("id, title, thumbnail, poster"),
      supabase.from("podcasts").select("id, title"),
      supabase.from("creator_payouts").select("*").eq("creator_id", creator.id).order("month", { ascending: false }),
      supabase.from("episodes").select("id, show_id"),
      supabase.from("podcast_episodes").select("id, podcast_id"),
    ]);

    const contentList = (links || []).map(l => {
      let title = l.content_id;
      let thumbnail = null;
      const show = shows?.find(s => String(s.id) === l.content_id);
      if (l.content_type === "movie") { const m = movies?.find(m => String(m.id) === l.content_id); title = m?.title || title; }
      if (l.content_type === "show") { title = show?.title || title; thumbnail = show?.thumbnail || show?.poster || null; }
      if (l.content_type === "podcast") title = podcasts?.find(p => String(p.id) === l.content_id)?.title || title;
      return { id: l.id, content_type: l.content_type, content_id: l.content_id, title, thumbnail };
    });

    // Load episodes for creator's shows (for upload management)
    const showIds = (links || []).filter(l => l.content_type === "show").map(l => l.content_id);
    let episodesByShow: Record<string, any[]> = {};
    if (showIds.length > 0) {
      const { data: showEps } = await supabase
        .from("episodes")
        .select("id, show_id, title, episode_number, season, status, rejection_note, url, created_at")
        .in("show_id", showIds)
        .order("season").order("episode_number");
      (showEps || []).forEach(ep => {
        const key = String(ep.show_id);
        if (!episodesByShow[key]) episodesByShow[key] = [];
        episodesByShow[key].push(ep);
      });
    }

    // Current month watch stats
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();

    const { data: allWatch } = await supabase
      .from("watch_progress")
      .select("content_id, content_type, progress_seconds, duration_seconds, user_id")
      .gte("first_watched_at", monthStart)
      .lt("first_watched_at", monthEnd);

    // Deduplicate: best session per user per content
    const best: Record<string, any> = {};
    (allWatch || []).forEach(w => {
      const key = `${w.user_id}:${w.content_type}:${w.content_id}`;
      if (!best[key] || w.progress_seconds > best[key].progress_seconds) best[key] = w;
    });

    // 25% watch threshold
    const qualifying = Object.values(best).filter(w => {
      if (w.duration_seconds > 0) return w.progress_seconds >= w.duration_seconds * 0.25;
      return w.progress_seconds >= 60;
    });

    const creatorContentSet = new Set((links || []).map(l => `${l.content_type}:${l.content_id}`));
    let creatorSecs = 0;
    let totalSecs = 0;

    qualifying.forEach(w => {
      let mine = creatorContentSet.has(`${w.content_type}:${w.content_id}`);
      if (!mine && w.content_type === "episode") {
        const ep = (episodes || []).find(e => String(e.id) === String(w.content_id));
        if (ep) mine = creatorContentSet.has(`show:${ep.show_id}`);
      }
      if (!mine && w.content_type === "podcast_episode") {
        const ep = (podEps || []).find(e => String(e.id) === String(w.content_id));
        if (ep) mine = creatorContentSet.has(`podcast:${ep.podcast_id}`);
      }
      const secs = w.progress_seconds || 0;
      totalSecs += secs;
      if (mine) creatorSecs += secs;
    });

    const share = totalSecs > 0 ? creatorSecs / totalSecs : 0;

    return new Response(JSON.stringify({
      creator,
      contentList,
      episodesByShow,
      payouts: payouts || [],
      currentMonth: {
        month: monthStart.slice(0, 7),
        watchMins: Math.round(creatorSecs / 60),
        share: +(share * 100).toFixed(1),
        totalPlatformMins: Math.round(totalSecs / 60),
      },
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
