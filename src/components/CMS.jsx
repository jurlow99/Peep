import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../supabase";
import { ImageUploader } from "./ImageUploader";

const EMPTY_ROW = {
  title: "",
  category: "Horror",
  rating: "NR",
  score: "",
  duration: "",
  year: "",
  thumbnail: "",
  poster: "",
  url: "",
  trailer_url: "",
  description: "",
  tags: "",
};

const EMPTY_SHOW = {
  title: "",
  category: "Horror",
  rating: "NR",
  year: "",
  score: "",
  thumbnail: "",
  poster: "",
  description: "",
  tags: "",
  trailer_url: "",
};

const EMPTY_EPISODE = {
  show_id: "",
  season: 1,
  episode_number: 1,
  title: "",
  description: "",
  url: "",
  thumbnail: "",
  duration: "",
};

const EMPTY_CAROUSEL = {
  title: "",
  type: "category",
  filter_value: "",
  content_type: "all",
  enabled: true,
  position: 0,
  pages: "home",
};

const EMPTY_LIVE_STREAM = {
  title: "",
  description: "",
  stream_url: "",
  thumbnail: "",
  is_live: true,
  badge_text: "LIVE",
  channel_number: "",
  now_airing: "",
  up_next: "",
};

const EMPTY_PODCAST = {
  title: "",
  host: "",
  description: "",
  artwork_url: "",
  link_url: "",
  episode_count: "",
  tags: "",
  enabled: true,
};

const EMPTY_PODCAST_EPISODE = {
  podcast_id: "",
  episode_number: 1,
  title: "",
  description: "",
  audio_url: "",
  duration: "",
  thumbnail: "",
};

export function CMS({ onExit }) {
  const [tab, setTab] = useState("videos");
  const [videoSubTab, setVideoSubTab] = useState("movies"); // "movies" | "series" | "episodes"
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerFormType, setDrawerFormType] = useState(null); // null = tab-based, "epg" = EPG form

  // Videos state
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_ROW);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  
  // Carousels state
  const [carousels, setCarousels] = useState([]);
  const [carouselLoading, setCarouselLoading] = useState(true);
  const [editingCarouselId, setEditingCarouselId] = useState(null);
  const [carouselForm, setCarouselForm] = useState(EMPTY_CAROUSEL);
  const [carouselSaving, setCarouselSaving] = useState(false);
  const [deleteCarouselConfirm, setDeleteCarouselConfirm] = useState(null);
  
  // Shows state
  const [showsList, setShowsList] = useState([]);
  const [showsLoading, setShowsLoading] = useState(true);
  const [editingShowId, setEditingShowId] = useState(null);
  const [showForm, setShowForm] = useState(EMPTY_SHOW);
  const [showSaving, setShowSaving] = useState(false);
  const [deleteShowConfirm, setDeleteShowConfirm] = useState(null);

  // Episodes state
  const [episodesList, setEpisodesList] = useState([]);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [selectedShowForEpisodes, setSelectedShowForEpisodes] = useState("");
  const [editingEpisodeId, setEditingEpisodeId] = useState(null);
  const [episodeForm, setEpisodeForm] = useState(EMPTY_EPISODE);
  const [episodeSaving, setEpisodeSaving] = useState(false);
  const [deleteEpisodeConfirm, setDeleteEpisodeConfirm] = useState(null);

  // Podcasts state
  const [podcastsList, setPodcastsList] = useState([]);
  const [podcastsLoading, setPodcastsLoading] = useState(true);
  const [editingPodcastId, setEditingPodcastId] = useState(null);
  const [podcastForm, setPodcastForm] = useState(EMPTY_PODCAST);
  const [podcastSaving, setPodcastSaving] = useState(false);
  const [deletePodcastConfirm, setDeletePodcastConfirm] = useState(null);

  // Podcast Episodes state
  const [selectedPodcastForEp, setSelectedPodcastForEp] = useState(null);
  const [podEpList, setPodEpList] = useState([]);
  const [podEpLoading, setPodEpLoading] = useState(false);
  const [editingPodEpId, setEditingPodEpId] = useState(null);
  const [podEpForm, setPodEpForm] = useState(EMPTY_PODCAST_EPISODE);
  const [podEpSaving, setPodEpSaving] = useState(false);
  const [deletePodEpConfirm, setDeletePodEpConfirm] = useState(null);

  // Live Streams state
  const [liveList, setLiveList] = useState([]);
  const [liveLoading, setLiveLoading] = useState(true);
  const [editingLiveId, setEditingLiveId] = useState(null);
  const [liveForm, setLiveForm] = useState(EMPTY_LIVE_STREAM);
  const [liveSaving, setLiveSaving] = useState(false);
  const [deleteLiveConfirm, setDeleteLiveConfirm] = useState(null);

  // EPG state
  const [epgEntries, setEpgEntries] = useState([]);
  const [epgLoading, setEpgLoading] = useState(false);
  const [selectedChannelForEpg, setSelectedChannelForEpg] = useState(null);
  const [epgDayOffset, setEpgDayOffset] = useState(0);
  const [epgForm, setEpgForm] = useState({ content_id: "", content_type: "movie", title: "", description: "", start_time: "", end_time: "" });
  const [editingEpgId, setEditingEpgId] = useState(null);
  const [epgSaving, setEpgSaving] = useState(false);
  const [deleteEpgConfirm, setDeleteEpgConfirm] = useState(null);
  const [allVideosForEpg, setAllVideosForEpg] = useState([]);
  const [allEpisodesForEpg, setAllEpisodesForEpg] = useState([]);

  // Bulk auto-scheduler state
  const [bulkContentType, setBulkContentType] = useState("episode");
  const [bulkShowId, setBulkShowId] = useState("");
  const [bulkSelectedEps, setBulkSelectedEps] = useState(new Set());
  const [bulkSelectedMovies, setBulkSelectedMovies] = useState(new Set());
  const [bulkMovieSearch, setBulkMovieSearch] = useState("");
  const [bulkStartTime, setBulkStartTime] = useState("");
  const [bulkDefaultMins, setBulkDefaultMins] = useState(45);
  const [bulkSaving, setBulkSaving] = useState(false);

  const [heroConfirm, setHeroConfirm] = useState(null); // { current, next, type: "video"|"show" }

  // Reports state
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSection, setReportSection] = useState("overview");

  const subscriptionRef = useRef(null);
  const carouselSubRef = useRef(null);
  const showSubRef = useRef(null);

  const categories = ["Horror", "Sci-Fi", "Comedy", "Drama", "Action", "Documentary"];
  const carouselTypes = [
    { value: "category", label: "Category" },
    { value: "trending", label: "Trending" },
    { value: "custom", label: "Custom" },
  ];

  useEffect(() => {
    loadRows();
    subscribeToChanges();
    loadCarousels();
    subscribeToCarouselChanges();
    loadShows();
    loadPodcasts();
    loadLiveStreams();

    return () => {
      if (subscriptionRef.current) subscriptionRef.current.unsubscribe();
      if (carouselSubRef.current) carouselSubRef.current.unsubscribe();
      if (showSubRef.current) showSubRef.current.unsubscribe();
    };
  }, []);

  function showToast(msg, type = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setDrawerFormType(null);
    setBulkShowId("");
    setBulkSelectedEps(new Set());
    setBulkSelectedMovies(new Set());
    setBulkMovieSearch("");
  }

  useEffect(() => {
    if (tab === "reports") loadReports();
  }, [tab]);

  async function loadReports() {
    setReportLoading(true);
    const [
      { count: userCount },
      { count: videoCount },
      { count: showCount },
      { count: episodeCount },
      { data: watchData },
      { data: ratingsData },
      { data: listData },
      { data: profilesData },
    ] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("videos").select("*", { count: "exact", head: true }),
      supabase.from("shows").select("*", { count: "exact", head: true }),
      supabase.from("episodes").select("*", { count: "exact", head: true }),
      supabase.from("watch_progress").select("user_id, content_id, content_type, completed, progress_seconds, duration_seconds, last_watched_at"),
      supabase.from("ratings").select("user_id, content_id, content_type, rating"),
      supabase.from("user_list").select("user_id, content_id, content_type"),
      supabase.from("profiles").select("id, username, email, created_at").order("created_at", { ascending: true }),
    ]);

    // Group watch sessions by content, also accumulate watch time
    const watchMap = {};
    const watchTimeMap = {};
    let totalWatchSeconds = 0;
    (watchData || []).forEach(w => {
      const key = `${w.content_type}:${w.content_id}`;
      watchMap[key] = (watchMap[key] || 0) + 1;
      const secs = w.progress_seconds || 0;
      watchTimeMap[key] = (watchTimeMap[key] || 0) + secs;
      totalWatchSeconds += secs;
    });
    const topWatchedRaw = Object.entries(watchMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([key, count]) => { const [type, id] = key.split(":"); return { type, id: parseInt(id), count }; });
    const topByTimeRaw = Object.entries(watchTimeMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([key, secs]) => { const [type, id] = key.split(":"); return { type, id: parseInt(id), secs }; });

    // Build raw rated + saved before title fetch so all IDs are included
    const ratingMap = {};
    (ratingsData || []).forEach(r => {
      if (r.rating === 1) { const key = `${r.content_type}:${r.content_id}`; ratingMap[key] = (ratingMap[key] || 0) + 1; }
    });
    const topRatedRaw = Object.entries(ratingMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([key, count]) => { const [type, id] = key.split(":"); return { type, id: parseInt(id), count }; });

    const saveMap = {};
    (listData || []).forEach(s => { const key = `${s.content_type}:${s.content_id}`; saveMap[key] = (saveMap[key] || 0) + 1; });
    const topSavedRaw = Object.entries(saveMap).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([key, count]) => { const [type, id] = key.split(":"); return { type, id: parseInt(id), count }; });

    // Unified title fetch — covers all four panels and all content types
    const allItems = [...topWatchedRaw, ...topByTimeRaw, ...topRatedRaw, ...topSavedRaw];
    const allKeys = [...new Set(allItems.map(t => `${t.type}:${t.id}`))];
    const idsFor = (prefix) => allKeys.filter(k => k.startsWith(prefix + ":")).map(k => parseInt(k.split(":")[1]));
    const [movTitles, epTitles, podEpTitles, showTitles] = await Promise.all([
      idsFor("movie").length ? supabase.from("videos").select("id, title").in("id", idsFor("movie")) : { data: [] },
      idsFor("episode").length ? supabase.from("episodes").select("id, title").in("id", idsFor("episode")) : { data: [] },
      idsFor("podcast_episode").length ? supabase.from("podcast_episodes").select("id, title").in("id", idsFor("podcast_episode")) : { data: [] },
      idsFor("show").length ? supabase.from("shows").select("id, title").in("id", idsFor("show")) : { data: [] },
    ]);
    const titleMap = {};
    (movTitles.data || []).forEach(v => { titleMap[`movie:${v.id}`] = v.title; });
    (epTitles.data || []).forEach(e => { titleMap[`episode:${e.id}`] = e.title; });
    (podEpTitles.data || []).forEach(e => { titleMap[`podcast_episode:${e.id}`] = e.title; });
    (showTitles.data || []).forEach(s => { titleMap[`show:${s.id}`] = s.title; });

    const applyTitles = (arr) => arr
      .map(t => ({ ...t, title: titleMap[`${t.type}:${t.id}`] || null }))
      .filter(t => t.title !== null);
    const topWatched = applyTitles(topWatchedRaw);
    const topByTime = applyTitles(topByTimeRaw).map(t => ({ ...t, minutes: Math.round(t.secs / 60) }));
    const topRated = applyTitles(topRatedRaw);
    const topSaved = applyTitles(topSavedRaw);

    // User growth by month
    const monthMap = {};
    (profilesData || []).forEach(p => {
      const month = p.created_at?.slice(0, 7);
      if (month) monthMap[month] = (monthMap[month] || 0) + 1;
    });
    const userGrowth = Object.entries(monthMap).sort((a, b) => a[0].localeCompare(b[0]));

    // ── User engagement ──
    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Per-user watch stats
    const userWatchMap = {};
    (watchData || []).forEach(w => {
      if (!userWatchMap[w.user_id]) userWatchMap[w.user_id] = { sessions: 0, completed: 0, totalProgress: 0, totalDuration: 0, lastWatched: null };
      const u = userWatchMap[w.user_id];
      u.sessions++;
      if (w.completed) u.completed++;
      if (w.progress_seconds) u.totalProgress += w.progress_seconds;
      if (w.duration_seconds) u.totalDuration += w.duration_seconds;
      if (w.last_watched_at && (!u.lastWatched || w.last_watched_at > u.lastWatched)) u.lastWatched = w.last_watched_at;
    });

    // Per-user saves
    const userSaveMap = {};
    (listData || []).forEach(s => { userSaveMap[s.user_id] = (userSaveMap[s.user_id] || 0) + 1; });

    // Per-user ratings
    const userRatingMap = {};
    (ratingsData || []).forEach(r => { userRatingMap[r.user_id] = (userRatingMap[r.user_id] || 0) + 1; });

    // Build per-user table
    const userEngagement = (profilesData || []).map(p => {
      const w = userWatchMap[p.id] || { sessions: 0, completed: 0, totalProgress: 0, totalDuration: 0, lastWatched: null };
      return {
        id: p.id,
        display: p.username ? `@${p.username}` : (p.email || p.id.slice(0, 8)),
        email: p.email || "",
        joinedAt: p.created_at,
        sessions: w.sessions,
        completed: w.completed,
        avgProgressMin: w.sessions > 0 ? Math.round(w.totalProgress / w.sessions / 60) : 0,
        totalHours: +(w.totalProgress / 3600).toFixed(1),
        saves: userSaveMap[p.id] || 0,
        ratings: userRatingMap[p.id] || 0,
        lastWatched: w.lastWatched,
        active30d: w.lastWatched ? w.lastWatched >= thirtyDaysAgo : false,
        active7d: w.lastWatched ? w.lastWatched >= sevenDaysAgo : false,
        neverWatched: w.sessions === 0,
      };
    }).sort((a, b) => b.sessions - a.sessions);

    const activeUsers30d = userEngagement.filter(u => u.active30d).length;
    const activeUsers7d = userEngagement.filter(u => u.active7d).length;
    const neverWatchedUsers = userEngagement.filter(u => u.neverWatched);
    const avgSessionsPerUser = userCount > 0 ? (watchData || []).length / userCount : 0;

    // Watch sessions over time (by day, last 30 days)
    const sessionsByDay = {};
    (watchData || []).forEach(w => {
      if (!w.last_watched_at || w.last_watched_at < thirtyDaysAgo) return;
      const day = w.last_watched_at.slice(0, 10);
      sessionsByDay[day] = (sessionsByDay[day] || 0) + 1;
    });
    const sessionTrend = Object.entries(sessionsByDay).sort((a, b) => a[0].localeCompare(b[0]));

    setReportData({
      userCount: userCount ?? 0,
      videoCount: videoCount ?? 0,
      showCount: showCount ?? 0,
      episodeCount: episodeCount ?? 0,
      watchSessions: (watchData || []).length,
      completedSessions: (watchData || []).filter(w => w.completed).length,
      totalSaves: (listData || []).length,
      totalRatings: (ratingsData || []).length,
      totalWatchHours: Math.round(totalWatchSeconds / 3600),
      topWatched, topRated, topSaved, topByTime, userGrowth,
      userEngagement, activeUsers30d, activeUsers7d,
      neverWatchedUsers, avgSessionsPerUser, sessionTrend,
    });
    setReportLoading(false);
  }

  // ──── VIDEOS ────

  async function loadRows() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("videos")
        .select("*")
        .order("id", { ascending: true });

      if (error) throw error;
      setRows(data || []);
    } catch (error) {
      showToast("Failed to load videos: " + error.message, "error");
    }
    setLoading(false);
  }

  function subscribeToChanges() {
    subscriptionRef.current = supabase
      .channel("videos-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "videos" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setRows(prev => [...prev, payload.new]);
            showToast("Video added", "success");
          } else if (payload.eventType === "UPDATE") {
            setRows(prev =>
              prev.map(r => r.id === payload.new.id ? payload.new : r)
            );
            showToast("Video updated", "success");
          } else if (payload.eventType === "DELETE") {
            setRows(prev => prev.filter(r => r.id !== payload.old.id));
            showToast("Video deleted", "success");
          }
        }
      )
      .subscribe();
  }

  function startEdit(row) {
    setEditingId(row.id);
    setDrawerOpen(true);
    setForm({
      title: row.title ?? "",
      category: row.category ?? "Horror",
      rating: row.rating ?? "NR",
      score: row.score ?? "",
      duration: row.duration ?? "",
      year: row.year ?? "",
      thumbnail: row.thumbnail ?? "",
      poster: row.poster ?? "",
      url: row.url ?? "",
      trailer_url: row.trailer_url ?? "",
      description: row.description ?? "",
      tags: Array.isArray(row.tags) ? row.tags.join(", ") : (row.tags ?? ""),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_ROW);
    setDrawerOpen(false);
  }

  function parseForm() {
    return {
      ...form,
      score: form.score !== "" ? Number(form.score) : null,
      year: form.year !== "" ? Number(form.year) : null,
      trailer_url: form.trailer_url.trim() || null,
      tags: form.tags
        ? form.tags.split(",").map(t => t.trim()).filter(Boolean)
        : [],
    };
  }

  async function saveRow() {
    if (!form.title.trim() || !form.url.trim()) {
      showToast("Title and URL are required.", "error");
      return;
    }
    setSaving(true);
    const payload = parseForm();

    try {
      if (editingId) {
        const { error } = await supabase
          .from("videos")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
        showToast("Video updated");
        cancelEdit();
      } else {
        const { error } = await supabase
          .from("videos")
          .insert([payload]);
        if (error) throw error;
        showToast("Video added");
        setForm(EMPTY_ROW);
        setDrawerOpen(false);
      }
      await loadRows();
    } catch (error) {
      showToast("Save failed: " + error.message, "error");
    }
    setSaving(false);
  }

  async function setHeroVideo(row) {
    const current = rows.find(r => r.featured) || showsList.find(s => s.featured);
    if (current && current.id !== row.id) {
      setHeroConfirm({ current, next: row, type: "video" });
      return;
    }
    await applyHero(row, "video");
  }

  async function deleteRow(id) {
    try {
      const { error } = await supabase.from("videos").delete().eq("id", id);
      if (error) throw error;
      showToast("Video deleted");
      setDeleteConfirm(null);
      await loadRows();
    } catch (error) {
      showToast("Delete failed: " + error.message, "error");
    }
  }

  // ──── CAROUSELS ────

  async function loadCarousels() {
    setCarouselLoading(true);
    try {
      const { data, error } = await supabase
        .from("carousels")
        .select("*")
        .order("position", { ascending: true });

      if (error) throw error;
      setCarousels(data || []);
    } catch (error) {
      showToast("Failed to load carousels: " + error.message, "error");
    }
    setCarouselLoading(false);
  }

  function subscribeToCarouselChanges() {
    carouselSubRef.current = supabase
      .channel("carousels-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "carousels" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setCarousels(prev => [...prev, payload.new].sort((a, b) => a.position - b.position));
            showToast("Carousel added", "success");
          } else if (payload.eventType === "UPDATE") {
            setCarousels(prev =>
              prev.map(c => c.id === payload.new.id ? payload.new : c).sort((a, b) => a.position - b.position)
            );
            showToast("Carousel updated", "success");
          } else if (payload.eventType === "DELETE") {
            setCarousels(prev => prev.filter(c => c.id !== payload.old.id));
            showToast("Carousel deleted", "success");
          }
        }
      )
      .subscribe();
  }

  function startCarouselEdit(carousel) {
    setEditingCarouselId(carousel.id);
    setDrawerOpen(true);
    setCarouselForm({
      title: carousel.title ?? "",
      type: carousel.type ?? "category",
      filter_value: carousel.filter_value ?? "",
      content_type: carousel.content_type ?? "all",
      enabled: carousel.enabled ?? true,
      position: carousel.position ?? 0,
      pages: carousel.pages ?? "home",
    });
  }

  function cancelCarouselEdit() {
    setEditingCarouselId(null);
    setCarouselForm(EMPTY_CAROUSEL);
    setDrawerOpen(false);
  }

  async function saveCarousel() {
    if (!carouselForm.title.trim()) {
      showToast("Title is required.", "error");
      return;
    }
    if (carouselForm.type === "category" && !carouselForm.filter_value.trim()) {
      showToast("Category is required for category type.", "error");
      return;
    }

    setCarouselSaving(true);
    const payload = { ...carouselForm, position: editingCarouselId ? carouselForm.position : carousels.length };

    try {
      if (editingCarouselId) {
        const { error } = await supabase
          .from("carousels")
          .update(payload)
          .eq("id", editingCarouselId);
        if (error) throw error;
        showToast("Carousel updated");
        cancelCarouselEdit();
      } else {
        const { error } = await supabase
          .from("carousels")
          .insert([payload]);
        if (error) throw error;
        showToast("Carousel added");
        setCarouselForm(EMPTY_CAROUSEL);
        setDrawerOpen(false);
      }
      await loadCarousels();
    } catch (error) {
      showToast("Save failed: " + error.message, "error");
    }
    setCarouselSaving(false);
  }

  async function deleteCarousel(id) {
    try {
      const { error } = await supabase.from("carousels").delete().eq("id", id);
      if (error) throw error;
      showToast("Carousel deleted");
      setDeleteCarouselConfirm(null);
      await loadCarousels();
    } catch (error) {
      showToast("Delete failed: " + error.message, "error");
    }
  }

  async function reorderCarousels(newCarousels) {
    try {
      const updates = newCarousels.map((c, idx) => ({ id: c.id, position: idx }));
      for (const update of updates) {
        const { error } = await supabase.from("carousels").update({ position: update.position }).eq("id", update.id);
        if (error) throw error;
      }
      setCarousels(newCarousels);
      showToast("Order updated");
    } catch (error) {
      showToast("Reorder failed: " + error.message, "error");
    }
  }

  async function moveCarousel(idx, dir) {
    const next = [...carousels];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    await reorderCarousels(next);
  }

  // ──── SHOWS ────

  async function loadShows() {
    setShowsLoading(true);
    const { data, error } = await supabase.from("shows").select("*").order("id", { ascending: true });
    if (error) showToast("Failed to load shows: " + error.message, "error");
    else setShowsList(data || []);
    setShowsLoading(false);
  }

  function startShowEdit(show) {
    setEditingShowId(show.id);
    setDrawerOpen(true);
    setShowForm({ title: show.title ?? "", category: show.category ?? "Horror", rating: show.rating ?? "NR", year: show.year ?? "", score: show.score ?? "", thumbnail: show.thumbnail ?? "", poster: show.poster ?? "", description: show.description ?? "", tags: Array.isArray(show.tags) ? show.tags.join(", ") : (show.tags ?? ""), trailer_url: show.trailer_url ?? "" });
  }

  function cancelShowEdit() { setEditingShowId(null); setShowForm(EMPTY_SHOW); setDrawerOpen(false); }

  async function saveShow() {
    if (!showForm.title.trim()) { showToast("Title is required.", "error"); return; }
    setShowSaving(true);
    const payload = { ...showForm, year: showForm.year !== "" ? Number(showForm.year) : null, score: showForm.score !== "" ? Number(showForm.score) : null, trailer_url: showForm.trailer_url?.trim() || null, tags: showForm.tags ? showForm.tags.split(",").map(t => t.trim()).filter(Boolean) : [] };
    try {
      if (editingShowId) {
        const { error } = await supabase.from("shows").update(payload).eq("id", editingShowId);
        if (error) throw error;
        showToast("Show updated");
        cancelShowEdit();
      } else {
        const { error } = await supabase.from("shows").insert([payload]);
        if (error) throw error;
        showToast("Show added");
        setShowForm(EMPTY_SHOW);
        setDrawerOpen(false);
      }
      await loadShows();
    } catch (error) { showToast("Save failed: " + error.message, "error"); }
    setShowSaving(false);
  }

  async function setHeroShow(show) {
    const current = rows.find(r => r.featured) || showsList.find(s => s.featured);
    if (current && current.id !== show.id) {
      setHeroConfirm({ current, next: show, type: "show" });
      return;
    }
    await applyHero(show, "show");
  }

  async function applyHero(item, type) {
    await supabase.from("videos").update({ featured: false }).eq("featured", true);
    await supabase.from("shows").update({ featured: false }).eq("featured", true);
    await supabase.from(type === "show" ? "shows" : "videos").update({ featured: true }).eq("id", item.id);
    showToast("Hero updated — now showing: " + item.title);
    setHeroConfirm(null);
    await loadRows();
    await loadShows();
  }

  async function deleteShow(id) {
    const { error } = await supabase.from("shows").delete().eq("id", id);
    if (error) showToast("Delete failed: " + error.message, "error");
    else { showToast("Show deleted"); setDeleteShowConfirm(null); await loadShows(); }
  }

  // ──── EPISODES ────

  async function loadEpisodes(showId) {
    if (!showId) return;
    setEpisodesLoading(true);
    const { data, error } = await supabase.from("episodes").select("*").eq("show_id", showId).order("season").order("episode_number");
    if (error) showToast("Failed to load episodes: " + error.message, "error");
    else setEpisodesList(data || []);
    setEpisodesLoading(false);
  }

  function startEpisodeEdit(ep) {
    setEditingEpisodeId(ep.id);
    setDrawerOpen(true);
    setEpisodeForm({ show_id: ep.show_id, season: ep.season, episode_number: ep.episode_number, title: ep.title ?? "", description: ep.description ?? "", url: ep.url ?? "", thumbnail: ep.thumbnail ?? "", duration: ep.duration ?? "" });
  }

  function cancelEpisodeEdit() { setEditingEpisodeId(null); setEpisodeForm({ ...EMPTY_EPISODE, show_id: selectedShowForEpisodes }); setDrawerOpen(false); }

  async function saveEpisode() {
    if (!episodeForm.title.trim() || !selectedShowForEpisodes) { showToast("Show and title are required.", "error"); return; }
    setEpisodeSaving(true);
    const payload = { ...episodeForm, show_id: selectedShowForEpisodes, season: Number(episodeForm.season), episode_number: Number(episodeForm.episode_number) };
    try {
      if (editingEpisodeId) {
        const { error } = await supabase.from("episodes").update(payload).eq("id", editingEpisodeId);
        if (error) throw error;
        showToast("Episode updated");
        cancelEpisodeEdit();
      } else {
        const { error } = await supabase.from("episodes").insert([payload]);
        if (error) throw error;
        showToast("Episode added");
        setEpisodeForm({ ...EMPTY_EPISODE, show_id: selectedShowForEpisodes });
        setDrawerOpen(false);
      }
      await loadEpisodes(selectedShowForEpisodes);
    } catch (error) { showToast("Save failed: " + error.message, "error"); }
    setEpisodeSaving(false);
  }

  async function deleteEpisode(id) {
    const { error } = await supabase.from("episodes").delete().eq("id", id);
    if (error) showToast("Delete failed: " + error.message, "error");
    else { showToast("Episode deleted"); setDeleteEpisodeConfirm(null); await loadEpisodes(selectedShowForEpisodes); }
  }

  // ──── PODCASTS ────

  async function loadPodcasts() {
    setPodcastsLoading(true);
    const { data, error } = await supabase.from("podcasts").select("*").order("id", { ascending: true });
    if (error) showToast("Failed to load podcasts: " + error.message, "error");
    else setPodcastsList(data || []);
    setPodcastsLoading(false);
  }

  function startPodcastEdit(p) {
    setEditingPodcastId(p.id);
    setDrawerOpen(true);
    setPodcastForm({ title: p.title ?? "", host: p.host ?? "", description: p.description ?? "", artwork_url: p.artwork_url ?? "", link_url: p.link_url ?? "", episode_count: p.episode_count ?? "", tags: Array.isArray(p.tags) ? p.tags.join(", ") : (p.tags ?? ""), enabled: p.enabled ?? true });
  }

  function cancelPodcastEdit() { setEditingPodcastId(null); setPodcastForm(EMPTY_PODCAST); setDrawerOpen(false); }

  async function savePodcast() {
    if (!podcastForm.title.trim()) { showToast("Title is required.", "error"); return; }
    setPodcastSaving(true);
    const payload = { ...podcastForm, episode_count: podcastForm.episode_count !== "" ? Number(podcastForm.episode_count) : null, tags: podcastForm.tags ? podcastForm.tags.split(",").map(t => t.trim()).filter(Boolean) : [] };
    try {
      if (editingPodcastId) {
        const { error } = await supabase.from("podcasts").update(payload).eq("id", editingPodcastId);
        if (error) throw error;
        showToast("Podcast updated");
        cancelPodcastEdit();
      } else {
        const { error } = await supabase.from("podcasts").insert([payload]);
        if (error) throw error;
        showToast("Podcast added");
        setPodcastForm(EMPTY_PODCAST);
        setDrawerOpen(false);
      }
      await loadPodcasts();
    } catch (error) { showToast("Save failed: " + error.message, "error"); }
    setPodcastSaving(false);
  }

  async function deletePodcast(id) {
    await supabase.from("podcast_episodes").delete().eq("podcast_id", id);
    const { error } = await supabase.from("podcasts").delete().eq("id", id);
    if (error) showToast("Delete failed: " + error.message, "error");
    else {
      showToast("Podcast deleted");
      setDeletePodcastConfirm(null);
      if (selectedPodcastForEp?.id === id) { setSelectedPodcastForEp(null); setPodEpList([]); cancelPodEpEdit(); }
      await loadPodcasts();
    }
  }

  // ──── PODCAST EPISODES ────

  async function loadPodEpisodes(podcastId) {
    if (!podcastId) return;
    setPodEpLoading(true);
    const { data, error } = await supabase.from("podcast_episodes").select("*")
      .eq("podcast_id", podcastId).order("episode_number", { ascending: true });
    if (error) showToast("Failed to load episodes: " + error.message, "error");
    else setPodEpList(data || []);
    setPodEpLoading(false);
  }

  function startPodEpEdit(ep) {
    setEditingPodEpId(ep.id);
    setPodEpForm({ podcast_id: ep.podcast_id, episode_number: ep.episode_number, title: ep.title ?? "", description: ep.description ?? "", audio_url: ep.audio_url ?? "", duration: ep.duration ?? "", thumbnail: ep.thumbnail ?? "" });
  }

  function cancelPodEpEdit() {
    setEditingPodEpId(null);
    setPodEpForm({ ...EMPTY_PODCAST_EPISODE, podcast_id: selectedPodcastForEp?.id ?? "" });
  }

  async function savePodEp() {
    if (!podEpForm.title.trim() || !selectedPodcastForEp) { showToast("Podcast and title are required.", "error"); return; }
    setPodEpSaving(true);
    const payload = { ...podEpForm, podcast_id: selectedPodcastForEp.id, episode_number: Number(podEpForm.episode_number) };
    try {
      if (editingPodEpId) {
        const { error } = await supabase.from("podcast_episodes").update(payload).eq("id", editingPodEpId);
        if (error) throw error;
        showToast("Episode updated");
        cancelPodEpEdit();
      } else {
        const { error } = await supabase.from("podcast_episodes").insert([payload]);
        if (error) throw error;
        showToast("Episode added");
        setPodEpForm({ ...EMPTY_PODCAST_EPISODE, podcast_id: selectedPodcastForEp.id });
      }
      await loadPodEpisodes(selectedPodcastForEp.id);
    } catch (err) { showToast("Save failed: " + err.message, "error"); }
    setPodEpSaving(false);
  }

  async function deletePodEp(id) {
    const { error } = await supabase.from("podcast_episodes").delete().eq("id", id);
    if (error) showToast("Delete failed: " + error.message, "error");
    else { showToast("Episode deleted"); setDeletePodEpConfirm(null); await loadPodEpisodes(selectedPodcastForEp.id); }
  }

  // ──── LIVE STREAMS ────

  async function loadLiveStreams() {
    setLiveLoading(true);
    const { data, error } = await supabase.from("live_streams").select("*").order("id", { ascending: true });
    if (error) showToast("Failed to load streams: " + error.message, "error");
    else setLiveList(data || []);
    setLiveLoading(false);
  }

  function startLiveEdit(s) {
    setEditingLiveId(s.id);
    setDrawerOpen(true);
    setLiveForm({ title: s.title ?? "", description: s.description ?? "", stream_url: s.stream_url ?? "", thumbnail: s.thumbnail ?? "", is_live: s.is_live ?? true, badge_text: s.badge_text ?? "LIVE", channel_number: s.channel_number ?? "", now_airing: s.now_airing ?? "", up_next: s.up_next ?? "" });
  }

  function cancelLiveEdit() { setEditingLiveId(null); setLiveForm(EMPTY_LIVE_STREAM); setDrawerOpen(false); }

  async function saveLiveStream() {
    if (!liveForm.title.trim()) { showToast("Title is required.", "error"); return; }
    setLiveSaving(true);
    try {
      if (editingLiveId) {
        const { error } = await supabase.from("live_streams").update(liveForm).eq("id", editingLiveId);
        if (error) throw error;
        showToast("Stream updated"); cancelLiveEdit();
      } else {
        const { error } = await supabase.from("live_streams").insert([liveForm]);
        if (error) throw error;
        showToast("Stream added"); setLiveForm(EMPTY_LIVE_STREAM); setDrawerOpen(false);
      }
      await loadLiveStreams();
    } catch (error) { showToast("Save failed: " + error.message, "error"); }
    setLiveSaving(false);
  }

  async function toggleLive(s) {
    const { error } = await supabase.from("live_streams").update({ is_live: !s.is_live }).eq("id", s.id);
    if (error) showToast("Update failed: " + error.message, "error");
    else { showToast(s.is_live ? "Stream is now offline" : "🔴 Stream is live!"); await loadLiveStreams(); }
  }

  // ──── EPG ────

  function parseDurationSecs(dur) {
    if (!dur) return 0;
    if (typeof dur === "number") return dur;
    if (typeof dur === "string" && dur.includes(":")) {
      const parts = dur.split(":").map(Number);
      return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
    }
    return parseInt(dur) || 0;
  }

  async function loadEpgEntries(channelId, dayOffset = 0) {
    setEpgLoading(true);
    const dayStart = new Date();
    dayStart.setDate(dayStart.getDate() + dayOffset);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);
    const { data } = await supabase.from("epg_entries")
      .select("*").eq("channel_id", channelId)
      .gte("start_time", dayStart.toISOString())
      .lte("start_time", dayEnd.toISOString())
      .order("start_time", { ascending: true });
    setEpgEntries(data || []);
    setEpgLoading(false);
  }

  async function loadContentForEpg() {
    if (allVideosForEpg.length > 0) return;
    const [vRes, eRes, sRes] = await Promise.all([
      supabase.from("videos").select("id, title, duration, thumbnail").order("title"),
      supabase.from("episodes").select("id, title, duration, thumbnail, show_id, season, episode_number").order("season").order("episode_number"),
      supabase.from("shows").select("id, title").order("title"),
    ]);
    const showNameMap = {};
    (sRes.data || []).forEach(s => { showNameMap[s.id] = s.title; });
    const eps = (eRes.data || []).map(ep => ({ ...ep, _showTitle: showNameMap[ep.show_id] || "Unknown Show" }));
    setAllVideosForEpg(vRes.data || []);
    setAllEpisodesForEpg(eps);
  }

  async function startEpgAdd() {
    setEditingEpgId(null);
    let defaultStart = "";
    if (selectedChannelForEpg) {
      const { data } = await supabase
        .from("epg_entries").select("end_time")
        .eq("channel_id", selectedChannelForEpg.id)
        .gte("end_time", new Date().toISOString())
        .order("end_time", { ascending: false })
        .limit(1).single();
      if (data?.end_time) defaultStart = data.end_time.slice(0, 16);
    }
    if (!defaultStart) {
      const d = new Date();
      d.setUTCMinutes(0, 0, 0);
      d.setUTCHours(d.getUTCHours() + 1);
      defaultStart = d.toISOString().slice(0, 16);
    }
    setEpgForm({ content_id: "", content_type: "movie", title: "", description: "", start_time: defaultStart, end_time: "" });
    setDrawerFormType("epg");
    setDrawerOpen(true);
  }

  async function startBulkSchedule() {
    setBulkContentType("episode");
    setBulkShowId("");
    setBulkSelectedEps(new Set());
    setBulkSelectedMovies(new Set());
    setBulkMovieSearch("");
    let defaultStart = "";
    if (selectedChannelForEpg) {
      const { data } = await supabase
        .from("epg_entries").select("end_time")
        .eq("channel_id", selectedChannelForEpg.id)
        .gte("end_time", new Date().toISOString())
        .order("end_time", { ascending: false })
        .limit(1).single();
      if (data?.end_time) defaultStart = data.end_time.slice(0, 16);
    }
    if (!defaultStart) {
      const d = new Date();
      d.setUTCMinutes(0, 0, 0);
      d.setUTCHours(d.getUTCHours() + 1);
      defaultStart = d.toISOString().slice(0, 16);
    }
    setBulkStartTime(defaultStart);
    setDrawerFormType("bulk");
    setDrawerOpen(true);
    loadContentForEpg();
  }

  const [bulkScanning, setBulkScanning] = useState(false);
  const [bulkScanProgress, setBulkScanProgress] = useState({ done: 0, total: 0 });

  function detectVideoDuration(url) {
    return new Promise(resolve => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => { resolve(Math.round(video.duration)); video.src = ""; };
      video.onerror = () => resolve(null);
      video.src = url;
      setTimeout(() => resolve(null), 8000); // 8s timeout per video
    });
  }

  async function scanEpisodeDurations() {
    if (!bulkShowId) return;
    const eps = allEpisodesForEpg.filter(ep => ep.show_id === Number(bulkShowId) && !parseDurationSecs(ep.duration));
    if (eps.length === 0) return;
    setBulkScanning(true);
    setBulkScanProgress({ done: 0, total: eps.length });
    const updates = [];
    for (let i = 0; i < eps.length; i++) {
      const ep = eps[i];
      // Fetch video_url from DB (not in allEpisodesForEpg — we only selected a subset of columns)
      const { data } = await supabase.from("episodes").select("id, video_url").eq("id", ep.id).single();
      if (data?.video_url) {
        const secs = await detectVideoDuration(data.video_url);
        if (secs && secs > 0) {
          await supabase.from("episodes").update({ duration: secs }).eq("id", ep.id);
          updates.push({ id: ep.id, duration: secs });
        }
      }
      setBulkScanProgress({ done: i + 1, total: eps.length });
    }
    // Update local state so preview reflects new durations
    if (updates.length > 0) {
      setAllEpisodesForEpg(prev => prev.map(ep => {
        const u = updates.find(u => u.id === ep.id);
        return u ? { ...ep, duration: u.duration } : ep;
      }));
      showToast(`Found durations for ${updates.length} episode${updates.length !== 1 ? "s" : ""}`);
    } else {
      showToast("Couldn't detect durations — check video URLs are accessible", "error");
    }
    setBulkScanning(false);
  }

  async function saveBulkSchedule() {
    if (!selectedChannelForEpg || !bulkStartTime) return;
    setBulkSaving(true);
    const items = bulkContentType === "movie"
      ? allVideosForEpg.filter(v => bulkSelectedMovies.has(v.id))
      : allEpisodesForEpg
          .filter(ep => bulkSelectedEps.has(ep.id))
          .sort((a, b) => a.season - b.season || a.episode_number - b.episode_number);
    if (items.length === 0) { setBulkSaving(false); return; }
    let current = new Date(bulkStartTime);
    const fallbackSecs = (bulkDefaultMins || 30) * 60;
    const entries = items.map(item => {
      const secs = parseDurationSecs(item.duration);
      const dur = secs > 0 ? secs : fallbackSecs;
      const start = new Date(current);
      current = new Date(current.getTime() + dur * 1000);
      return {
        channel_id: selectedChannelForEpg.id,
        content_id: item.id,
        content_type: bulkContentType === "movie" ? "movie" : "episode",
        title: bulkContentType === "episode"
          ? `${item.title} · S${item.season}E${item.episode_number}`
          : item.title,
        description: null,
        start_time: start.toISOString(),
        end_time: current.toISOString(),
      };
    });
    const { error } = await supabase.from("epg_entries").insert(entries);
    if (error) showToast("Error: " + error.message, "error");
    else {
      showToast(`${entries.length} program${entries.length !== 1 ? "s" : ""} scheduled!`);
      closeDrawer();
      await loadEpgEntries(selectedChannelForEpg.id, epgDayOffset);
    }
    setBulkSaving(false);
  }

  function startEpgEdit(entry) {
    setEditingEpgId(entry.id);
    setEpgForm({
      content_id: entry.content_id ? String(entry.content_id) : "",
      content_type: entry.content_type ?? "movie",
      title: entry.title ?? "",
      description: entry.description ?? "",
      start_time: entry.start_time ? entry.start_time.slice(0, 16) : "",
      end_time: entry.end_time ? entry.end_time.slice(0, 16) : "",
    });
    setDrawerFormType("epg");
    setDrawerOpen(true);
  }

  function handleEpgContentSelect(contentId) {
    if (!contentId) { setEpgForm(f => ({ ...f, content_id: "", title: "" })); return; }
    const content = epgForm.content_type === "movie"
      ? allVideosForEpg.find(v => v.id === Number(contentId))
      : allEpisodesForEpg.find(e => e.id === Number(contentId));
    if (!content) return;
    const title = epgForm.content_type === "episode"
      ? `${content.title} · S${content.season}E${content.episode_number}`
      : content.title;
    let endTime = epgForm.end_time;
    if (content.duration && epgForm.start_time) {
      let secs = 0;
      if (typeof content.duration === "number") secs = content.duration;
      else if (typeof content.duration === "string" && content.duration.includes(":")) {
        const parts = content.duration.split(":").map(Number);
        secs = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
      }
      if (secs > 0) {
        const end = new Date(new Date(epgForm.start_time).getTime() + secs * 1000);
        endTime = end.toISOString().slice(0, 16);
      }
    }
    setEpgForm(f => ({ ...f, content_id: String(contentId), title, end_time: endTime }));
  }

  async function saveEpgEntry() {
    if (!epgForm.title.trim() || !epgForm.start_time || !epgForm.end_time || !selectedChannelForEpg) return;
    setEpgSaving(true);
    const payload = {
      channel_id: selectedChannelForEpg.id,
      content_id: epgForm.content_id ? Number(epgForm.content_id) : null,
      content_type: epgForm.content_id ? epgForm.content_type : null,
      title: epgForm.title.trim(),
      description: epgForm.description || null,
      start_time: new Date(epgForm.start_time).toISOString(),
      end_time: new Date(epgForm.end_time).toISOString(),
    };
    const { error } = editingEpgId
      ? await supabase.from("epg_entries").update(payload).eq("id", editingEpgId)
      : await supabase.from("epg_entries").insert([payload]);
    if (error) showToast("Error: " + error.message, "error");
    else {
      showToast(editingEpgId ? "Program updated" : "Program added");
      closeDrawer();
      await loadEpgEntries(selectedChannelForEpg.id, epgDayOffset);
    }
    setEpgSaving(false);
  }

  async function deleteEpgEntry(id) {
    await supabase.from("epg_entries").delete().eq("id", id);
    showToast("Program removed");
    setDeleteEpgConfirm(null);
    await loadEpgEntries(selectedChannelForEpg.id, epgDayOffset);
  }

  async function deleteLiveStream(id) {
    const { error } = await supabase.from("live_streams").delete().eq("id", id);
    if (error) showToast("Delete failed: " + error.message, "error");
    else { showToast("Stream deleted"); setDeleteLiveConfirm(null); await loadLiveStreams(); }
  }

  // Filter rows
  const filteredRows = rows.filter(row => {
    const matchesSearch =
      row.title?.toLowerCase().includes(searchFilter.toLowerCase()) ||
      row.category?.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesCategory = categoryFilter === "All" || row.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const PAD = "clamp(24px, 4vw, 64px)";

  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#0f172a" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 32,
            right: 32,
            zIndex: 999,
            background: toast.type === "error" ? "#fef2f2" : "#f0fdf4",
            border: `1px solid ${toast.type === "error" ? "#fca5a5" : "#86efac"}`,
            color: toast.type === "error" ? "#991b1b" : "#166534",
            padding: "12px 20px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Hero Confirm Modal */}
      {heroConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "36px 40px", width: 440, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>★</div>
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "#0f172a" }}>Change Hero Banner?</p>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>
              Currently showing: <span style={{ color: "#4f46e5", fontWeight: 600 }}>"{heroConfirm.current.title}"</span>
            </p>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 28 }}>
              Replace with: <span style={{ color: "#0f172a", fontWeight: 600 }}>"{heroConfirm.next.title}"</span>
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setHeroConfirm(null)} style={{ flex: 1, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "11px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => applyHero(heroConfirm.next, heroConfirm.type)} style={{ flex: 1, background: "#4f46e5", border: "none", borderRadius: 7, padding: "11px", color: "#ffffff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Yes, Switch</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal - Carousel */}
      {deleteCarouselConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "36px 40px", width: 400, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "#0f172a" }}>Delete this carousel?</p>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 28 }}>"{deleteCarouselConfirm.title}" will be permanently removed.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setDeleteCarouselConfirm(null)}
                style={{ flex: 1, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "11px", color: "#374151", fontSize: 13, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteCarousel(deleteCarouselConfirm.id)}
                style={{ flex: 1, background: "#dc2626", border: "none", borderRadius: 7, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ borderBottom: "1px solid #e2e8f0", padding: `0 ${PAD}`, display: "flex", alignItems: "center", justifyContent: "space-between", height: "auto", minHeight: 68, flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22 }}>
            <span style={{ color: "#4f46e5" }}>peep.</span>
          </span>
          <span style={{ fontSize: 13, color: "#6b7280", borderLeft: "1px solid #e2e8f0", paddingLeft: 24 }}>
            Content Management System
          </span>
        </div>
        <button
          onClick={onExit}
          style={{
            background: "#f1f5f9",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: "7px 16px",
            color: "#374151",
            fontSize: 13,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Exit CMS
        </button>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: "1px solid #e2e8f0", padding: `0 ${PAD}`, display: "flex", gap: 24, background: "#ffffff" }}>
        <button
          onClick={() => setTab("videos")}
          style={{ background: "transparent", border: "none", borderBottom: tab === "videos" ? "2px solid #4f46e5" : "none", color: tab === "videos" ? "#0f172a" : "#6b7280", padding: "16px 0", fontSize: 14, fontWeight: tab === "videos" ? 600 : 400, cursor: "pointer", transition: "color 0.2s" }}
        >
          Content ({rows.length + showsList.length + podcastsList.length})
        </button>
        <button onClick={() => setTab("carousels")} style={{ background: "transparent", border: "none", borderBottom: tab === "carousels" ? "2px solid #4f46e5" : "none", color: tab === "carousels" ? "#0f172a" : "#6b7280", padding: "16px 0", fontSize: 14, fontWeight: tab === "carousels" ? 600 : 400, cursor: "pointer", transition: "color 0.2s" }}>
          Carousels ({carousels.length})
        </button>
        <button onClick={() => setTab("live")} style={{ background: "transparent", border: "none", borderBottom: tab === "live" ? "2px solid #ef4444" : "none", color: tab === "live" ? "#ef4444" : "#6b7280", padding: "16px 0", fontSize: 14, fontWeight: tab === "live" ? 600 : 400, cursor: "pointer", transition: "color 0.2s" }}>
          Live ({liveList.length})
        </button>
        <button onClick={() => setTab("reports")} style={{ background: "transparent", border: "none", borderBottom: tab === "reports" ? "2px solid #34d399" : "none", color: tab === "reports" ? "#34d399" : "#6b7280", padding: "16px 0", fontSize: 14, fontWeight: tab === "reports" ? 600 : 400, cursor: "pointer", transition: "color 0.2s" }}>
          Reports
        </button>
      </div>

      <div style={{ maxWidth: 1600, margin: "0 auto", padding: `40px ${PAD} 80px` }}>

        {/* ────── VIDEOS SUB-TAB BAR ────── */}
        {tab === "videos" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 8, paddingBottom: 20, borderBottom: "1px solid #e2e8f0" }}>
            {[
              { key: "movies", label: "Movies", count: rows.length },
              { key: "series", label: "Series", count: showsList.length },
              { key: "episodes", label: "Episodes", count: null },
              { key: "podcasts", label: "Podcasts", count: podcastsList.length },
            ].map(({ key, label, count }) => (
              <button key={key} onClick={() => setVideoSubTab(key)} style={{ background: videoSubTab === key ? "rgba(79,70,229,0.08)" : "transparent", border: `1px solid ${videoSubTab === key ? "rgba(79,70,229,0.3)" : "#e2e8f0"}`, borderRadius: 8, padding: "7px 16px", color: videoSubTab === key ? "#4f46e5" : "#6b7280", fontSize: 13, fontWeight: videoSubTab === key ? 600 : 400, cursor: "pointer", transition: "all 0.15s" }}>
                {label}{count !== null ? ` (${count})` : ""}
              </button>
            ))}
          </div>
        )}

        {/* ────── VIDEOS TAB — MOVIES ────── */}
        {tab === "videos" && videoSubTab === "movies" && (
          <>
            <div>
              {/* Header row with Add button */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Movies ({rows.length})</h2>
                <button
                  onClick={() => { setForm(EMPTY_ROW); setEditingId(null); setDrawerOpen(true); }}
                  style={{ background: "#4f46e5", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                >
                  + Add Movie
                </button>
              </div>

          {/* Controls */}
          <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <input
                type="text"
                placeholder="Search title or category..."
                value={searchFilter}
                onChange={e => setSearchFilter(e.target.value)}
                style={{
                  width: "100%",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: 8,
                  padding: "10px 14px",
                  color: "#0f172a",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["All", ...categories].map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  style={{
                    background: categoryFilter === cat ? "#4f46e5" : "#f1f5f9",
                    border: `1px solid ${categoryFilter === cat ? "#4f46e5" : "#e2e8f0"}`,
                    borderRadius: 6,
                    padding: "8px 14px",
                    color: categoryFilter === cat ? "#fff" : "#6b7280",
                    fontSize: 12,
                    cursor: "pointer",
                    fontWeight: categoryFilter === cat ? 600 : 400,
                  }}
                >
                  {cat}
                </button>
              ))}
            </div>
            <button
              onClick={loadRows}
              style={{
                background: "#f1f5f9",
                border: "1px solid #e2e8f0",
                borderRadius: 6,
                padding: "10px 14px",
                color: "#6b7280",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              ↺ Refresh
            </button>
          </div>

          {/* Table Header */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 100px 100px 100px 100px",
                gap: 16,
                padding: "14px 16px",
                borderBottom: "1px solid #e2e8f0",
                background: "#f8fafc",
              }}
            >
              <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase" }}>Thumb</span>
              <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase" }}>Title & Info</span>
              <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase" }}>Category</span>
              <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase" }}>Year</span>
              <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase" }}>Score</span>
              <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase" }}>Actions</span>
            </div>

            {/* Rows */}
            {loading ? (
              <div style={{ padding: "40px", textAlign: "center" }}>
                <Spinner />
              </div>
            ) : filteredRows.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#6b7280", fontSize: 14 }}>
                {rows.length === 0 ? "No rows yet. Add one using the form." : "No results found."}
              </div>
            ) : (
              <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
                {filteredRows.map((row, idx) => (
                  <div
                    key={row.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "80px 1fr 100px 100px 100px 100px",
                      gap: 16,
                      padding: "12px 16px",
                      borderBottom: idx < filteredRows.length - 1 ? "1px solid #f1f5f9" : "none",
                      alignItems: "center",
                      background: editingId === row.id ? "rgba(79,70,229,0.04)" : "transparent",
                      borderLeft: editingId === row.id ? "2px solid #4f46e5" : "none",
                      paddingLeft: editingId === row.id ? 14 : 16,
                      transition: "background 0.2s",
                    }}
                  >
                    {/* Thumbnail */}
                    <div>
                      <img
                        src={row.thumbnail}
                        alt={row.title}
                        style={{
                          width: 64,
                          height: 40,
                          objectFit: "cover",
                          borderRadius: 4,
                          background: "#f1f5f9",
                        }}
                        onError={e => {
                          e.target.style.display = "none";
                        }}
                      />
                    </div>

                    {/* Title & Info */}
                    <div>
                      <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                        {row.title}
                      </p>
                      <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#6b7280" }}>
                        {row.duration && <span>{row.duration}</span>}
                        {row.rating && <span>{row.rating}</span>}
                      </div>
                    </div>

                    {/* Category */}
                    <div>
                      <span style={{ fontSize: 12, color: "#4f46e5", fontWeight: 500 }}>
                        {row.category}
                      </span>
                    </div>

                    {/* Year */}
                    <div>
                      <span style={{ fontSize: 12, color: "#6b7280" }}>
                        {row.year || "—"}
                      </span>
                    </div>

                    {/* Score */}
                    <div>
                      <span style={{ fontSize: 12, color: row.score ? "#4ade80" : "#9ca3af", fontWeight: 500 }}>
                        {row.score ? row.score + "%" : "—"}
                      </span>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setHeroVideo(row)} style={{ background: row.featured ? "rgba(79,70,229,0.1)" : "#f8fafc", border: `1px solid ${row.featured ? "rgba(79,70,229,0.3)" : "#e2e8f0"}`, borderRadius: 5, padding: "5px 10px", color: row.featured ? "#4f46e5" : "#6b7280", fontSize: 11, cursor: "pointer", fontWeight: 500 }} title="Set as hero banner">
                        {row.featured ? "★ Hero" : "☆ Hero"}
                      </button>
                      <button onClick={() => startEdit(row)} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 5, padding: "5px 10px", color: "#374151", fontSize: 11, cursor: "pointer", fontWeight: 500 }}>Edit</button>
                      <button onClick={() => setDeleteConfirm(row)} style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 5, padding: "5px 10px", color: "#f87171", fontSize: 11, cursor: "pointer", fontWeight: 500 }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stats */}
          <div style={{ marginTop: 16, padding: "12px 16px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12, color: "#6b7280" }}>
            Showing {filteredRows.length} of {rows.length} rows
          </div>
        </div>
          </>
        )}

        {/* ────── VIDEOS TAB — SERIES ────── */}
        {tab === "videos" && videoSubTab === "series" && (
          <>
            <div>
              {/* Header row with Add button */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0f172a" }}>All Shows ({showsList.length})</h2>
                <button
                  onClick={() => { setShowForm(EMPTY_SHOW); setEditingShowId(null); setDrawerOpen(true); }}
                  style={{ background: "#4f46e5", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                >
                  + Add Series
                </button>
              </div>
              {showsLoading ? <div style={{ color: "#6b7280", padding: 20 }}>Loading...</div> : showsList.length === 0 ? (
                <div style={{ color: "#6b7280", padding: 40, textAlign: "center" }}>No shows yet.</div>
              ) : showsList.map(show => (
                <div key={show.id} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 20px", marginBottom: 12, display: "flex", gap: 16, alignItems: "center" }}>
                  {(show.poster || show.thumbnail) && <img src={show.poster || show.thumbnail} alt={show.title} style={{ width: 44, height: 64, objectFit: "cover", borderRadius: 5, flexShrink: 0 }} />}
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>{show.title}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>{show.category} · {show.year} · {show.rating}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setHeroShow(show)} style={{ background: show.featured ? "rgba(79,70,229,0.1)" : "#f8fafc", border: `1px solid ${show.featured ? "rgba(79,70,229,0.3)" : "#e2e8f0"}`, borderRadius: 5, padding: "5px 10px", color: show.featured ? "#4f46e5" : "#6b7280", fontSize: 11, cursor: "pointer", fontWeight: 500 }}>
                      {show.featured ? "★ Hero" : "☆ Hero"}
                    </button>
                    <button onClick={() => { setVideoSubTab("episodes"); setSelectedShowForEpisodes(String(show.id)); loadEpisodes(String(show.id)); setEpisodeForm({ ...EMPTY_EPISODE, show_id: String(show.id) }); }} style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 5, padding: "5px 10px", color: "#60a5fa", fontSize: 11, cursor: "pointer", fontWeight: 500 }}>Episodes</button>
                    <button onClick={() => startShowEdit(show)} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 5, padding: "5px 10px", color: "#374151", fontSize: 11, cursor: "pointer" }}>Edit</button>
                    <button onClick={() => setDeleteShowConfirm(show)} style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 5, padding: "5px 10px", color: "#f87171", fontSize: 11, cursor: "pointer" }}>Delete</button>
                  </div>
                </div>
              ))}

              {deleteShowConfirm && (
                <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "36px 40px", width: 400, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
                    <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "#0f172a" }}>Delete "{deleteShowConfirm.title}"?</p>
                    <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 28 }}>All episodes will also be deleted.</p>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => setDeleteShowConfirm(null)} style={{ flex: 1, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "11px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                      <button onClick={() => deleteShow(deleteShowConfirm.id)} style={{ flex: 1, background: "#dc2626", border: "none", borderRadius: 7, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ────── VIDEOS TAB — EPISODES ────── */}
        {tab === "videos" && videoSubTab === "episodes" && (
          <>
            <div>
              {/* Header row with show selector and Add button */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Episodes</h2>
                  <select value={selectedShowForEpisodes} onChange={e => { setSelectedShowForEpisodes(e.target.value); loadEpisodes(e.target.value); setEpisodeForm({ ...EMPTY_EPISODE, show_id: e.target.value }); cancelEpisodeEdit(); }}
                    style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "8px 12px", color: "#0f172a", fontSize: 13, outline: "none" }}>
                    <option value="">Select a show...</option>
                    {showsList.map(s => <option key={s.id} value={String(s.id)}>{s.title}</option>)}
                  </select>
                </div>
                <button
                  onClick={() => { setEpisodeForm({ ...EMPTY_EPISODE, show_id: selectedShowForEpisodes }); setEditingEpisodeId(null); setDrawerOpen(true); }}
                  style={{ background: "#4f46e5", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                >
                  + Add Episode
                </button>
              </div>

              {!selectedShowForEpisodes ? (
                <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Select a show to manage its episodes.</div>
              ) : (
                <>
                  <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>
                    Episodes — {showsList.find(s => String(s.id) === selectedShowForEpisodes)?.title}
                  </h3>
                  {episodesLoading ? <div style={{ color: "#6b7280", padding: 20 }}>Loading...</div> : episodesList.length === 0 ? (
                    <div style={{ color: "#6b7280", padding: 40, textAlign: "center" }}>No episodes yet. Add one using the button above.</div>
                  ) : episodesList.map(ep => (
                    <div key={ep.id} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px", marginBottom: 10, display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ flexShrink: 0, width: 80, aspectRatio: "16/9", borderRadius: 5, overflow: "hidden", background: "#f1f5f9" }}>
                        {ep.thumbnail && <img src={ep.thumbnail} alt={ep.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 600 }}>S{ep.season} E{ep.episode_number} · {ep.title}</p>
                        <p style={{ margin: 0, fontSize: 11, color: "#6b7280" }}>{ep.duration || "No duration"}</p>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => startEpisodeEdit(ep)} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 5, padding: "5px 10px", color: "#374151", fontSize: 11, cursor: "pointer" }}>Edit</button>
                        <button onClick={() => setDeleteEpisodeConfirm(ep)} style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 5, padding: "5px 10px", color: "#f87171", fontSize: 11, cursor: "pointer" }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {deleteEpisodeConfirm && (
                <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "36px 40px", width: 400, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
                    <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "#0f172a" }}>Delete this episode?</p>
                    <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 28 }}>S{deleteEpisodeConfirm.season} E{deleteEpisodeConfirm.episode_number} · "{deleteEpisodeConfirm.title}"</p>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => setDeleteEpisodeConfirm(null)} style={{ flex: 1, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "11px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                      <button onClick={() => deleteEpisode(deleteEpisodeConfirm.id)} style={{ flex: 1, background: "#dc2626", border: "none", borderRadius: 7, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* ────── CAROUSELS TAB ────── */}
        {tab === "carousels" && (
          <div>
            {/* Header row with Add button */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Content Rows ({carousels.length}) <span style={{ color: "#6b7280", fontWeight: 400, fontSize: 13 }}>— ▲▼ to reorder</span></h2>
              <button
                onClick={() => { setCarouselForm(EMPTY_CAROUSEL); setEditingCarouselId(null); setDrawerOpen(true); }}
                style={{ background: "#4f46e5", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
              >
                + Add Carousel
              </button>
            </div>

            {carouselLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading…</div>
            ) : carousels.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#6b7280", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                <p style={{ margin: 0, fontSize: 14 }}>No rows yet. Create your first one.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {carousels.map((carousel, idx) => {
                  const t = carousel.type;
                  const ct = carousel.content_type;
                  const rowPages = (carousel.pages || "home").split(",").map(p => p.trim()).filter(Boolean);
                  const contentLabel = t === "podcast" ? "Podcasts" : ct === "movies" ? "Movies only" : ct === "shows" ? "Series only" : "All content";
                  const orderLabel = t === "trending" ? "Trending" : t === "category" ? `Genre: ${carousel.filter_value || "?"}` : t === "podcast" ? (carousel.filter_value ? `Tag: ${carousel.filter_value}` : "All podcasts") : "Default order";
                  const contentColor = t === "podcast" ? "#a78bfa" : ct === "movies" ? "#60a5fa" : ct === "shows" ? "#34d399" : "#f59e0b";
                  const pageLabels = { home: "Home", movies: "Movies", series: "Series" };
                  return (
                    <div key={carousel.id} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                        <button onClick={() => moveCarousel(idx, -1)} disabled={idx === 0} style={{ background: "transparent", border: "none", color: idx === 0 ? "#e2e8f0" : "#6b7280", cursor: idx === 0 ? "default" : "pointer", fontSize: 11, padding: "2px 5px", lineHeight: 1 }}>▲</button>
                        <button onClick={() => moveCarousel(idx, 1)} disabled={idx === carousels.length - 1} style={{ background: "transparent", border: "none", color: idx === carousels.length - 1 ? "#e2e8f0" : "#6b7280", cursor: idx === carousels.length - 1 ? "default" : "pointer", fontSize: 11, padding: "2px 5px", lineHeight: 1 }}>▼</button>
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: "0 0 7px", fontSize: 14, fontWeight: 600, color: carousel.enabled ? "#0f172a" : "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{carousel.title}</p>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          {rowPages.map(p => (
                            <span key={p} style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 20, background: "rgba(79,70,229,0.08)", color: "#4f46e5", border: "1px solid rgba(79,70,229,0.2)" }}>{pageLabels[p] || p}</span>
                          ))}
                          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: `${contentColor}15`, color: contentColor, border: `1px solid ${contentColor}35` }}>{contentLabel}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: "#f1f5f9", color: "#6b7280", border: "1px solid #e2e8f0" }}>{orderLabel}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: carousel.enabled ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.04)", color: carousel.enabled ? "#10b981" : "#555", border: `1px solid ${carousel.enabled ? "rgba(16,185,129,0.3)" : "#222"}` }}>{carousel.enabled ? "Live" : "Hidden"}</span>
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        <button onClick={() => startCarouselEdit(carousel)} style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 6, padding: "6px 12px", color: "#60a5fa", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Edit</button>
                        <button onClick={() => setDeleteCarouselConfirm(carousel)} style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 6, padding: "6px 12px", color: "#f87171", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: 12, fontSize: 12, color: "#9ca3af", textAlign: "right" }}>
              {carousels.length} row{carousels.length !== 1 ? "s" : ""} total
            </div>
          </div>
        )}
        {/* ────── LIVE TAB ────── */}
        {tab === "live" && (
          <div>
            {/* Header row with Add button */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600, color: "#0f172a" }}>All Streams ({liveList.length})</h2>
                <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Toggle a stream to Live to show it on the homepage "Live Now" section.</p>
              </div>
              <button
                onClick={() => { setLiveForm(EMPTY_LIVE_STREAM); setEditingLiveId(null); setDrawerOpen(true); }}
                style={{ background: "#ef4444", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
              >
                + Add Stream
              </button>
            </div>

            {liveLoading ? (
              <div style={{ color: "#6b7280", padding: 40, textAlign: "center" }}>Loading...</div>
            ) : liveList.length === 0 ? (
              <div style={{ color: "#6b7280", padding: 40, textAlign: "center", border: "1px dashed #e2e8f0", borderRadius: 10 }}>No streams yet.</div>
            ) : liveList.map(s => (
              <div key={s.id} style={{ background: "#ffffff", border: `1px solid ${s.is_live ? "rgba(239,68,68,0.3)" : "#e2e8f0"}`, borderRadius: 10, padding: "16px 20px", marginBottom: 12, display: "flex", gap: 14, alignItems: "center" }}>
                {s.channel_number != null && s.channel_number !== "" && (
                  <div style={{ flexShrink: 0, width: 40, height: 40, borderRadius: 8, background: "#f1f5f9", border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}>CH</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#374151", lineHeight: 1 }}>{s.channel_number}</span>
                  </div>
                )}
                {s.thumbnail && <img src={s.thumbnail} alt={s.title} style={{ width: 80, height: 45, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} onError={e => { e.target.style.display = "none"; }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{s.title}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
                    <span style={{ color: s.is_live ? "#ef4444" : "#9ca3af", fontWeight: s.is_live ? 600 : 400 }}>{s.is_live ? "🔴 LIVE" : "○ Offline"}</span>
                    {s.now_airing && <span style={{ color: "#6b7280" }}> · {s.now_airing}</span>}
                  </p>
                  {s.up_next && <p style={{ margin: "2px 0 0", fontSize: 11, color: "#9ca3af" }}>Up next: {s.up_next}</p>}
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => toggleLive(s)}
                    style={{ background: s.is_live ? "rgba(107,114,128,0.1)" : "rgba(34,197,94,0.1)", border: `1px solid ${s.is_live ? "rgba(107,114,128,0.2)" : "rgba(34,197,94,0.3)"}`, borderRadius: 5, padding: "5px 10px", color: s.is_live ? "#9ca3af" : "#22c55e", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    {s.is_live ? "Go Offline" : "Go Live"}
                  </button>
                  <button onClick={() => startLiveEdit(s)} style={{ background: "rgba(79,70,229,0.08)", border: "1px solid rgba(79,70,229,0.2)", borderRadius: 5, padding: "5px 10px", color: "#4f46e5", fontSize: 11, cursor: "pointer" }}>Edit</button>
                  <button onClick={() => setDeleteLiveConfirm(s)} style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.15)", borderRadius: 5, padding: "5px 10px", color: "#dc2626", fontSize: 11, cursor: "pointer" }}>Delete</button>
                </div>
              </div>
            ))}

            {deleteLiveConfirm && (
              <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "36px 40px", width: 400, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
                  <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "#0f172a" }}>Delete "{deleteLiveConfirm.title}"?</p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setDeleteLiveConfirm(null)} style={{ flex: 1, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "11px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    <button onClick={() => deleteLiveStream(deleteLiveConfirm.id)} style={{ flex: 1, background: "#dc2626", border: "none", borderRadius: 7, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                  </div>
                </div>
              </div>
            )}

            {/* ── EPG SCHEDULE SECTION ── */}
            {liveList.length > 0 && (
              <div style={{ marginTop: 40, paddingTop: 32, borderTop: "2px solid #e2e8f0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                  <div>
                    <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Channel Schedule</h2>
                    <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>Program each channel's EPG — viewers tune in at the right spot automatically</p>
                  </div>
                </div>

                {/* Channel selector */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                  {liveList.map(ch => (
                    <button key={ch.id}
                      onClick={() => {
                        setSelectedChannelForEpg(ch);
                        setEpgDayOffset(0);
                        loadEpgEntries(ch.id, 0);
                        loadContentForEpg();
                      }}
                      style={{ background: selectedChannelForEpg?.id === ch.id ? "#4f46e5" : "#f1f5f9", border: `1px solid ${selectedChannelForEpg?.id === ch.id ? "#4f46e5" : "#e2e8f0"}`, borderRadius: 8, padding: "8px 16px", color: selectedChannelForEpg?.id === ch.id ? "#fff" : "#374151", fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.15s" }}>
                      {ch.channel_number ? `CH ${ch.channel_number} · ` : ""}{ch.title}
                    </button>
                  ))}
                </div>

                {selectedChannelForEpg && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        {[0, 1, 2].map(offset => {
                          const d = new Date(); d.setDate(d.getDate() + offset);
                          const label = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                          return (
                            <button key={offset}
                              onClick={() => { setEpgDayOffset(offset); loadEpgEntries(selectedChannelForEpg.id, offset); }}
                              style={{ background: epgDayOffset === offset ? "#0f172a" : "#f1f5f9", border: `1px solid ${epgDayOffset === offset ? "#0f172a" : "#e2e8f0"}`, borderRadius: 6, padding: "6px 14px", color: epgDayOffset === offset ? "#fff" : "#374151", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                              {label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={startBulkSchedule}
                          style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 16px", color: "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                          ⚡ Auto-Schedule
                        </button>
                        <button
                          onClick={startEpgAdd}
                          style={{ background: "#4f46e5", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                          + Add Program
                        </button>
                      </div>
                    </div>

                    {epgLoading ? (
                      <div style={{ color: "#6b7280", padding: 40, textAlign: "center" }}>Loading schedule…</div>
                    ) : epgEntries.length === 0 ? (
                      <div style={{ color: "#6b7280", padding: 40, textAlign: "center", border: "1px dashed #e2e8f0", borderRadius: 10, fontSize: 14 }}>
                        No programs scheduled for this day. Hit <strong>+ Add Program</strong> to start building the guide.
                      </div>
                    ) : (
                      <div>
                        {epgEntries.map(entry => {
                          const start = new Date(entry.start_time);
                          const end = new Date(entry.end_time);
                          const durationMins = Math.round((end - start) / 60000);
                          const now = new Date();
                          const isNow = start <= now && end > now;
                          return (
                            <div key={entry.id} style={{ background: isNow ? "rgba(79,70,229,0.04)" : "#fff", border: `1px solid ${isNow ? "rgba(79,70,229,0.3)" : "#e2e8f0"}`, borderRadius: 10, padding: "14px 18px", marginBottom: 8, display: "flex", gap: 14, alignItems: "center" }}>
                              <div style={{ flexShrink: 0, textAlign: "right", minWidth: 72 }}>
                                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</p>
                                <p style={{ margin: "1px 0 0", fontSize: 11, color: "#9ca3af" }}>{durationMins}m</p>
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                                  {isNow && <span style={{ background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, letterSpacing: 0.5, flexShrink: 0 }}>ON AIR</span>}
                                  <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.title}</p>
                                </div>
                                {entry.description && <p style={{ margin: 0, fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.description}</p>}
                              </div>
                              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                                <button onClick={() => startEpgEdit(entry)} style={{ background: "rgba(79,70,229,0.08)", border: "1px solid rgba(79,70,229,0.2)", borderRadius: 5, padding: "5px 10px", color: "#4f46e5", fontSize: 11, cursor: "pointer" }}>Edit</button>
                                <button onClick={() => setDeleteEpgConfirm(entry)} style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.15)", borderRadius: 5, padding: "5px 10px", color: "#dc2626", fontSize: 11, cursor: "pointer" }}>Remove</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {deleteEpgConfirm && (
                      <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "36px 40px", width: 400, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
                          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "#0f172a" }}>Remove "{deleteEpgConfirm.title}"?</p>
                          <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 20 }}>This will remove it from the schedule.</p>
                          <div style={{ display: "flex", gap: 10 }}>
                            <button onClick={() => setDeleteEpgConfirm(null)} style={{ flex: 1, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "11px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                            <button onClick={() => deleteEpgEntry(deleteEpgConfirm.id)} style={{ flex: 1, background: "#dc2626", border: "none", borderRadius: 7, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Remove</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* ────── PODCASTS SUB-TAB ────── */}
        {tab === "videos" && videoSubTab === "podcasts" && (
          <>
            <div>
              {/* Header row with Add button */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600, color: "#0f172a" }}>All Podcasts ({podcastsList.length})</h2>
                  <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Click <strong style={{ color: "#4f46e5", fontWeight: 600 }}>Episodes</strong> on any podcast to manage its audio episodes.</p>
                </div>
                <button
                  onClick={() => { setPodcastForm(EMPTY_PODCAST); setEditingPodcastId(null); setDrawerOpen(true); }}
                  style={{ background: "#4f46e5", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                >
                  + Add Podcast
                </button>
              </div>

              {podcastsLoading ? (
                <div style={{ color: "#6b7280", padding: 40, textAlign: "center" }}>Loading...</div>
              ) : podcastsList.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", border: "1px dashed #e2e8f0", borderRadius: 10 }}>
                  <p style={{ color: "#6b7280", margin: "0 0 8px", fontSize: 14 }}>No podcasts yet. Add one using the button above.</p>
                  <p style={{ color: "#9ca3af", margin: 0, fontSize: 12 }}>Once added, click <strong style={{ color: "#4f46e5" }}>Episodes</strong> on a podcast to add its audio episodes.</p>
                </div>
              ) : podcastsList.map(pod => (
                <div key={pod.id} style={{ background: "#ffffff", border: `1px solid ${editingPodcastId === pod.id ? "#4f46e5" : selectedPodcastForEp?.id === pod.id ? "#4f46e5" : "#e2e8f0"}`, borderRadius: 10, padding: "14px 16px", marginBottom: 10, display: "flex", gap: 14, alignItems: "center", borderLeft: `3px solid ${editingPodcastId === pod.id || selectedPodcastForEp?.id === pod.id ? "#4f46e5" : "transparent"}` }}>
                  {pod.artwork_url ? (
                    <img src={pod.artwork_url} alt={pod.title} style={{ width: 46, height: 46, objectFit: "cover", borderRadius: 7, flexShrink: 0 }} onError={e => { e.target.style.display = "none"; }} />
                  ) : (
                    <div style={{ width: 46, height: 46, borderRadius: 7, background: "linear-gradient(135deg, #e0e7ff, #c7d2fe)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2">
                        <path d="M12 2a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z"/>
                        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                        <line x1="12" y1="19" x2="12" y2="22"/>
                      </svg>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pod.title}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
                      {pod.host && <span style={{ color: "#4f46e5" }}>{pod.host}</span>}
                      {pod.host && " · "}
                      <span style={{ color: pod.enabled ? "#4ade80" : "#f87171" }}>{pod.enabled ? "Enabled" : "Disabled"}</span>
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => {
                      if (selectedPodcastForEp?.id === pod.id) { setSelectedPodcastForEp(null); setPodEpList([]); cancelPodEpEdit(); }
                      else { setSelectedPodcastForEp(pod); loadPodEpisodes(pod.id); setPodEpForm({ ...EMPTY_PODCAST_EPISODE, podcast_id: pod.id }); cancelPodEpEdit(); }
                    }} style={{ background: selectedPodcastForEp?.id === pod.id ? "rgba(79,70,229,0.15)" : "rgba(79,70,229,0.08)", border: `1px solid ${selectedPodcastForEp?.id === pod.id ? "#4f46e5" : "rgba(79,70,229,0.25)"}`, borderRadius: 5, padding: "5px 10px", color: "#4f46e5", fontSize: 11, cursor: "pointer", fontWeight: selectedPodcastForEp?.id === pod.id ? 700 : 400 }}>
                      {selectedPodcastForEp?.id === pod.id ? "Close" : "Episodes"}
                    </button>
                    <button onClick={() => startPodcastEdit(pod)} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 5, padding: "5px 10px", color: "#374151", fontSize: 11, cursor: "pointer" }}>Edit</button>
                    <button onClick={() => setDeletePodcastConfirm(pod)} style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 5, padding: "5px 10px", color: "#f87171", fontSize: 11, cursor: "pointer" }}>Delete</button>
                  </div>
                </div>
              ))}

              {/* ── Episode panel — inline below the selected podcast ── */}
              {selectedPodcastForEp && (
                <div style={{ marginTop: 24, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                    <div>
                      <h3 style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 700, color: "#4f46e5" }}>Episodes — {selectedPodcastForEp.title}</h3>
                      <p style={{ margin: 0, fontSize: 11, color: "#6b7280" }}>Audio files · upload or paste a URL</p>
                    </div>
                    <button onClick={() => { setSelectedPodcastForEp(null); setPodEpList([]); cancelPodEpEdit(); }}
                      style={{ background: "none", border: "none", color: "#6b7280", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "2px 4px" }}>×</button>
                  </div>

                  {/* Add / Edit episode form */}
                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 20, marginBottom: 20 }}>
                    <p style={{ margin: "0 0 16px", fontSize: 12, fontWeight: 600, color: "#0f172a", textTransform: "uppercase", letterSpacing: 0.6 }}>
                      {editingPodEpId ? "Edit Episode" : "Add Episode"}
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 10 }}>
                        <FieldInput label="Ep #" value={podEpForm.episode_number} onChange={v => setPodEpForm(f => ({ ...f, episode_number: v }))} placeholder="1" type="number" />
                        <FieldInput label="Duration" value={podEpForm.duration} onChange={v => setPodEpForm(f => ({ ...f, duration: v }))} placeholder="42:30" />
                      </div>
                      <FieldInput label="Title *" value={podEpForm.title} onChange={v => setPodEpForm(f => ({ ...f, title: v }))} placeholder="Episode title" />
                      <div>
                        <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Audio File</label>
                        <ImageUploader label="Upload MP4 / MP3 / Audio" folder="podcast-audio" accept="video/mp4,video/mov,video/webm,audio/*" onUploadSuccess={url => setPodEpForm(f => ({ ...f, audio_url: url }))} onError={err => showToast("Upload failed: " + err, "error")} />
                        <input type="text" value={podEpForm.audio_url} onChange={e => setPodEpForm(f => ({ ...f, audio_url: e.target.value }))} placeholder="or paste audio URL..." style={{ width: "100%", marginTop: 6, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "9px 12px", color: "#0f172a", fontSize: 13, outline: "none", boxSizing: "border-box" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Thumbnail (optional)</label>
                        <ImageUploader label="Upload Thumbnail" folder="podcast-thumbs" onUploadSuccess={url => setPodEpForm(f => ({ ...f, thumbnail: url }))} onError={err => showToast("Upload failed: " + err, "error")} />
                        <input type="text" value={podEpForm.thumbnail} onChange={e => setPodEpForm(f => ({ ...f, thumbnail: e.target.value }))} placeholder="or paste image URL..." style={{ width: "100%", marginTop: 6, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "9px 12px", color: "#0f172a", fontSize: 13, outline: "none", boxSizing: "border-box" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Description</label>
                        <textarea value={podEpForm.description} onChange={e => setPodEpForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Episode description..." style={{ width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "9px 12px", color: "#0f172a", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                      <button onClick={savePodEp} disabled={podEpSaving}
                        style={{ flex: 1, background: "#4f46e5", border: "none", borderRadius: 7, padding: "10px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: podEpSaving ? "not-allowed" : "pointer", opacity: podEpSaving ? 0.7 : 1 }}>
                        {podEpSaving ? "Saving…" : editingPodEpId ? "Save Changes" : "Add Episode"}
                      </button>
                      {editingPodEpId && <button onClick={cancelPodEpEdit} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 16px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>}
                    </div>
                  </div>

                  {/* Episode list */}
                  {podEpLoading ? (
                    <div style={{ color: "#6b7280", padding: 32, textAlign: "center" }}>Loading...</div>
                  ) : podEpList.length === 0 ? (
                    <div style={{ color: "#9ca3af", padding: "24px 0", textAlign: "center", fontSize: 13 }}>No episodes yet — add one above.</div>
                  ) : podEpList.map(ep => (
                    <div key={ep.id} style={{ background: "#ffffff", border: `1px solid ${editingPodEpId === ep.id ? "#4f46e5" : "#e2e8f0"}`, borderRadius: 9, padding: "11px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(79,70,229,0.1)", border: "1px solid rgba(79,70,229,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#4f46e5" }}>{ep.episode_number}</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ep.title}</p>
                        <p style={{ margin: 0, fontSize: 11, color: "#6b7280" }}>{ep.duration || "—"}{ep.audio_url ? " · Audio ✓" : " · No audio"}</p>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => startPodEpEdit(ep)} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 5, padding: "4px 9px", color: "#374151", fontSize: 11, cursor: "pointer" }}>Edit</button>
                        <button onClick={() => setDeletePodEpConfirm(ep)} style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 5, padding: "4px 9px", color: "#f87171", fontSize: 11, cursor: "pointer" }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

              {deletePodEpConfirm && (
                <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "36px 40px", width: 400, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
                    <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "#0f172a" }}>Delete episode?</p>
                    <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 28 }}>"{deletePodEpConfirm.title}"</p>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => setDeletePodEpConfirm(null)} style={{ flex: 1, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "11px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                      <button onClick={() => deletePodEp(deletePodEpConfirm.id)} style={{ flex: 1, background: "#dc2626", border: "none", borderRadius: 7, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                    </div>
                  </div>
                </div>
              )}

              {deletePodcastConfirm && (
                <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "36px 40px", width: 400, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
                    <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "#0f172a" }}>Delete "{deletePodcastConfirm.title}"?</p>
                    <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 28 }}>This podcast will be permanently removed.</p>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => setDeletePodcastConfirm(null)} style={{ flex: 1, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "11px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                      <button onClick={() => deletePodcast(deletePodcastConfirm.id)} style={{ flex: 1, background: "#dc2626", border: "none", borderRadius: 7, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                    </div>
                  </div>
                </div>
              )}
          </>
        )}

        {/* ────── REPORTS TAB ────── */}
        {tab === "reports" && (
          <div>
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Analytics</h2>
              <select
                value={reportSection}
                onChange={e => setReportSection(e.target.value)}
                style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", color: "#0f172a", fontSize: 13, cursor: "pointer", outline: "none" }}
              >
                <option value="overview">Overview</option>
                <option value="content">Content Performance</option>
                <option value="users">User Engagement</option>
              </select>
              <button onClick={loadReports} style={{ marginLeft: "auto", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 7, padding: "8px 16px", color: "#34d399", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Refresh
              </button>
            </div>

            {reportLoading && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 80 }}>
                <Spinner />
              </div>
            )}

            {!reportLoading && reportData && (
              <>
                {/* ── OVERVIEW ── */}
                {reportSection === "overview" && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
                      {[
                        { label: "Total Users", value: reportData.userCount, color: "#34d399", desc: "Registered accounts across all profiles" },
                        { label: "Videos", value: reportData.videoCount, color: "#4f46e5", desc: "Movies uploaded to the library" },
                        { label: "Shows", value: reportData.showCount, color: "#4f46e5", desc: "Series with one or more episodes" },
                        { label: "Episodes", value: reportData.episodeCount, color: "#4f46e5", desc: "Individual episode entries across all shows" },
                        { label: "Watch Sessions", value: reportData.watchSessions, color: "#60a5fa", desc: "Total times any content was played" },
                        { label: "Completed", value: reportData.completedSessions, color: "#60a5fa", desc: "Sessions where the viewer reached the end" },
                        { label: "Hours Watched", value: reportData.totalWatchHours.toLocaleString() + " h", color: "#f472b6", desc: "Total cumulative watch time across all users" },
                        { label: "List Saves", value: reportData.totalSaves, color: "#a78bfa", desc: "Times users added content to My List" },
                        { label: "Ratings Given", value: reportData.totalRatings, color: "#f97316", desc: "Thumbs up ratings submitted by users" },
                      ].map(stat => (
                        <div key={stat.label} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 20px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                          <p style={{ margin: "0 0 6px", fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>{stat.label}</p>
                          <p style={{ margin: "0 0 8px", fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value.toLocaleString()}</p>
                          <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", lineHeight: 1.4 }}>{stat.desc}</p>
                        </div>
                      ))}
                    </div>

                    {reportData.watchSessions > 0 && (() => {
                      const pct = Math.round((reportData.completedSessions / reportData.watchSessions) * 100);
                      return (
                        <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Completion Rate</p>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#34d399" }}>{pct}%</span>
                          </div>
                          <div style={{ background: "#e2e8f0", borderRadius: 6, height: 8, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg, #34d399, #059669)", borderRadius: 6, transition: "width 0.6s ease" }} />
                          </div>
                          <p style={{ margin: "8px 0 0", fontSize: 11, color: "#6b7280" }}>{reportData.completedSessions.toLocaleString()} of {reportData.watchSessions.toLocaleString()} sessions completed</p>
                        </div>
                      );
                    })()}

                    {reportData.userGrowth.length > 0 && (
                      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                        <p style={{ margin: "0 0 20px", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>User Signups by Month</p>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 80 }}>
                          {(() => {
                            const max = Math.max(...reportData.userGrowth.map(([, c]) => c));
                            return reportData.userGrowth.map(([month, count]) => (
                              <div key={month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                                <span style={{ fontSize: 10, color: "#34d399", fontWeight: 600 }}>{count}</span>
                                <div style={{ width: "100%", background: "rgba(52,211,153,0.2)", borderRadius: 4, height: `${Math.round((count / max) * 52) + 4}px`, minHeight: 4, transition: "height 0.4s ease" }} />
                                <span style={{ fontSize: 9, color: "#9ca3af", whiteSpace: "nowrap" }}>{month.slice(5)}</span>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ── CONTENT PERFORMANCE ── */}
                {reportSection === "content" && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24 }}>
                    {[
                      { title: "Top by Sessions", items: reportData.topWatched, valueKey: "count", valueSuffix: " plays", valueColor: "#60a5fa", emptyMsg: "No watch data yet" },
                      { title: "Top by Watch Time", items: reportData.topByTime, valueKey: "minutes", valueSuffix: " min", valueColor: "#f472b6", emptyMsg: "No watch time data yet" },
                      { title: "Top Rated (👍)", items: reportData.topRated, valueKey: "count", valueSuffix: "", valueColor: "#f97316", emptyMsg: "No ratings yet" },
                      { title: "Most Saved to List", items: reportData.topSaved, valueKey: "count", valueSuffix: "", valueColor: "#a78bfa", emptyMsg: "No saves yet" },
                    ].map(({ title, items, valueKey, valueSuffix, valueColor, emptyMsg }) => (
                      <div key={title} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                        <p style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{title}</p>
                        {items.length === 0 ? (
                          <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "20px 0" }}>{emptyMsg}</p>
                        ) : items.map((item, i) => (
                          <div key={`${item.type}:${item.id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: i < items.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                            <span style={{ fontSize: 11, color: "#9ca3af", width: 18, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: 13, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</p>
                              <span style={{ fontSize: 11, color: item.type === "movie" ? "#4f46e5" : item.type === "podcast_episode" ? "#7c3aed" : "#2563eb" }}>{item.type}</span>
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: valueColor, flexShrink: 0 }}>{item[valueKey].toLocaleString()}{valueSuffix}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── USER ENGAGEMENT ── */}
                {reportSection === "users" && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16, marginBottom: 24 }}>
                      {[
                        { label: "Active (7 days)", value: reportData.activeUsers7d, color: "#34d399" },
                        { label: "Active (30 days)", value: reportData.activeUsers30d, color: "#34d399" },
                        { label: "Never Watched", value: reportData.neverWatchedUsers.length, color: "#f87171" },
                        { label: "Avg Sessions / User", value: reportData.avgSessionsPerUser.toFixed(1), color: "#60a5fa" },
                      ].map(stat => (
                        <div key={stat.label} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 20px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                          <p style={{ margin: "0 0 6px", fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8 }}>{stat.label}</p>
                          <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value}</p>
                        </div>
                      ))}
                    </div>

                    {reportData.sessionTrend.length > 0 && (
                      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                        <p style={{ margin: "0 0 20px", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Watch Sessions — Last 30 Days</p>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 72 }}>
                          {(() => {
                            const max = Math.max(...reportData.sessionTrend.map(([, c]) => c), 1);
                            return reportData.sessionTrend.map(([day, count]) => (
                              <div key={day} title={`${day}: ${count} sessions`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "default" }}>
                                <div style={{ width: "100%", background: "rgba(96,165,250,0.25)", borderRadius: 3, height: `${Math.round((count / max) * 52) + 4}px`, minHeight: 4 }} />
                                {reportData.sessionTrend.length <= 14 && <span style={{ fontSize: 9, color: "#9ca3af" }}>{day.slice(8)}</span>}
                              </div>
                            ));
                          })()}
                        </div>
                        <p style={{ margin: "10px 0 0", fontSize: 11, color: "#9ca3af" }}>{reportData.sessionTrend.length} active days · hover bars for date</p>
                      </div>
                    )}

                    <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 24, overflowX: "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                      <p style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>All Users by Activity</p>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                            {["#", "User", "Sessions", "Completed", "Total Hours", "Avg Watch (min)", "Saves", "Ratings", "Last Watched", "Status"].map(h => (
                              <th key={h} style={{ padding: "0 12px 10px", textAlign: "left", color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {reportData.userEngagement.map((u, i) => (
                            <tr key={u.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "10px 12px", color: "#9ca3af" }}>{i + 1}</td>
                              <td style={{ padding: "10px 12px" }}>
                                <p style={{ margin: 0, color: "#0f172a", fontWeight: 500 }}>{u.display}</p>
                                {u.email && u.display !== u.email && <p style={{ margin: 0, color: "#9ca3af", fontSize: 11 }}>{u.email}</p>}
                              </td>
                              <td style={{ padding: "10px 12px", color: "#60a5fa", fontWeight: 600 }}>{u.sessions}</td>
                              <td style={{ padding: "10px 12px", color: "#34d399" }}>{u.completed}</td>
                              <td style={{ padding: "10px 12px", color: "#f472b6", fontWeight: 600 }}>{u.totalHours > 0 ? u.totalHours + " h" : "—"}</td>
                              <td style={{ padding: "10px 12px", color: "#374151" }}>{u.avgProgressMin > 0 ? u.avgProgressMin : "—"}</td>
                              <td style={{ padding: "10px 12px", color: "#7c3aed" }}>{u.saves || "—"}</td>
                              <td style={{ padding: "10px 12px", color: "#f97316" }}>{u.ratings || "—"}</td>
                              <td style={{ padding: "10px 12px", color: "#6b7280", whiteSpace: "nowrap" }}>
                                {u.lastWatched ? new Date(u.lastWatched).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                              </td>
                              <td style={{ padding: "10px 12px" }}>
                                {u.neverWatched
                                  ? <span style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 4, padding: "2px 7px", color: "#f87171", fontSize: 10 }}>Never watched</span>
                                  : u.active7d
                                  ? <span style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 4, padding: "2px 7px", color: "#34d399", fontSize: 10 }}>Active</span>
                                  : u.active30d
                                  ? <span style={{ background: "rgba(79,70,229,0.08)", border: "1px solid rgba(79,70,229,0.2)", borderRadius: 4, padding: "2px 7px", color: "#4f46e5", fontSize: 10 }}>Recent</span>
                                  : <span style={{ background: "rgba(100,116,139,0.1)", border: "1px solid rgba(100,116,139,0.2)", borderRadius: 4, padding: "2px 7px", color: "#64748b", fontSize: 10 }}>Inactive</span>
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {reportData.neverWatchedUsers.length > 0 && (
                      <div style={{ background: "#ffffff", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                        <p style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                          Never Watched <span style={{ color: "#f87171", fontSize: 12 }}>({reportData.neverWatchedUsers.length})</span>
                        </p>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {reportData.neverWatchedUsers.map(u => (
                            <div key={u.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 12px" }}>
                              <p style={{ margin: 0, fontSize: 12, color: "#0f172a" }}>{u.display}</p>
                              <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>Joined {new Date(u.joinedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {!reportLoading && !reportData && (
              <div style={{ textAlign: "center", padding: 80, color: "#9ca3af" }}>Click Refresh to load reports</div>
            )}
          </div>
        )}

      </div>

      {/* ── Slide-over Drawer ── */}
      {drawerOpen && (() => {
        const pagesArr = (carouselForm.pages || "home").split(",").map(p => p.trim()).filter(Boolean);
        const togglePage = page => {
          const s = new Set(pagesArr);
          s.has(page) ? s.delete(page) : s.add(page);
          setCarouselForm(f => ({ ...f, pages: [...s].join(",") }));
        };
        // Bulk auto-schedule preview (computed only when bulk drawer is open)
        const bulkPreviewItems = (() => {
          if (drawerFormType !== "bulk" || !bulkStartTime) return [];
          const items = bulkContentType === "movie"
            ? allVideosForEpg.filter(v => bulkSelectedMovies.has(v.id))
            : allEpisodesForEpg
                .filter(ep => bulkSelectedEps.has(ep.id))
                .sort((a, b) => a.season - b.season || a.episode_number - b.episode_number);
          const fallbackSecs = (bulkDefaultMins || 30) * 60;
          let current = new Date(bulkStartTime);
          return items.map(item => {
            const secs = parseDurationSecs(item.duration);
            const hasDuration = secs > 0;
            const dur = hasDuration ? secs : fallbackSecs;
            const start = new Date(current);
            current = new Date(current.getTime() + dur * 1000);
            return { item, start, end: new Date(current), hasDuration };
          });
        })();
        return (
          <>
            {/* Backdrop */}
            <div
              onClick={closeDrawer}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.25)", zIndex: 298, backdropFilter: "blur(2px)" }}
            />
            {/* Drawer panel */}
            <div style={{
              position: "fixed", right: 0, top: 0, bottom: 0,
              width: "min(520px, 100vw)",
              background: "#ffffff",
              borderLeft: "1px solid #e2e8f0",
              boxShadow: "-8px 0 32px rgba(0,0,0,0.1)",
              zIndex: 299,
              display: "flex",
              flexDirection: "column",
              fontFamily: "'Space Grotesk', sans-serif",
            }}>
              {/* Drawer header */}
              <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
                <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#0f172a" }}>
                  {tab === "videos" && videoSubTab === "movies" && (editingId ? "Edit Movie" : "Add Movie")}
                  {tab === "videos" && videoSubTab === "series" && (editingShowId ? "Edit Series" : "Add Series")}
                  {tab === "videos" && videoSubTab === "episodes" && (editingEpisodeId ? "Edit Episode" : "Add Episode")}
                  {tab === "videos" && videoSubTab === "podcasts" && (editingPodcastId ? "Edit Podcast" : "Add Podcast")}
                  {tab === "carousels" && (editingCarouselId ? "Edit Carousel" : "Add Carousel")}
                  {tab === "live" && drawerFormType !== "epg" && drawerFormType !== "bulk" && (editingLiveId ? "Edit Stream" : "Add Stream")}
                  {tab === "live" && drawerFormType === "epg" && (editingEpgId ? "Edit Program" : "Add Program")}
                  {tab === "live" && drawerFormType === "bulk" && "Auto-Schedule Block"}
                </h2>
                <button
                  onClick={closeDrawer}
                  style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 18, color: "#6b7280", lineHeight: 1 }}
                >
                  ×
                </button>
              </div>

              {/* Scrollable form content */}
              <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>

                {/* ── MOVIES FORM ── */}
                {tab === "videos" && videoSubTab === "movies" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <FieldInput label="Title *" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="e.g. Metropolis" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <FieldSelect label="Category" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={categories} />
                      <FieldSelect label="Rating" value={form.rating} onChange={v => setForm(f => ({ ...f, rating: v }))} options={["NR", "G", "PG", "PG-13", "R"]} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                      <FieldInput label="Year" value={form.year} onChange={v => setForm(f => ({ ...f, year: v }))} placeholder="1927" type="number" />
                      <FieldInput label="Duration" value={form.duration} onChange={v => setForm(f => ({ ...f, duration: v }))} placeholder="2h 33m" />
                      <FieldInput label="Score %" value={form.score} onChange={v => setForm(f => ({ ...f, score: v }))} placeholder="99" type="number" />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Hero Image</label>
                      <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 8px" }}>Landscape · 1920×1080px · full-screen banner · Safe zone: center 1400×800 (stay 260px from sides, 140px from top/bottom)</p>
                      <ImageUploader label="Upload Hero Image (JPG/PNG)" folder="hero" onUploadSuccess={url => setForm(f => ({ ...f, thumbnail: url }))} onError={err => showToast("Upload failed: " + err, "error")} />
                      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
                        <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>or paste URL</span>
                        <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
                      </div>
                      <input type="text" value={form.thumbnail} onChange={e => setForm(f => ({ ...f, thumbnail: e.target.value }))} placeholder="https://..." style={{ width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                      {form.thumbnail && (
                        <div style={{ marginTop: 10, borderRadius: 6, overflow: "hidden", border: "1px solid #e2e8f0" }}>
                          <img src={form.thumbnail} alt="Hero preview" style={{ width: "100%", height: 110, objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Poster</label>
                      <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 8px" }}>Portrait · 400×600px · browse cards (optional) · Safe zone: center 320×460 (stay 40px from sides, 70px from top, 100px from bottom — title overlay)</p>
                      <ImageUploader label="Upload Poster (JPG/PNG)" folder="posters" onUploadSuccess={url => setForm(f => ({ ...f, poster: url }))} onError={err => showToast("Upload failed: " + err, "error")} />
                      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
                        <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>or paste URL</span>
                        <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
                      </div>
                      <input type="text" value={form.poster} onChange={e => setForm(f => ({ ...f, poster: e.target.value }))} placeholder="https://..." style={{ width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                      {form.poster && (
                        <div style={{ marginTop: 10, borderRadius: 6, overflow: "hidden", border: "1px solid #e2e8f0", width: 80 }}>
                          <img src={form.poster} alt="Poster preview" style={{ width: "100%", aspectRatio: "2/3", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />
                        </div>
                      )}
                    </div>
                    <FieldInput label="Video URL *" value={form.url} onChange={v => setForm(f => ({ ...f, url: v }))} placeholder="https://archive.org/..." />
                    <FieldInput label="Trailer URL" value={form.trailer_url} onChange={v => setForm(f => ({ ...f, trailer_url: v }))} placeholder="https://youtube.com/watch?v=... (optional)" />
                    <FieldInput label="Tags (comma-separated)" value={form.tags} onChange={v => setForm(f => ({ ...f, tags: v }))} placeholder="Silent, Epic, Classic" />
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Description</label>
                      <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Short synopsis..." style={{ width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                      <button onClick={saveRow} disabled={saving} style={{ flex: 1, background: "#4f46e5", border: "none", borderRadius: 7, padding: "12px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
                        {saving ? "Saving…" : editingId ? "Save Changes" : "Add Movie"}
                      </button>
                      <button onClick={cancelEdit} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "12px 20px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* ── SERIES FORM ── */}
                {tab === "videos" && videoSubTab === "series" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <FieldInput label="Title *" value={showForm.title} onChange={v => setShowForm(f => ({ ...f, title: v }))} placeholder="e.g. The Twilight Zone" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <FieldSelect label="Category" value={showForm.category} onChange={v => setShowForm(f => ({ ...f, category: v }))} options={["Horror", "Sci-Fi", "Comedy", "Drama", "Action", "Documentary"]} />
                      <FieldSelect label="Rating" value={showForm.rating} onChange={v => setShowForm(f => ({ ...f, rating: v }))} options={["NR", "G", "PG", "PG-13", "R"]} />
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <FieldInput label="Year" value={showForm.year} onChange={v => setShowForm(f => ({ ...f, year: v }))} placeholder="1959" type="number" />
                      <FieldInput label="Score %" value={showForm.score} onChange={v => setShowForm(f => ({ ...f, score: v }))} placeholder="98" type="number" />
                    </div>
                    <FieldInput label="Tags (comma-separated)" value={showForm.tags} onChange={v => setShowForm(f => ({ ...f, tags: v }))} placeholder="Anthology, Black & White, Classic" />
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Hero Image</label>
                      <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 8px" }}>Landscape · 1920×1080px · banner background · Safe zone: center 1400×800 (stay 260px from sides, 140px from top/bottom)</p>
                      <ImageUploader label="Upload Hero Image" folder="hero" onUploadSuccess={url => setShowForm(f => ({ ...f, thumbnail: url }))} onError={err => showToast("Upload failed: " + err, "error")} />
                      <input type="text" value={showForm.thumbnail} onChange={e => setShowForm(f => ({ ...f, thumbnail: e.target.value }))} placeholder="or paste URL..." style={{ width: "100%", marginTop: 8, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                      {showForm.thumbnail && <img src={showForm.thumbnail} alt="" style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 6, marginTop: 8 }} onError={e => { e.target.style.display = "none"; }} />}
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Poster</label>
                      <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 8px" }}>Portrait · 400×600px · card image · Safe zone: center 320×460 (stay 40px from sides, 70px from top, 100px from bottom — title overlay)</p>
                      <ImageUploader label="Upload Poster" folder="posters" onUploadSuccess={url => setShowForm(f => ({ ...f, poster: url }))} onError={err => showToast("Upload failed: " + err, "error")} />
                      <input type="text" value={showForm.poster} onChange={e => setShowForm(f => ({ ...f, poster: e.target.value }))} placeholder="or paste URL..." style={{ width: "100%", marginTop: 8, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                      {showForm.poster && <img src={showForm.poster} alt="" style={{ width: 70, aspectRatio: "2/3", objectFit: "cover", borderRadius: 6, marginTop: 8 }} onError={e => { e.target.style.display = "none"; }} />}
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Description</label>
                      <textarea value={showForm.description} onChange={e => setShowForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Short synopsis..." style={{ width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                    </div>
                    <FieldInput label="Trailer URL" value={showForm.trailer_url} onChange={v => setShowForm(f => ({ ...f, trailer_url: v }))} placeholder="https://youtube.com/watch?v=... (optional)" />
                    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                      <button onClick={saveShow} disabled={showSaving} style={{ flex: 1, background: "#4f46e5", border: "none", borderRadius: 7, padding: "12px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: showSaving ? "not-allowed" : "pointer", opacity: showSaving ? 0.7 : 1 }}>
                        {showSaving ? "Saving…" : editingShowId ? "Save Changes" : "Add Show"}
                      </button>
                      <button onClick={cancelShowEdit} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "12px 20px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* ── EPISODES FORM ── */}
                {tab === "videos" && videoSubTab === "episodes" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Show *</label>
                      <select value={selectedShowForEpisodes} onChange={e => { setSelectedShowForEpisodes(e.target.value); loadEpisodes(e.target.value); setEpisodeForm({ ...EMPTY_EPISODE, show_id: e.target.value }); }}
                        style={{ width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none" }}>
                        <option value="">Select a show...</option>
                        {showsList.map(s => <option key={s.id} value={String(s.id)}>{s.title}</option>)}
                      </select>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <FieldInput label="Season" value={episodeForm.season} onChange={v => setEpisodeForm(f => ({ ...f, season: v }))} placeholder="1" type="number" />
                      <FieldInput label="Episode #" value={episodeForm.episode_number} onChange={v => setEpisodeForm(f => ({ ...f, episode_number: v }))} placeholder="1" type="number" />
                    </div>
                    <FieldInput label="Title *" value={episodeForm.title} onChange={v => setEpisodeForm(f => ({ ...f, title: v }))} placeholder="e.g. Pilot" />
                    <FieldInput label="Duration" value={episodeForm.duration} onChange={v => setEpisodeForm(f => ({ ...f, duration: v }))} placeholder="42 min" />
                    <FieldInput label="Video URL" value={episodeForm.url} onChange={v => setEpisodeForm(f => ({ ...f, url: v }))} placeholder="https://archive.org/..." />
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Episode Thumbnail</label>
                      <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 8px" }}>16:9 still from the episode (optional)</p>
                      <ImageUploader label="Upload Thumbnail" folder="episodes" onUploadSuccess={url => setEpisodeForm(f => ({ ...f, thumbnail: url }))} onError={err => showToast("Upload failed: " + err, "error")} />
                      <input type="text" value={episodeForm.thumbnail} onChange={e => setEpisodeForm(f => ({ ...f, thumbnail: e.target.value }))} placeholder="or paste URL..." style={{ width: "100%", marginTop: 8, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Description</label>
                      <textarea value={episodeForm.description} onChange={e => setEpisodeForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Episode synopsis..." style={{ width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                      <button onClick={saveEpisode} disabled={episodeSaving || !selectedShowForEpisodes} style={{ flex: 1, background: "#4f46e5", border: "none", borderRadius: 7, padding: "12px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: (episodeSaving || !selectedShowForEpisodes) ? "not-allowed" : "pointer", opacity: (episodeSaving || !selectedShowForEpisodes) ? 0.5 : 1 }}>
                        {episodeSaving ? "Saving…" : editingEpisodeId ? "Save Changes" : "Add Episode"}
                      </button>
                      <button onClick={cancelEpisodeEdit} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "12px 20px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* ── PODCASTS FORM ── */}
                {tab === "videos" && videoSubTab === "podcasts" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <FieldInput label="Title *" value={podcastForm.title} onChange={v => setPodcastForm(f => ({ ...f, title: v }))} placeholder="e.g. The Daily" />
                    <FieldInput label="Host" value={podcastForm.host} onChange={v => setPodcastForm(f => ({ ...f, host: v }))} placeholder="e.g. Michael Barbaro" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <FieldInput label="Episodes" value={podcastForm.episode_count} onChange={v => setPodcastForm(f => ({ ...f, episode_count: v }))} placeholder="24" type="number" />
                      <FieldInput label="Tags (comma-sep)" value={podcastForm.tags} onChange={v => setPodcastForm(f => ({ ...f, tags: v }))} placeholder="news, daily" />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Artwork</label>
                      <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 8px" }}>Square · 1400×1400px recommended</p>
                      <ImageUploader label="Upload Artwork (JPG/PNG)" folder="podcasts" onUploadSuccess={url => setPodcastForm(f => ({ ...f, artwork_url: url }))} onError={err => showToast("Upload failed: " + err, "error")} />
                      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
                        <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>or paste URL</span>
                        <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
                      </div>
                      <input type="text" value={podcastForm.artwork_url} onChange={e => setPodcastForm(f => ({ ...f, artwork_url: e.target.value }))} placeholder="https://..." style={{ width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                      {podcastForm.artwork_url && (
                        <div style={{ marginTop: 10, borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0", width: 80, height: 80 }}>
                          <img src={podcastForm.artwork_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />
                        </div>
                      )}
                    </div>
                    <FieldInput label="Link URL" value={podcastForm.link_url} onChange={v => setPodcastForm(f => ({ ...f, link_url: v }))} placeholder="https://open.spotify.com/show/..." />
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Description</label>
                      <textarea value={podcastForm.description} onChange={e => setPodcastForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Short description..." style={{ width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.7 }}>Status</label>
                      <button onClick={() => setPodcastForm(f => ({ ...f, enabled: !f.enabled }))}
                        style={{ width: "100%", background: podcastForm.enabled ? "rgba(79,70,229,0.08)" : "rgba(107,114,128,0.08)", border: `1px solid ${podcastForm.enabled ? "rgba(79,70,229,0.3)" : "#e2e8f0"}`, borderRadius: 7, padding: "10px 12px", color: podcastForm.enabled ? "#4f46e5" : "#6b7280", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
                        {podcastForm.enabled ? "✓ Enabled" : "○ Disabled"}
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                      <button onClick={savePodcast} disabled={podcastSaving} style={{ flex: 1, background: "#4f46e5", border: "none", borderRadius: 7, padding: "12px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: podcastSaving ? "not-allowed" : "pointer", opacity: podcastSaving ? 0.7 : 1 }}>
                        {podcastSaving ? "Saving…" : editingPodcastId ? "Save Changes" : "Add Podcast"}
                      </button>
                      <button onClick={cancelPodcastEdit} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "12px 20px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* ── CAROUSELS FORM ── */}
                {tab === "carousels" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                    <p style={{ margin: "0 0 4px", fontSize: 12, color: "#6b7280" }}>A horizontal scrolling row shown on selected pages.</p>

                    <div>
                      <label style={{ display: "block", fontSize: 11, color: "#4f46e5", fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>1 · Row Title</label>
                      <FieldInput value={carouselForm.title} onChange={v => setCarouselForm(f => ({ ...f, title: v }))} placeholder="e.g. Top Horror Picks, New This Week…" />
                    </div>

                    <div style={{ height: 1, background: "#e2e8f0" }} />

                    <div>
                      <label style={{ display: "block", fontSize: 11, color: "#4f46e5", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>2 · Where to show it</label>
                      <p style={{ margin: "0 0 12px", fontSize: 11, color: "#6b7280" }}>Pick every page this row should appear on.</p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {[
                          { val: "home",   icon: "🏠", label: "Home",        desc: "The main landing page" },
                          { val: "movies", icon: "🎬", label: "Movies tab",  desc: "The dedicated Movies browse page" },
                          { val: "series", icon: "📺", label: "Series tab",  desc: "The dedicated Series browse page" },
                        ].map(({ val, icon, label, desc }) => {
                          const on = pagesArr.includes(val);
                          return (
                            <button key={val} onClick={() => togglePage(val)}
                              style={{ background: on ? "rgba(79,70,229,0.08)" : "#f8fafc", border: `1.5px solid ${on ? "#4f46e5" : "#e2e8f0"}`, borderRadius: 9, padding: "11px 14px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12, transition: "border-color 0.15s, background 0.15s" }}>
                              <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: on ? "#4f46e5" : "#374151" }}>{label}</div>
                                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>{desc}</div>
                              </div>
                              <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${on ? "#4f46e5" : "#e2e8f0"}`, background: on ? "#4f46e5" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                                {on && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {pagesArr.length === 0 && (
                        <p style={{ margin: "8px 0 0", fontSize: 11, color: "#dc2626" }}>Pick at least one page.</p>
                      )}
                    </div>

                    <div style={{ height: 1, background: "#e2e8f0" }} />

                    <div>
                      <label style={{ display: "block", fontSize: 11, color: "#4f46e5", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>3 · What to show</label>
                      <p style={{ margin: "0 0 10px", fontSize: 11, color: "#6b7280" }}>What kind of content fills this row.</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {[
                          { ct: "movies", t: null,      icon: "🎬", label: "Movies only",   desc: "Only movies" },
                          { ct: "shows",  t: null,      icon: "📺", label: "Series only",   desc: "Only TV shows & series" },
                          { ct: "all",    t: null,      icon: "⭐", label: "Everything",    desc: "Movies + series mixed" },
                          { ct: "all",    t: "podcast", icon: "🎙️", label: "Podcasts",      desc: "Podcast episodes" },
                        ].map(({ ct, t, icon, label, desc }) => {
                          const isPodcast = t === "podcast";
                          const isActive = isPodcast
                            ? carouselForm.type === "podcast"
                            : carouselForm.content_type === ct && carouselForm.type !== "podcast";
                          return (
                            <button key={label} onClick={() => {
                              if (isPodcast) setCarouselForm(f => ({ ...f, type: "podcast", content_type: "all" }));
                              else setCarouselForm(f => ({ ...f, content_type: ct, type: f.type === "podcast" ? "custom" : f.type }));
                            }}
                              style={{ background: isActive ? "rgba(79,70,229,0.08)" : "#f8fafc", border: `1.5px solid ${isActive ? "#4f46e5" : "#e2e8f0"}`, borderRadius: 10, padding: "13px 12px", cursor: "pointer", textAlign: "left", transition: "border-color 0.15s, background 0.15s" }}>
                              <div style={{ fontSize: 20, marginBottom: 5 }}>{icon}</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: isActive ? "#4f46e5" : "#374151", marginBottom: 2 }}>{label}</div>
                              <div style={{ fontSize: 11, color: "#6b7280" }}>{desc}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div style={{ height: 1, background: "#e2e8f0" }} />

                    {carouselForm.type !== "podcast" ? (
                      <div>
                        <label style={{ display: "block", fontSize: 11, color: "#4f46e5", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>4 · How to order</label>
                        <p style={{ margin: "0 0 10px", fontSize: 11, color: "#6b7280" }}>How content is sorted inside this row.</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {[
                            { val: "custom",   icon: "📋", label: "Show all",       desc: "All matching content, default order" },
                            { val: "trending", icon: "🔥", label: "Trending / New", desc: "Newest added first" },
                            { val: "category", icon: "🏷️", label: "By category",    desc: "Filter to a specific genre" },
                          ].map(({ val, icon, label, desc }) => {
                            const isActive = carouselForm.type === val;
                            return (
                              <button key={val} onClick={() => setCarouselForm(f => ({ ...f, type: val }))}
                                style={{ background: isActive ? "rgba(79,70,229,0.08)" : "#f8fafc", border: `1.5px solid ${isActive ? "#4f46e5" : "#e2e8f0"}`, borderRadius: 9, padding: "11px 14px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12, transition: "border-color 0.15s, background 0.15s" }}>
                                <span style={{ fontSize: 17, flexShrink: 0 }}>{icon}</span>
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? "#4f46e5" : "#374151" }}>{label}</div>
                                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>{desc}</div>
                                </div>
                                {isActive && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4f46e5", flexShrink: 0 }} />}
                              </button>
                            );
                          })}
                        </div>
                        {carouselForm.type === "category" && (
                          <div style={{ marginTop: 10, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "14px" }}>
                            <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 6, fontWeight: 600 }}>Category name</label>
                            <input value={carouselForm.filter_value} onChange={e => setCarouselForm(f => ({ ...f, filter_value: e.target.value }))}
                              placeholder="e.g. Horror, Comedy, Sci-Fi…"
                              style={{ width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "9px 12px", color: "#0f172a", fontSize: 13, outline: "none" }}
                              onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                            <p style={{ margin: "6px 0 0", fontSize: 11, color: "#9ca3af" }}>Must match exactly as set on your videos (case-insensitive).</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <label style={{ display: "block", fontSize: 11, color: "#4f46e5", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>4 · Tag filter (optional)</label>
                        <input value={carouselForm.filter_value} onChange={e => setCarouselForm(f => ({ ...f, filter_value: e.target.value }))}
                          placeholder="e.g. true-crime — leave blank to show all podcasts"
                          style={{ width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none" }}
                          onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                      </div>
                    )}

                    <div style={{ height: 1, background: "#e2e8f0" }} />

                    <div>
                      <label style={{ display: "block", fontSize: 11, color: "#4f46e5", fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>5 · Visibility</label>
                      <button onClick={() => setCarouselForm(f => ({ ...f, enabled: !f.enabled }))}
                        style={{ width: "100%", background: carouselForm.enabled ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.08)", border: `1px solid ${carouselForm.enabled ? "rgba(16,185,129,0.35)" : "#222"}`, borderRadius: 8, padding: "11px", color: carouselForm.enabled ? "#10b981" : "#555", fontSize: 13, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{carouselForm.enabled ? "✓" : "○"}</span>
                        {carouselForm.enabled ? "Live — visible to users" : "Hidden — not shown to users"}
                      </button>
                    </div>

                    <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                      <button onClick={saveCarousel} disabled={carouselSaving || pagesArr.length === 0}
                        style={{ flex: 1, background: "#4f46e5", border: "none", borderRadius: 8, padding: "13px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: (carouselSaving || pagesArr.length === 0) ? "not-allowed" : "pointer", opacity: (carouselSaving || pagesArr.length === 0) ? 0.5 : 1 }}>
                        {carouselSaving ? "Saving…" : editingCarouselId ? "Update Row" : "Create Row"}
                      </button>
                      <button onClick={cancelCarouselEdit}
                        style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "13px 20px", color: "#374151", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* ── LIVE FORM ── */}
                {tab === "live" && drawerFormType !== "epg" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <FieldInput label="Channel Number" value={liveForm.channel_number} onChange={v => setLiveForm(f => ({ ...f, channel_number: v }))} placeholder="e.g. 1" type="number" />
                    <FieldInput label="Title *" value={liveForm.title} onChange={v => setLiveForm(f => ({ ...f, title: v }))} placeholder="e.g. Peep News Network" />
                    <FieldInput label="Description" value={liveForm.description} onChange={v => setLiveForm(f => ({ ...f, description: v }))} placeholder="What's on this channel..." />
                    <FieldInput label="Now Airing" value={liveForm.now_airing} onChange={v => setLiveForm(f => ({ ...f, now_airing: v }))} placeholder="e.g. The Daily Briefing · Ep 3" />
                    <FieldInput label="Up Next" value={liveForm.up_next} onChange={v => setLiveForm(f => ({ ...f, up_next: v }))} placeholder="e.g. Evening Report · Ep 4" />
                    <FieldInput label="Stream URL" value={liveForm.stream_url} onChange={v => setLiveForm(f => ({ ...f, stream_url: v }))} placeholder="https://... (.m3u8, YouTube Live, etc.)" />
                    <FieldInput label="Badge Text" value={liveForm.badge_text} onChange={v => setLiveForm(f => ({ ...f, badge_text: v }))} placeholder="LIVE" />
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Thumbnail</label>
                      <ImageUploader label="Upload Thumbnail" folder="live" onUploadSuccess={url => setLiveForm(f => ({ ...f, thumbnail: url }))} onError={err => showToast("Upload failed: " + err, "error")} />
                      <input type="text" value={liveForm.thumbnail} onChange={e => setLiveForm(f => ({ ...f, thumbnail: e.target.value }))} placeholder="or paste URL..." style={{ width: "100%", marginTop: 8, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.7 }}>Status</label>
                      <button onClick={() => setLiveForm(f => ({ ...f, is_live: !f.is_live }))}
                        style={{ width: "100%", background: liveForm.is_live ? "rgba(239,68,68,0.12)" : "rgba(107,114,128,0.1)", border: `1px solid ${liveForm.is_live ? "rgba(239,68,68,0.35)" : "rgba(107,114,128,0.3)"}`, borderRadius: 7, padding: "10px 12px", color: liveForm.is_live ? "#ef4444" : "#888", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
                        {liveForm.is_live ? "🔴 Live" : "○ Offline"}
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                      <button onClick={saveLiveStream} disabled={liveSaving} style={{ flex: 1, background: "#ef4444", border: "none", borderRadius: 7, padding: "12px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: liveSaving ? "not-allowed" : "pointer", opacity: liveSaving ? 0.7 : 1 }}>
                        {liveSaving ? "Saving…" : editingLiveId ? "Save Changes" : "Go Live"}
                      </button>
                      <button onClick={cancelLiveEdit} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "12px 20px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* ── EPG FORM ── */}
                {tab === "live" && drawerFormType === "epg" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.7 }}>Content Type</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        {["movie", "episode"].map(t => (
                          <button key={t} onClick={() => setEpgForm(f => ({ ...f, content_type: t, content_id: "", title: "" }))}
                            style={{ flex: 1, background: epgForm.content_type === t ? "#4f46e5" : "#f1f5f9", border: `1px solid ${epgForm.content_type === t ? "#4f46e5" : "#e2e8f0"}`, borderRadius: 7, padding: "9px", color: epgForm.content_type === t ? "#fff" : "#374151", fontSize: 13, fontWeight: 500, cursor: "pointer", textTransform: "capitalize" }}>
                            {t === "movie" ? "Movie" : "Episode"}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>
                        Select from Library <span style={{ color: "#94a3b8", textTransform: "none", letterSpacing: 0 }}>(optional)</span>
                      </label>
                      <select
                        value={epgForm.content_id}
                        onChange={e => handleEpgContentSelect(e.target.value)}
                        style={{ width: "100%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: epgForm.content_id ? "#0f172a" : "#9ca3af", fontSize: 13, outline: "none", cursor: "pointer" }}
                        onFocus={e => (e.target.style.borderColor = "#4f46e5")}
                        onBlur={e => (e.target.style.borderColor = "#e2e8f0")}
                      >
                        <option value="">— None / enter title manually —</option>
                        {epgForm.content_type === "movie"
                          ? allVideosForEpg.map(v => <option key={v.id} value={v.id}>{v.title}{v.duration ? ` (${Math.round(v.duration / 60)}m)` : ""}</option>)
                          : (() => {
                              const groups = {};
                              allEpisodesForEpg.forEach(ep => {
                                if (!groups[ep._showTitle]) groups[ep._showTitle] = [];
                                groups[ep._showTitle].push(ep);
                              });
                              return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([show, eps]) => (
                                <optgroup key={show} label={show}>
                                  {eps.map(ep => (
                                    <option key={ep.id} value={ep.id}>S{ep.season}E{ep.episode_number} · {ep.title}</option>
                                  ))}
                                </optgroup>
                              ));
                            })()
                        }
                      </select>
                    </div>

                    <FieldInput label="Program Title *" value={epgForm.title} onChange={v => setEpgForm(f => ({ ...f, title: v }))} placeholder="e.g. The Matrix" />
                    <FieldInput label="Description" value={epgForm.description} onChange={v => setEpgForm(f => ({ ...f, description: v }))} placeholder="Short description..." />

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <FieldInput label="Start Time *" value={epgForm.start_time} onChange={v => {
                        setEpgForm(f => {
                          const content = f.content_id
                            ? (f.content_type === "movie"
                                ? allVideosForEpg.find(c => c.id === Number(f.content_id))
                                : allEpisodesForEpg.find(c => c.id === Number(f.content_id)))
                            : null;
                          const secs = content ? parseDurationSecs(content.duration) : 0;
                          const endTime = secs > 0 && v
                            ? new Date(new Date(v).getTime() + secs * 1000).toISOString().slice(0, 16)
                            : f.end_time;
                          return { ...f, start_time: v, end_time: endTime };
                        });
                      }} type="datetime-local" />
                      <FieldInput label="End Time *" value={epgForm.end_time} onChange={v => setEpgForm(f => ({ ...f, end_time: v }))} type="datetime-local" />
                    </div>
                    {epgForm.start_time && epgForm.end_time && new Date(epgForm.end_time) > new Date(epgForm.start_time) && (
                      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
                        Duration: {Math.round((new Date(epgForm.end_time) - new Date(epgForm.start_time)) / 60000)} minutes
                      </p>
                    )}

                    <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                      <button onClick={saveEpgEntry}
                        disabled={epgSaving || !epgForm.title.trim() || !epgForm.start_time || !epgForm.end_time}
                        style={{ flex: 1, background: "#4f46e5", border: "none", borderRadius: 8, padding: "13px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: (epgSaving || !epgForm.title.trim()) ? "not-allowed" : "pointer", opacity: (epgSaving || !epgForm.title.trim()) ? 0.5 : 1 }}>
                        {epgSaving ? "Saving…" : editingEpgId ? "Update Program" : "Add to Schedule"}
                      </button>
                      <button onClick={closeDrawer}
                        style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "13px 20px", color: "#374151", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* ── BULK AUTO-SCHEDULE FORM ── */}
                {tab === "live" && drawerFormType === "bulk" && (() => {
                  const uniqueShows = [...new Map(allEpisodesForEpg.map(ep => [ep.show_id, { id: ep.show_id, title: ep._showTitle }])).values()].sort((a, b) => a.title.localeCompare(b.title));
                  const showEps = bulkShowId
                    ? allEpisodesForEpg.filter(ep => ep.show_id === Number(bulkShowId)).sort((a, b) => a.season - b.season || a.episode_number - b.episode_number)
                    : [];
                  const seasons = [...new Set(showEps.map(ep => ep.season))].sort((a, b) => a - b);
                  const allEpsSelected = showEps.length > 0 && showEps.every(ep => bulkSelectedEps.has(ep.id));
                  const filteredMovies = allVideosForEpg.filter(v => !bulkMovieSearch || v.title.toLowerCase().includes(bulkMovieSearch.toLowerCase()));
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                      {/* Content type toggle */}
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.7 }}>Schedule Type</label>
                        <div style={{ display: "flex", gap: 6 }}>
                          {["episode", "movie"].map(t => (
                            <button key={t} onClick={() => { setBulkContentType(t); setBulkSelectedEps(new Set()); setBulkSelectedMovies(new Set()); }}
                              style={{ flex: 1, background: bulkContentType === t ? "#4f46e5" : "#f1f5f9", border: `1px solid ${bulkContentType === t ? "#4f46e5" : "#e2e8f0"}`, borderRadius: 7, padding: "9px", color: bulkContentType === t ? "#fff" : "#374151", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                              {t === "episode" ? "TV Episodes" : "Movies"}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Episode picker */}
                      {bulkContentType === "episode" && (
                        <>
                          <div>
                            <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Show</label>
                            <select value={bulkShowId} onChange={e => { setBulkShowId(e.target.value); setBulkSelectedEps(new Set()); }}
                              style={{ width: "100%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: bulkShowId ? "#0f172a" : "#9ca3af", fontSize: 13, outline: "none", cursor: "pointer" }}>
                              <option value="">— Select a show —</option>
                              {uniqueShows.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                            </select>
                          </div>
                          {bulkShowId && showEps.length > 0 && (
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <label style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.7 }}>
                                  Episodes <span style={{ color: "#4f46e5", fontWeight: 700 }}>{bulkSelectedEps.size > 0 ? `(${bulkSelectedEps.size} selected)` : ""}</span>
                                </label>
                                <button onClick={() => setBulkSelectedEps(allEpsSelected ? new Set() : new Set(showEps.map(ep => ep.id)))}
                                  style={{ background: "none", border: "none", color: "#4f46e5", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>
                                  {allEpsSelected ? "Clear All" : "Select All"}
                                </button>
                              </div>
                              <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" }}>
                                {seasons.map(season => (
                                  <div key={season}>
                                    <div style={{ padding: "6px 12px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", fontSize: 11, fontWeight: 700, color: "#64748b", letterSpacing: 0.5, textTransform: "uppercase" }}>
                                      Season {season}
                                    </div>
                                    {showEps.filter(ep => ep.season === season).map((ep, i, arr) => {
                                      const checked = bulkSelectedEps.has(ep.id);
                                      const dur = parseDurationSecs(ep.duration);
                                      return (
                                        <label key={ep.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer", borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none", background: checked ? "rgba(79,70,229,0.05)" : "#fff" }}>
                                          <input type="checkbox" checked={checked} onChange={() => setBulkSelectedEps(prev => { const n = new Set(prev); checked ? n.delete(ep.id) : n.add(ep.id); return n; })}
                                            style={{ accentColor: "#4f46e5", width: 15, height: 15, flexShrink: 0, cursor: "pointer" }} />
                                          <span style={{ flex: 1, fontSize: 13, color: "#0f172a", fontWeight: checked ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            E{ep.episode_number} · {ep.title}
                                          </span>
                                          <span style={{ fontSize: 11, flexShrink: 0, color: dur > 0 ? "#9ca3af" : "#f59e0b" }}>
                                            {dur > 0 ? `${Math.round(dur / 60)}m` : `~${bulkDefaultMins}m`}
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {/* Movie picker */}
                      {bulkContentType === "movie" && (
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <label style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.7 }}>
                              Movies <span style={{ color: "#4f46e5", fontWeight: 700 }}>{bulkSelectedMovies.size > 0 ? `(${bulkSelectedMovies.size} selected)` : ""}</span>
                            </label>
                            <button onClick={() => setBulkSelectedMovies(bulkSelectedMovies.size > 0 ? new Set() : new Set(allVideosForEpg.map(v => v.id)))}
                              style={{ background: "none", border: "none", color: "#4f46e5", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0 }}>
                              {bulkSelectedMovies.size > 0 ? "Clear All" : "Select All"}
                            </button>
                          </div>
                          <input type="text" placeholder="Search movies..." value={bulkMovieSearch} onChange={e => setBulkMovieSearch(e.target.value)}
                            style={{ width: "100%", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, padding: "9px 12px", color: "#0f172a", fontSize: 13, outline: "none", marginBottom: 8, boxSizing: "border-box" }} />
                          <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff" }}>
                            {filteredMovies.map((v, i, arr) => {
                              const checked = bulkSelectedMovies.has(v.id);
                              const dur = parseDurationSecs(v.duration);
                              return (
                                <label key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer", borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none", background: checked ? "rgba(79,70,229,0.05)" : "#fff" }}>
                                  <input type="checkbox" checked={checked} onChange={() => setBulkSelectedMovies(prev => { const n = new Set(prev); checked ? n.delete(v.id) : n.add(v.id); return n; })}
                                    style={{ accentColor: "#4f46e5", width: 15, height: 15, flexShrink: 0, cursor: "pointer" }} />
                                  <span style={{ flex: 1, fontSize: 13, color: "#0f172a", fontWeight: checked ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {v.title}
                                  </span>
                                  <span style={{ fontSize: 11, flexShrink: 0, color: dur > 0 ? "#9ca3af" : "#f59e0b" }}>
                                    {dur > 0 ? `${Math.round(dur / 60)}m` : "⚠ no dur"}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Scan durations button — shown when episodes are missing durations */}
                      {bulkContentType === "episode" && bulkShowId && (() => {
                        const showEpsAll = allEpisodesForEpg.filter(ep => ep.show_id === Number(bulkShowId));
                        const missingCount = showEpsAll.filter(ep => !parseDurationSecs(ep.duration)).length;
                        if (missingCount === 0) return null;
                        return (
                          <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 8, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                            <div>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#92400e" }}>
                                {missingCount} episode{missingCount !== 1 ? "s" : ""} missing duration
                              </p>
                              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#b45309" }}>
                                {bulkScanning ? `Scanning… ${bulkScanProgress.done}/${bulkScanProgress.total}` : "Auto-detect from video files"}
                              </p>
                            </div>
                            <button onClick={scanEpisodeDurations} disabled={bulkScanning}
                              style={{ background: "#f59e0b", border: "none", borderRadius: 7, padding: "8px 16px", color: "#fff", fontSize: 12, fontWeight: 700, cursor: bulkScanning ? "not-allowed" : "pointer", opacity: bulkScanning ? 0.6 : 1, flexShrink: 0, whiteSpace: "nowrap" }}>
                              {bulkScanning ? "Scanning…" : "Scan Durations"}
                            </button>
                          </div>
                        );
                      })()}

                      {/* Start time */}
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Start Time *</label>
                        <input type="datetime-local" value={bulkStartTime} onChange={e => setBulkStartTime(e.target.value)}
                          style={{ width: "100%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                          onFocus={e => (e.target.style.borderColor = "#4f46e5")}
                          onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                        <p style={{ margin: "4px 0 0", fontSize: 11, color: "#94a3b8" }}>Pre-filled from the last scheduled entry — adjust if needed.</p>
                      </div>

                      {/* Schedule preview */}
                      {bulkPreviewItems.length > 0 && (
                        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                          <div style={{ padding: "9px 12px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#374151" }}>Schedule Preview</span>
                            <span style={{ fontSize: 11, color: "#6b7280" }}>
                              {bulkPreviewItems.length} programs · {Math.round(bulkPreviewItems.reduce((s, p) => s + (p.end - p.start), 0) / 60000)}m total
                            </span>
                          </div>
                          <div style={{ maxHeight: 190, overflowY: "auto" }}>
                            {bulkPreviewItems.map((p, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderBottom: i < bulkPreviewItems.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <span style={{ fontSize: 12, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                                    {bulkContentType === "episode" ? `E${p.item.episode_number} · ${p.item.title}` : p.item.title}
                                  </span>
                                </div>
                                <span style={{ fontSize: 11, color: "#6b7280", flexShrink: 0, whiteSpace: "nowrap" }}>
                                  {p.start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })} – {p.end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                                </span>
                                {!p.hasDuration && <span style={{ fontSize: 10, color: "#f59e0b", flexShrink: 0 }}>~{bulkDefaultMins}m</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                        <button onClick={saveBulkSchedule}
                          disabled={bulkSaving || bulkPreviewItems.length === 0}
                          style={{ flex: 1, background: "#4f46e5", border: "none", borderRadius: 8, padding: "13px", color: "#fff", fontSize: 14, fontWeight: 700, cursor: (bulkSaving || bulkPreviewItems.length === 0) ? "not-allowed" : "pointer", opacity: (bulkSaving || bulkPreviewItems.length === 0) ? 0.5 : 1 }}>
                          {bulkSaving ? "Scheduling…" : bulkPreviewItems.length > 0 ? `Schedule ${bulkPreviewItems.length} Programs` : "Select programs above"}
                        </button>
                        <button onClick={closeDrawer}
                          style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "13px 20px", color: "#374151", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                          Cancel
                        </button>
                      </div>

                    </div>
                  );
                })()}

              </div>
            </div>
          </>
        );
      })()}

    </div>
  );
}

// ── Helpers ──

function FieldInput({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 7,
          padding: "10px 12px",
          color: "#0f172a",
          fontSize: 13,
          outline: "none",
        }}
        onFocus={e => (e.target.style.borderColor = "#4f46e5")}
        onBlur={e => (e.target.style.borderColor = "#e2e8f0")}
      />
    </div>
  );
}

function FieldSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%",
          background: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 7,
          padding: "10px 12px",
          color: "#0f172a",
          fontSize: 13,
          outline: "none",
          cursor: "pointer",
        }}
      >
        {options.map(o => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ width: 32, height: 32, border: "3px solid #e2e8f0", borderTop: "3px solid #4f46e5", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
