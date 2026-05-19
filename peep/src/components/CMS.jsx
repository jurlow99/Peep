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
  hero_image: "",
  is_live: true,
  is_hero: false,
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

const EMPTY_MUSIC_VIDEO = {
  title: "",
  artist: "",
  url: "",
  thumbnail: "",
  poster: "",
  trailer_url: "",
  duration: "",
  year: "",
  description: "",
  tags: "",
  enabled: true,
};

const EMPTY_AD = {
  name: "",
  tag_url: "",
  ad_type: "pre_roll",
  scope: "global",
  content_id: "",
  active: true,
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
  const typeLabel = t => ({ movie: "Movie", episode: "Episode", podcast_episode: "Podcast Ep" }[t] || t);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [livePasscodeEntered, setLivePasscodeEntered] = useState(() => sessionStorage.getItem("cms_live_unlocked") === "1");
  const [livePasscodeInput, setLivePasscodeInput] = useState("");
  
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
  const [deletePlaylistConfirm, setDeletePlaylistConfirm] = useState(null);
  const [deletingPlaylist, setDeletingPlaylist] = useState(false);
  const [channelStatuses, setChannelStatuses] = useState({});
  const [testingChannels, setTestingChannels] = useState(false);
  const [testProgress, setTestProgress] = useState({ done: 0, total: 0 });
  const [m3uOpen, setM3uOpen] = useState(false);
  const [m3uUrl, setM3uUrl] = useState("");
  const [m3uFetching, setM3uFetching] = useState(false);
  const [m3uChannels, setM3uChannels] = useState([]);
  const [m3uSelected, setM3uSelected] = useState(new Set());
  const [m3uError, setM3uError] = useState("");
  const [m3uSearch, setM3uSearch] = useState("");
  const [m3uPage, setM3uPage] = useState(0);
  const [m3uImporting, setM3uImporting] = useState(false);
  const [m3uImportDone, setM3uImportDone] = useState(null);

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

  // XMLTV import state
  const [xmltvOpen, setXmltvOpen] = useState(false);
  const [xmltvUrl, setXmltvUrl] = useState("");
  const [xmltvParsed, setXmltvParsed] = useState(null);
  const [xmltvChannelMap, setXmltvChannelMap] = useState({});
  const [xmltvLoading, setXmltvLoading] = useState(false);
  const [xmltvError, setXmltvError] = useState("");
  const [xmltvImporting, setXmltvImporting] = useState(false);
  const [xmltvImportDone, setXmltvImportDone] = useState(null);
  const [xmltvFileName, setXmltvFileName] = useState("");
  const [xmltvPreviewChannel, setXmltvPreviewChannel] = useState(null);
  const [xmltvRawText, setXmltvRawText] = useState("");
  const [xmltvRawOpen, setXmltvRawOpen] = useState(false);
  const [epgSourceXmlModal, setEpgSourceXmlModal] = useState(null); // { source_name, xml_content }
  const [epgSourceXmlLoading, setEpgSourceXmlLoading] = useState(false);
  const [epgDetailEntry, setEpgDetailEntry] = useState(null);
  const [epgSources, setEpgSources] = useState({});

  const [heroConfirm, setHeroConfirm] = useState(null); // { current, next, type: "video"|"show" }

  // Music Videos state
  const [musicVideosList, setMusicVideosList] = useState([]);
  const [musicVideosLoading, setMusicVideosLoading] = useState(false);
  const [editingMusicVideoId, setEditingMusicVideoId] = useState(null);
  const [musicVideoForm, setMusicVideoForm] = useState(EMPTY_MUSIC_VIDEO);
  const [musicVideoSaving, setMusicVideoSaving] = useState(false);
  const [deleteMusicVideoConfirm, setDeleteMusicVideoConfirm] = useState(null);

  // Ads state
  const [adList, setAdList] = useState([]);
  const [adLoading, setAdLoading] = useState(false);
  const [editingAdId, setEditingAdId] = useState(null);
  const [adForm, setAdForm] = useState(EMPTY_AD);
  const [adLastFetched, setAdLastFetched] = useState(null);
  const [reportLastFetched, setReportLastFetched] = useState(null);
  const [adSaving, setAdSaving] = useState(false);
  const [deleteAdConfirm, setDeleteAdConfirm] = useState(null);
  const [adTableMissing, setAdTableMissing] = useState(false);
  const [adAnalytics, setAdAnalytics] = useState(null);

  // Reports state
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportSection, setReportSection] = useState("overview");
  const [todayStats, setTodayStats] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [userSearchResults, setUserSearchResults] = useState([]);
  const [selectedUserStats, setSelectedUserStats] = useState(null);
  const [userStatsLoading, setUserStatsLoading] = useState(false);

  // Subscriptions state
  const [subs, setSubs] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState(null);
  const [subSearch, setSubSearch] = useState("");
  const [subStatusFilter, setSubStatusFilter] = useState("all");
  const [subSort, setSubSort] = useState({ col: "created_at", dir: "desc" });

  // The Boss state
  const [bossAuthed, setBossAuthed] = useState(() => sessionStorage.getItem("peep_boss_auth") === "1");
  const [bossPinInput, setBossPinInput] = useState("");
  const [bossPinError, setBossPinError] = useState(false);
  const [promos, setPromos] = useState([]);
  const [promosLoading, setPromosLoading] = useState(false);
  const [promoForm, setPromoForm] = useState({ name: "", code: "" });
  const [promoSaving, setPromoSaving] = useState(false);
  const [bossSettings, setBossSettings] = useState({ maintenance_mode: "false", banner_active: "false", banner_text: "", banner_expires_at: "" });
  const [grantEmail, setGrantEmail] = useState("");
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantResult, setGrantResult] = useState(null);
  const [loginAttempts, setLoginAttempts] = useState([]);
  const [bossView, setBossView] = useState("main"); // "main" | "security"
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [blockEmail, setBlockEmail] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [blockLoading, setBlockLoading] = useState(false);
  const [activeSessions, setActiveSessions] = useState([]);
  const [lockoutSettings, setLockoutSettings] = useState({ lockout_max_attempts: "5", lockout_duration_mins: "15" });

  const subscriptionRef = useRef(null);
  const carouselSubRef = useRef(null);
  const showSubRef = useRef(null);
  const xmltvFileRef = useRef(null);

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
    loadMusicVideos();
    loadAds();
    loadAdAnalytics();

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

  // Admin presence heartbeat — show admin sessions in Online Now
  useEffect(() => {
    const ping = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      supabase.from("user_presence").upsert(
        { user_id: session.user.id, last_seen: new Date().toISOString(), current_page: "admin" },
        { onConflict: "user_id" }
      ).then(() => {});
    };
    ping();
    const t = setInterval(ping, 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (tab === "reports") { loadReports(); loadTodayStats(); loadOnlineUsers(); }
    if (tab === "ads") { loadAdAnalytics(); loadTodayStats(); }
    if (tab === "subscriptions") loadSubscriptions();
    if (tab === "boss") { loadPromos(); loadBossSettings(); }
    if (tab === "boss") setBossView("main");
  }, [tab]);

  useEffect(() => {
    if (tab !== "ads" && tab !== "reports") return;
    const fiveMin = setInterval(() => {
      if (tab === "ads") loadAdAnalytics();
      if (tab === "reports") { loadReports(); loadTodayStats(); }
    }, 5 * 60 * 1000);
    const oneMin = (tab === "reports" || tab === "ads") ? setInterval(() => { loadTodayStats(); if (tab === "reports") loadOnlineUsers(); }, 60 * 1000) : null;
    return () => { clearInterval(fiveMin); if (oneMin) clearInterval(oneMin); };
  }, [tab]);

  async function fetchUserStatsForProfile(profile) {
    try {
      const uid = profile.id;
      const [
        { data: watchRows },
        { data: adRows },
        { data: ratingRows },
        { data: listRows },
      ] = await Promise.all([
        supabase.from("watch_progress").select("content_id, content_type, progress_seconds, duration_seconds, completed, last_watched_at").eq("user_id", uid).order("last_watched_at", { ascending: false }),
        supabase.from("ad_impressions").select("event, created_at, vast_tag_id").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("ratings").select("*").eq("user_id", uid),
        supabase.from("user_list").select("content_id, content_type").eq("user_id", uid),
      ]);
      const allRows = [...(watchRows || []), ...(listRows || [])];
      const idsFor = type => [...new Set(allRows.filter(r => r.content_type === type).map(r => r.content_id))];
      const movieIds = idsFor("movie");
      const epIds = idsFor("episode");
      const podEpIds = idsFor("podcast_episode");
      const [{ data: movTitles }, { data: epTitles }, { data: podEpTitles }, { data: tagNames }] = await Promise.all([
        movieIds.length ? supabase.from("videos").select("id, title").in("id", movieIds) : { data: [] },
        epIds.length ? supabase.from("episodes").select("id, title").in("id", epIds) : { data: [] },
        podEpIds.length ? supabase.from("podcast_episodes").select("id, title").in("id", podEpIds) : { data: [] },
        supabase.from("vast_tags").select("id, name"),
      ]);
      const titleMap = {};
      (movTitles || []).forEach(v => { titleMap[`movie:${v.id}`] = v.title; });
      (epTitles || []).forEach(e => { titleMap[`episode:${e.id}`] = e.title; });
      (podEpTitles || []).forEach(e => { titleMap[`podcast_episode:${e.id}`] = e.title; });
      const tagMap = {};
      (tagNames || []).forEach(t => { tagMap[t.id] = t.name; });
      const watchHistory = (watchRows || []).map(w => ({ ...w, title: titleMap[`${w.content_type}:${w.content_id}`] || null, pct: w.duration_seconds > 0 ? Math.round((w.progress_seconds / w.duration_seconds) * 100) : null })).filter(w => w.title);
      const adHistory = (adRows || []).map(r => ({ ...r, tagName: tagMap[r.vast_tag_id] || "Unknown Tag" }));
      const myList = (listRows || []).map(l => ({ ...l, title: titleMap[`${l.content_type}:${l.content_id}`] || null })).filter(l => l.title);
      const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const byDay = {};
      (watchRows || []).filter(w => w.last_watched_at >= thirtyAgo).forEach(w => { const d = w.last_watched_at.slice(0, 10); byDay[d] = (byDay[d] || 0) + 1; });
      const sessionTimeline = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]));
      return { profile, watchHistory, adHistory, myList, ratingRows: ratingRows || [], sessionTimeline };
    } catch (err) {
      console.error("fetchUserStatsForProfile error:", err);
      return { profile, watchHistory: [], adHistory: [], myList: [], ratingRows: [], sessionTimeline: [] };
    }
  }

  async function searchUsers(query) {
    if (!query.trim()) { setUserSearchResults([]); return; }
    try {
      const { data } = await supabase.from("profiles").select("id, username, email, created_at, is_admin").or(`email.ilike.%${query}%,username.ilike.%${query}%`).limit(10);
      setUserSearchResults(data || []);
    } catch (err) {
      console.error("searchUsers error:", err);
      setUserSearchResults([]);
    }
  }

  async function loadSelectedUserStats(profile) {
    setUserStatsLoading(true);
    setSelectedUserStats(null);
    try {
      const stats = await fetchUserStatsForProfile(profile);
      setSelectedUserStats(stats);
    } catch (err) {
      console.error("loadSelectedUserStats error:", err);
      showToast("Failed to load user stats", "error");
    }
    setUserStatsLoading(false);
  }

  async function loadTodayStats() {
    try {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayISO = todayStart.toISOString();
      const liveISO = new Date(Date.now() - 90 * 1000).toISOString();
      const [
        { data: watchToday },
        { data: adsToday },
        { count: newUsers },
        { count: liveCount },
      ] = await Promise.all([
        supabase.from("watch_progress").select("progress_seconds").gte("last_watched_at", todayISO),
        supabase.from("ad_impressions").select("event").gte("created_at", todayISO),
        supabase.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", todayISO),
        supabase.from("live_viewers").select("*", { count: "exact", head: true }).gte("last_ping", liveISO),
      ]);
      const sessionsToday = (watchToday || []).length;
      const hoursToday = +((watchToday || []).reduce((s, w) => s + (w.progress_seconds || 0), 0) / 3600).toFixed(1);
      const adImpressionsToday = (adsToday || []).filter(r => r.event === "impression").length;
      const adSkipsToday = (adsToday || []).filter(r => r.event === "skip").length;
      setTodayStats({ sessionsToday, hoursToday, adImpressionsToday, adSkipsToday, newUsers: newUsers || 0, liveNow: liveCount || 0 });
    } catch (err) {
      console.error("loadTodayStats error:", err);
    }
  }

  async function loadOnlineUsers() {
    try {
      const cutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      const { data: presence, error } = await supabase
        .from("user_presence")
        .select("user_id, last_seen, current_page")
        .gte("last_seen", cutoff)
        .order("last_seen", { ascending: false });
      if (error) { console.error("loadOnlineUsers presence error:", error); setOnlineUsers([]); return; }
      if (!presence || presence.length === 0) { setOnlineUsers([]); return; }
      const ids = presence.map(r => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, username")
        .in("id", ids);
      const profileMap = {};
      (profiles || []).forEach(p => { profileMap[p.id] = p; });
      setOnlineUsers(presence.map(r => ({ ...r, profile: profileMap[r.user_id] || null })));
    } catch (err) {
      console.error("loadOnlineUsers error:", err);
    }
  }

  async function loadSubscriptions() {
    setSubsLoading(true);
    const { data: subsData } = await supabase.from("subscriptions").select("*").order("created_at", { ascending: false });
    if (!subsData?.length) { setSubs([]); setSubsLoading(false); return; }
    const userIds = subsData.map(s => s.user_id);
    const [{ data: presenceData }, { data: watchData }, { data: profileData }] = await Promise.all([
      supabase.from("user_presence").select("user_id, last_seen").in("user_id", userIds),
      supabase.from("watch_progress").select("user_id").in("user_id", userIds),
      supabase.from("viewer_profiles").select("user_id").in("user_id", userIds),
    ]);
    const presenceMap = {};
    (presenceData || []).forEach(p => { presenceMap[p.user_id] = p.last_seen; });
    const watchMap = {};
    (watchData || []).forEach(w => { watchMap[w.user_id] = (watchMap[w.user_id] || 0) + 1; });
    const profileMap = {};
    (profileData || []).forEach(p => { profileMap[p.user_id] = (profileMap[p.user_id] || 0) + 1; });
    setSubs(subsData.map(s => ({ ...s, last_seen: presenceMap[s.user_id] || null, watch_sessions: watchMap[s.user_id] || 0, profile_count: profileMap[s.user_id] || 0 })));
    setSubsLoading(false);
  }

  async function revokeSubscription(id) {
    await supabase.from("subscriptions").delete().eq("id", id);
    setRevokeConfirm(null);
    loadSubscriptions();
    showToast("Subscription revoked");
  }

  async function loadLoginAttempts() {
    const { data } = await supabase.from("admin_login_attempts").select("*").order("attempted_at", { ascending: false }).limit(50);
    setLoginAttempts(data || []);
  }

  async function loadSecurityData() {
    const [{ data: blocked }, { data: sessions }, { data: settings }] = await Promise.all([
      supabase.from("blocked_users").select("*").order("blocked_at", { ascending: false }),
      supabase.from("user_presence").select("user_id, last_seen, current_page").order("last_seen", { ascending: false }).limit(20),
      supabase.from("app_settings").select("key, value").in("key", ["lockout_max_attempts", "lockout_duration_mins"]),
    ]);
    setBlockedUsers(blocked || []);

    if (sessions?.length) {
      const userIds = sessions.map(s => s.user_id).filter(Boolean);
      const [{ data: subData }, { data: profileData }] = await Promise.all([
        supabase.from("subscriptions").select("user_id, email").in("user_id", userIds),
        supabase.from("viewer_profiles").select("user_id, name").in("user_id", userIds),
      ]);
      const emailMap = {};
      (subData || []).forEach(s => { emailMap[s.user_id] = s.email; });
      const nameMap = {};
      (profileData || []).forEach(p => { if (!nameMap[p.user_id]) nameMap[p.user_id] = p.name; });
      setActiveSessions(sessions.map(s => ({ ...s, email: emailMap[s.user_id] || null, profileName: nameMap[s.user_id] || null })));
    } else {
      setActiveSessions([]);
    }

    const s = {};
    (settings || []).forEach(r => { s[r.key] = r.value; });
    if (Object.keys(s).length) setLockoutSettings(prev => ({ ...prev, ...s }));
    loadLoginAttempts();
  }

  async function blockUser() {
    if (!blockEmail.trim()) return;
    setBlockLoading(true);
    const { error } = await supabase.from("blocked_users").insert({ email: blockEmail.trim().toLowerCase(), reason: blockReason.trim() || null });
    if (error) showToast(error.message, "error");
    else { showToast("User blocked"); setBlockEmail(""); setBlockReason(""); loadSecurityData(); }
    setBlockLoading(false);
  }

  async function unblockUser(id) {
    await supabase.from("blocked_users").delete().eq("id", id);
    setBlockedUsers(b => b.filter(u => u.id !== id));
    showToast("User unblocked");
  }

  async function loadBossSettings() {
    const { data } = await supabase.from("app_settings").select("key, value");
    const s = {};
    (data || []).forEach(r => { s[r.key] = r.value; });
    setBossSettings(prev => ({ ...prev, ...s }));
  }

  async function saveSetting(key, value) {
    await supabase.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    setBossSettings(prev => ({ ...prev, [key]: value }));
  }

  async function grantAccessByEmail() {
    if (!grantEmail.trim()) return;
    setGrantLoading(true);
    setGrantResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("https://iuozujwtuzuwubhsnhix.supabase.co/functions/v1/grant-access", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session.access_token}` },
        body: JSON.stringify({ email: grantEmail.trim() }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setGrantResult({ success: true, msg: `Access granted to ${data.email}` });
      setGrantEmail("");
    } catch (err) {
      setGrantResult({ success: false, msg: err.message });
    }
    setGrantLoading(false);
  }

  async function loadPromos() {
    setPromosLoading(true);
    const { data } = await supabase.from("promo_codes").select("*").order("created_at", { ascending: false });
    setPromos(data || []);
    setPromosLoading(false);
  }

  async function savePromo() {
    if (!promoForm.name.trim() || !promoForm.code.trim()) return;
    setPromoSaving(true);
    const { error } = await supabase.from("promo_codes").insert({
      name: promoForm.name.trim(),
      code: promoForm.code.trim().toUpperCase(),
      active: true,
    });
    if (error) { showToast(error.message, "error"); }
    else { setPromoForm({ name: "", code: "" }); showToast("Promo code created"); loadPromos(); }
    setPromoSaving(false);
  }

  async function togglePromo(id, active) {
    await supabase.from("promo_codes").update({ active }).eq("id", id);
    setPromos(p => p.map(x => x.id === id ? { ...x, active } : x));
  }

  async function deletePromo(id) {
    await supabase.from("promo_codes").delete().eq("id", id);
    setPromos(p => p.filter(x => x.id !== id));
    showToast("Promo code deleted");
  }

  function exportSubsCSV() {
    const headers = ["Email", "Status", "Started", "Period Ends", "Last Seen", "Watch Sessions", "Profiles", "Stripe Customer", "Stripe Subscription"];
    const csvRows = subs.map(s => [
      s.email || s.user_id,
      s.status,
      s.created_at ? new Date(s.created_at).toLocaleDateString() : "",
      s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "",
      s.last_seen ? new Date(s.last_seen).toLocaleDateString() : "Never",
      s.watch_sessions,
      s.profile_count,
      s.stripe_customer_id || "",
      s.stripe_subscription_id || "",
    ].map(v => `"${v}"`));
    const csv = [headers, ...csvRows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `peep-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function loadReports() {
    setReportLoading(true);
    try {
    const [
      { count: userCount },
      { count: videoCount },
      { count: showCount },
      { count: episodeCount },
      { data: watchData },
      { data: ratingsData },
      { data: listData },
      { data: profilesData },
      { data: videoCatData },
      { data: showCatData },
    ] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("videos").select("*", { count: "exact", head: true }),
      supabase.from("shows").select("*", { count: "exact", head: true }),
      supabase.from("episodes").select("*", { count: "exact", head: true }),
      supabase.from("watch_progress").select("user_id, content_id, content_type, completed, progress_seconds, duration_seconds, last_watched_at"),
      supabase.from("ratings").select("user_id, content_id, rating"),
      supabase.from("user_list").select("user_id, content_id, content_type"),
      supabase.from("profiles").select("id, username, email, created_at").order("created_at", { ascending: true }),
      supabase.from("videos").select("id, category"),
      supabase.from("shows").select("id, category"),
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
    // Cross-reference content_type from watch_progress since ratings table may not have it
    const watchTypeMap = {};
    (watchData || []).forEach(w => { if (w.content_id && w.content_type) watchTypeMap[w.content_id] = w.content_type; });
    const ratingMap = {};
    (ratingsData || []).forEach(r => {
      if (r.rating === 1) {
        const ctype = r.content_type || watchTypeMap[r.content_id] || null;
        if (!ctype) return;
        const key = `${ctype}:${r.content_id}`;
        ratingMap[key] = (ratingMap[key] || 0) + 1;
      }
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
    const allEpIds = [...new Set((watchData || []).filter(w => w.content_type === "episode").map(w => w.content_id))];
    const [movTitles, epTitles, podEpTitles, showTitles, epShowRes] = await Promise.all([
      idsFor("movie").length ? supabase.from("videos").select("id, title").in("id", idsFor("movie")) : { data: [] },
      idsFor("episode").length ? supabase.from("episodes").select("id, title").in("id", idsFor("episode")) : { data: [] },
      idsFor("podcast_episode").length ? supabase.from("podcast_episodes").select("id, title").in("id", idsFor("podcast_episode")) : { data: [] },
      idsFor("show").length ? supabase.from("shows").select("id, title").in("id", idsFor("show")) : { data: [] },
      allEpIds.length ? supabase.from("episodes").select("id, show_id").in("id", allEpIds) : { data: [] },
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

    // Category performance (movies by videos.category, episodes/shows by shows.category)
    const movieCatMap = {};
    (videoCatData || []).forEach(v => { if (v.category) movieCatMap[v.id] = v.category; });
    const showCatMap = {};
    (showCatData || []).forEach(s => { if (s.category) showCatMap[s.id] = s.category; });
    const epShowMap = {};
    (epShowRes.data || []).forEach(e => { epShowMap[e.id] = e.show_id; });
    const catMap = {};
    (watchData || []).forEach(w => {
      let cat = null;
      if (w.content_type === "movie") cat = movieCatMap[w.content_id];
      else if (w.content_type === "show") cat = showCatMap[w.content_id];
      else if (w.content_type === "episode") { const sid = epShowMap[w.content_id]; cat = sid ? showCatMap[sid] : null; }
      if (!cat) return;
      if (!catMap[cat]) catMap[cat] = { sessions: 0, completed: 0, seconds: 0 };
      catMap[cat].sessions++;
      if (w.completed) catMap[cat].completed++;
      if (w.progress_seconds) catMap[cat].seconds += w.progress_seconds;
    });
    const categoryStats = Object.entries(catMap)
      .map(([cat, d]) => ({
        cat,
        sessions: d.sessions,
        completedPct: d.sessions > 0 ? Math.round(d.completed / d.sessions * 100) : 0,
        hours: Math.round(d.seconds / 3600 * 10) / 10,
      }))
      .sort((a, b) => b.sessions - a.sessions);

    // Subscriber funnel — computed after userEngagement is built
    const watchedCount = userEngagement.filter(u => u.sessions > 0).length;
    const completedCount = userEngagement.filter(u => u.completed > 0).length;
    const subscriberFunnel = [
      { label: "Registered", count: userCount ?? 0 },
      { label: "Watched ≥1", count: watchedCount },
      { label: "Completed ≥1", count: completedCount },
      { label: "Active (7d)", count: activeUsers7d },
    ];

    // Watch depth distribution (progress_seconds / duration_seconds buckets)
    const depthBuckets = [
      { label: "< 25%", count: 0, color: "#f87171" },
      { label: "25–50%", count: 0, color: "#fb923c" },
      { label: "50–75%", count: 0, color: "#facc15" },
      { label: "75–100%", count: 0, color: "#34d399" },
    ];
    (watchData || []).forEach(w => {
      if (!w.duration_seconds) return;
      const pct = (w.progress_seconds || 0) / w.duration_seconds;
      if (pct < 0.25) depthBuckets[0].count++;
      else if (pct < 0.5) depthBuckets[1].count++;
      else if (pct < 0.75) depthBuckets[2].count++;
      else depthBuckets[3].count++;
    });

    // Hour-of-day activity (all-time)
    const hourMap = Array(24).fill(0);
    (watchData || []).forEach(w => {
      if (!w.last_watched_at) return;
      hourMap[new Date(w.last_watched_at).getHours()]++;
    });
    const hourStats = hourMap.map((count, h) => ({
      label: h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`,
      count,
    }));

    // Watch hours over time (by day, last 30 days)
    const hoursByDay = {};
    (watchData || []).forEach(w => {
      if (!w.last_watched_at || w.last_watched_at < thirtyDaysAgo || !w.progress_seconds) return;
      const day = w.last_watched_at.slice(0, 10);
      hoursByDay[day] = (hoursByDay[day] || 0) + w.progress_seconds / 3600;
    });
    const hoursTrend = Object.entries(hoursByDay)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, h]) => [day, Math.round(h * 10) / 10]);

    // Sessions by content type (with completion rate and hours)
    const typeMap = {};
    (watchData || []).forEach(w => {
      const t = w.content_type || "unknown";
      if (!typeMap[t]) typeMap[t] = { sessions: 0, completed: 0, seconds: 0 };
      typeMap[t].sessions++;
      if (w.completed) typeMap[t].completed++;
      if (w.progress_seconds) typeMap[t].seconds += w.progress_seconds;
    });
    const TYPE_LABELS = { movie: "Movies", episode: "TV Episodes", podcast_episode: "Podcasts", show: "Shows" };
    const contentTypeStats = Object.entries(typeMap)
      .map(([type, d]) => ({
        type,
        label: TYPE_LABELS[type] || type,
        sessions: d.sessions,
        completedPct: d.sessions > 0 ? Math.round((d.completed / d.sessions) * 100) : 0,
        hours: Math.round(d.seconds / 3600 * 10) / 10,
      }))
      .sort((a, b) => b.sessions - a.sessions);

    // Day-of-week activity pattern (all time)
    const dowMap = [0, 0, 0, 0, 0, 0, 0];
    (watchData || []).forEach(w => {
      if (!w.last_watched_at) return;
      dowMap[new Date(w.last_watched_at).getDay()]++;
    });
    const dowStats = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, i) => ({ label, count: dowMap[i] }));

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
      hoursTrend, contentTypeStats, dowStats,
      categoryStats, subscriberFunnel, depthBuckets, hourStats,
    });
    setReportLastFetched(new Date());
    } catch (err) {
      console.error("loadReports error:", err);
      showToast("Failed to load reports: " + err.message, "error");
    } finally {
      setReportLoading(false);
    }
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

  // ──── MUSIC VIDEOS ────

  async function loadMusicVideos() {
    setMusicVideosLoading(true);
    const { data, error } = await supabase.from("music_videos").select("*").order("artist", { ascending: true });
    if (error) showToast("Failed to load music videos: " + error.message, "error");
    else setMusicVideosList(data || []);
    setMusicVideosLoading(false);
  }

  function startMusicVideoEdit(mv) {
    setEditingMusicVideoId(mv.id);
    setMusicVideoForm({
      title: mv.title ?? "", artist: mv.artist ?? "", url: mv.url ?? "",
      thumbnail: mv.thumbnail ?? "", poster: mv.poster ?? "", trailer_url: mv.trailer_url ?? "",
      duration: mv.duration ?? "", year: mv.year ? String(mv.year) : "",
      description: mv.description ?? "", tags: Array.isArray(mv.tags) ? mv.tags.join(", ") : (mv.tags ?? ""),
      enabled: mv.enabled !== false,
    });
    setDrawerOpen(true);
  }

  function cancelMusicVideoEdit() {
    setEditingMusicVideoId(null);
    setMusicVideoForm(EMPTY_MUSIC_VIDEO);
    setDrawerOpen(false);
  }

  async function saveMusicVideo() {
    if (!musicVideoForm.title.trim()) { showToast("Title is required.", "error"); return; }
    if (!musicVideoForm.artist.trim()) { showToast("Artist is required.", "error"); return; }
    setMusicVideoSaving(true);
    const tagsArr = musicVideoForm.tags ? musicVideoForm.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
    const payload = {
      title: musicVideoForm.title.trim(), artist: musicVideoForm.artist.trim(),
      url: musicVideoForm.url.trim(), thumbnail: musicVideoForm.thumbnail.trim(),
      poster: musicVideoForm.poster.trim(), trailer_url: musicVideoForm.trailer_url.trim(),
      duration: musicVideoForm.duration.trim(), year: musicVideoForm.year ? Number(musicVideoForm.year) : null,
      description: musicVideoForm.description.trim(), tags: tagsArr, enabled: musicVideoForm.enabled,
    };
    try {
      if (editingMusicVideoId) {
        const { error } = await supabase.from("music_videos").update(payload).eq("id", editingMusicVideoId);
        if (error) throw error;
        showToast("Music video updated");
      } else {
        const { error } = await supabase.from("music_videos").insert([payload]);
        if (error) throw error;
        showToast("Music video added");
      }
      cancelMusicVideoEdit();
      await loadMusicVideos();
    } catch (err) { showToast("Save failed: " + err.message, "error"); }
    setMusicVideoSaving(false);
  }

  async function deleteMusicVideo(id) {
    const { error } = await supabase.from("music_videos").delete().eq("id", id);
    if (error) showToast("Delete failed: " + error.message, "error");
    else { showToast("Music video deleted"); setDeleteMusicVideoConfirm(null); await loadMusicVideos(); }
  }

  // ──── ADS / VAST TAGS ────

  async function loadAds() {
    setAdLoading(true);
    const { data, error } = await supabase.from("vast_tags").select("*").order("id", { ascending: true });
    if (error) {
      if (error.code === "42P01") setAdTableMissing(true);
      else showToast("Failed to load ads: " + error.message, "error");
    } else {
      setAdTableMissing(false);
      setAdList(data || []);
    }
    setAdLoading(false);
  }

  function startAdEdit(ad) {
    setEditingAdId(ad.id);
    setAdForm({ name: ad.name ?? "", tag_url: ad.tag_url ?? "", ad_type: ad.ad_type ?? "pre_roll", scope: ad.scope ?? "global", content_id: ad.content_id ?? "", active: ad.active ?? true });
    setDrawerOpen(true);
  }

  function cancelAdEdit() { setEditingAdId(null); setAdForm(EMPTY_AD); setDrawerOpen(false); }

  async function saveAd() {
    if (!adForm.name.trim()) { showToast("Name is required.", "error"); return; }
    if (!adForm.tag_url.trim()) { showToast("VAST tag URL is required.", "error"); return; }
    setAdSaving(true);
    const payload = { name: adForm.name.trim(), tag_url: adForm.tag_url.trim(), ad_type: adForm.ad_type, scope: adForm.scope, content_id: adForm.scope !== "global" && adForm.content_id !== "" ? Number(adForm.content_id) : null, active: adForm.active };
    try {
      if (editingAdId) {
        const { error } = await supabase.from("vast_tags").update(payload).eq("id", editingAdId);
        if (error) throw error;
        showToast("Ad tag updated"); cancelAdEdit();
      } else {
        const { error } = await supabase.from("vast_tags").insert([payload]);
        if (error) throw error;
        showToast("Ad tag added"); setAdForm(EMPTY_AD); setDrawerOpen(false);
      }
      await loadAds();
    } catch (error) { showToast("Save failed: " + error.message, "error"); }
    setAdSaving(false);
  }

  async function toggleAdActive(ad) {
    const { error } = await supabase.from("vast_tags").update({ active: !ad.active }).eq("id", ad.id);
    if (error) showToast("Update failed: " + error.message, "error");
    else await loadAds();
  }

  async function deleteAd(id) {
    const { error } = await supabase.from("vast_tags").delete().eq("id", id);
    if (error) showToast("Delete failed: " + error.message, "error");
    else { showToast("Ad tag deleted"); setDeleteAdConfirm(null); await loadAds(); }
  }

  async function loadAdAnalytics() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from("ad_impressions")
      .select("vast_tag_id, event, created_at, user_id")
      .gte("created_at", since);
    if (!data) return;

    const impressions = data.filter(r => r.event === "impression").length;
    const completes   = data.filter(r => r.event === "complete").length;
    const skips       = data.filter(r => r.event === "skip").length;
    const errors      = data.filter(r => r.event === "error").length;

    const completionRate = impressions > 0 ? Math.round(completes / impressions * 100) : null;
    const fillRate = (impressions + errors) > 0 ? Math.round(impressions / (impressions + errors) * 100) : null;
    const uniqueViewers = new Set(data.filter(r => r.event === "impression" && r.user_id).map(r => r.user_id)).size;

    // Last 14 days bucketed
    const today = new Date();
    const dayBuckets = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      dayBuckets[d.toISOString().slice(0, 10)] = 0;
    }
    data.filter(r => r.event === "impression").forEach(r => {
      const key = r.created_at.slice(0, 10);
      if (key in dayBuckets) dayBuckets[key]++;
    });
    const dailyData = Object.entries(dayBuckets).map(([date, count]) => ({ date, count }));

    // Per-tag stats
    const tagStats = {};
    data.forEach(r => {
      const tid = r.vast_tag_id;
      if (!tagStats[tid]) tagStats[tid] = { impressions: 0, completes: 0, skips: 0, errors: 0 };
      if (r.event === "impression") tagStats[tid].impressions++;
      if (r.event === "complete")   tagStats[tid].completes++;
      if (r.event === "skip")       tagStats[tid].skips++;
      if (r.event === "error")      tagStats[tid].errors++;
    });

    setAdAnalytics({ impressions, completionRate, fillRate, skips, uniqueViewers, dailyData, tagStats });
    setAdLastFetched(new Date());
  }

  // ──── LIVE STREAMS ────

  async function loadLiveStreams() {
    setLiveLoading(true);
    const [streamsRes, sourcesRes] = await Promise.all([
      supabase.from("live_streams").select("*").order("id", { ascending: true }),
      supabase.from("epg_channel_sources").select("*"),
    ]);
    if (streamsRes.error) showToast("Failed to load streams: " + streamsRes.error.message, "error");
    else setLiveList(streamsRes.data || []);
    if (!sourcesRes.error) {
      const map = {};
      (sourcesRes.data || []).forEach(row => { map[row.channel_id] = row; });
      setEpgSources(map);
    }
    setLiveLoading(false);
  }

  function startLiveEdit(s) {
    setEditingLiveId(s.id);
    setDrawerOpen(true);
    setLiveForm({ title: s.title ?? "", description: s.description ?? "", stream_url: s.stream_url ?? "", thumbnail: s.thumbnail ?? "", hero_image: s.hero_image ?? "", is_live: s.is_live ?? true, is_hero: s.is_hero ?? false, badge_text: s.badge_text ?? "LIVE", channel_number: s.channel_number ?? "", now_airing: s.now_airing ?? "", up_next: s.up_next ?? "" });
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

  async function setHero(s) {
    await supabase.from("live_streams").update({ is_hero: false }).neq("id", s.id);
    const { error } = await supabase.from("live_streams").update({ is_hero: !s.is_hero }).eq("id", s.id);
    if (error) showToast("Failed to update hero: " + error.message, "error");
    else { showToast(s.is_hero ? "Hero cleared" : `${s.title} set as hero`); await loadLiveStreams(); }
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

  function parseXMLTVDate(str) {
    if (!str) return null;
    const raw = str.trim().replace(/\s+/, " ");
    const spaceIdx = raw.indexOf(" ");
    const datePart = spaceIdx >= 0 ? raw.slice(0, spaceIdx) : raw;
    const offsetPart = spaceIdx >= 0 ? raw.slice(spaceIdx + 1) : "";
    const y = datePart.slice(0, 4), mo = datePart.slice(4, 6), d = datePart.slice(6, 8);
    const h = datePart.slice(8, 10) || "00", mi = datePart.slice(10, 12) || "00", s = datePart.slice(12, 14) || "00";
    let iso = `${y}-${mo}-${d}T${h}:${mi}:${s}`;
    if (offsetPart) {
      iso += `${offsetPart[0]}${offsetPart.slice(1, 3)}:${offsetPart.slice(3, 5) || "00"}`;
    } else {
      iso += "Z";
    }
    const dt = new Date(iso);
    return isNaN(dt) ? null : dt;
  }

  function parseXMLTVText(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");
    if (doc.querySelector("parsererror")) throw new Error("Invalid XML — check the file format");
    const channels = {};
    doc.querySelectorAll("channel").forEach(ch => {
      const id = ch.getAttribute("id");
      if (id) channels[id] = ch.querySelector("display-name")?.textContent?.trim() || id;
    });
    const programmes = [];
    doc.querySelectorAll("programme").forEach(prog => {
      const channel = prog.getAttribute("channel");
      const start = parseXMLTVDate(prog.getAttribute("start"));
      const end = parseXMLTVDate(prog.getAttribute("stop"));
      if (!start || !end || !channel) return;
      programmes.push({
        channel,
        start_time: start,
        end_time: end,
        title: prog.querySelector("title")?.textContent?.trim() || "(Untitled)",
        description: prog.querySelector("desc")?.textContent?.trim() || "",
        thumbnail: prog.querySelector("icon")?.getAttribute("src") || "",
      });
    });
    return { channels, programmes };
  }

  function xmltvAutoMap(channels) {
    const autoMap = {};
    Object.entries(channels).forEach(([xId, xName]) => {
      const lower = xName.toLowerCase();
      const match = liveList.find(ch =>
        ch.title.toLowerCase().includes(lower) || lower.includes(ch.title.toLowerCase())
      );
      if (match) autoMap[xId] = match.id;
    });
    return autoMap;
  }

  async function loadXmltvFile(file) {
    setXmltvLoading(true); setXmltvError(""); setXmltvParsed(null); setXmltvFileName(file.name); setXmltvRawText(""); setXmltvRawOpen(false);
    try {
      const text = await file.text();
      setXmltvRawText(text);
      const parsed = parseXMLTVText(text);
      setXmltvParsed(parsed);
      setXmltvChannelMap(xmltvAutoMap(parsed.channels));
    } catch (e) { setXmltvError(e.message); setXmltvFileName(""); }
    setXmltvLoading(false);
  }

  async function loadXmltvUrl() {
    if (!xmltvUrl.trim()) return;
    setXmltvLoading(true); setXmltvError(""); setXmltvParsed(null); setXmltvRawText(""); setXmltvRawOpen(false);
    try {
      const res = await fetch(xmltvUrl.trim());
      if (!res.ok) throw new Error(`HTTP ${res.status} — check the URL`);
      const text = await res.text();
      setXmltvRawText(text);
      const parsed = parseXMLTVText(text);
      setXmltvParsed(parsed);
      setXmltvChannelMap(xmltvAutoMap(parsed.channels));
    } catch (e) { setXmltvError(e.message); }
    setXmltvLoading(false);
  }

  async function importXmltv() {
    if (!xmltvParsed) return;
    setXmltvImporting(true); setXmltvError("");
    const entries = xmltvParsed.programmes
      .filter(p => xmltvChannelMap[p.channel])
      .map(p => ({
        channel_id: xmltvChannelMap[p.channel],
        title: p.title,
        description: p.description || null,
        thumbnail: p.thumbnail || null,
        start_time: p.start_time.toISOString(),
        end_time: p.end_time.toISOString(),
      }));
    if (!entries.length) {
      setXmltvError("No channels mapped — assign at least one channel below.");
      setXmltvImporting(false); return;
    }
    const channelIds = [...new Set(entries.map(e => e.channel_id))];
    const minStart = entries.reduce((m, e) => e.start_time < m ? e.start_time : m, entries[0].start_time);
    const maxEnd = entries.reduce((m, e) => e.end_time > m ? e.end_time : m, entries[0].end_time);
    for (const cId of channelIds) {
      await supabase.from("epg_entries").delete().eq("channel_id", cId).gte("start_time", minStart).lte("end_time", maxEnd);
    }
    const BATCH = 500;
    for (let i = 0; i < entries.length; i += BATCH) {
      const { error } = await supabase.from("epg_entries").insert(entries.slice(i, i + BATCH));
      if (error) { setXmltvError(error.message); setXmltvImporting(false); return; }
    }
    // Save source tracking to DB per channel
    const sourceName = xmltvFileName || xmltvUrl || "XMLTV import";
    const now = new Date().toISOString();
    const sourceRows = channelIds.map(cId => ({
      channel_id: cId,
      source_name: sourceName,
      imported_at: now,
      program_count: entries.filter(e => e.channel_id === cId).length,
      xml_content: xmltvRawText || null,
    }));
    const { data: savedSources } = await supabase.from("epg_channel_sources").upsert(sourceRows, { onConflict: "channel_id" }).select();
    if (savedSources) {
      const updated = { ...epgSources };
      savedSources.forEach(row => { updated[row.channel_id] = row; });
      setEpgSources(updated);
    }
    setXmltvImportDone(entries.length);
    setXmltvImporting(false);
    if (selectedChannelForEpg && channelIds.includes(selectedChannelForEpg.id)) {
      loadEpgEntries(selectedChannelForEpg.id, epgDayOffset);
    }
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
      supabase.from("episodes").select("id, title, duration, thumbnail, url, show_id, season, episode_number").order("season").order("episode_number"),
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
    // Fetch everything in one shot so all state lands in a single React render
    const [lastEntry, vRes, eRes, sRes] = await Promise.all([
      selectedChannelForEpg
        ? supabase.from("epg_entries").select("end_time")
            .eq("channel_id", selectedChannelForEpg.id)
            .gte("end_time", new Date().toISOString())
            .order("end_time", { ascending: false }).limit(1).single()
        : Promise.resolve({ data: null }),
      supabase.from("videos").select("id, title, duration, thumbnail").order("title"),
      supabase.from("episodes").select("id, title, duration, thumbnail, url, show_id, season, episode_number").order("season").order("episode_number"),
      supabase.from("shows").select("id, title").order("title"),
    ]);

    let defaultStart = lastEntry.data?.end_time?.slice(0, 16) || "";
    if (!defaultStart) {
      const d = new Date();
      d.setUTCMinutes(0, 0, 0);
      d.setUTCHours(d.getUTCHours() + 1);
      defaultStart = d.toISOString().slice(0, 16);
    }

    const showNameMap = {};
    (sRes.data || []).forEach(s => { showNameMap[s.id] = s.title; });
    const eps = (eRes.data || []).map(ep => ({ ...ep, _showTitle: showNameMap[ep.show_id] || "Unknown Show" }));

    // All these setState calls are after a single await — React batches them into one render
    setAllVideosForEpg(vRes.data || []);
    setAllEpisodesForEpg(eps);
    setBulkContentType("episode");
    setBulkShowId("");
    setBulkSelectedEps(new Set());
    setBulkSelectedMovies(new Set());
    setBulkMovieSearch("");
    setBulkStartTime(defaultStart);
    setDrawerFormType("bulk");
    setDrawerOpen(true);
  }

  const [bulkScanning, setBulkScanning] = useState(false);
  const [bulkScanProgress, setBulkScanProgress] = useState({ done: 0, total: 0 });

  function detectVideoDuration(url) {
    return new Promise(resolve => {
      if (!url) return resolve(null);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.crossOrigin = "anonymous";
      video.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;width:1px;height:1px;";
      document.body.appendChild(video);
      let settled = false;
      const done = (result) => {
        if (settled) return;
        settled = true;
        video.src = "";
        video.remove();
        resolve(result);
      };
      video.onloadedmetadata = () => {
        const dur = video.duration;
        done(Number.isFinite(dur) && dur > 0 ? Math.round(dur) : null);
      };
      video.onerror = () => done(null);
      video.src = url;
      video.load();
      setTimeout(() => done(null), 12000);
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
      if (ep.url) {
        const secs = await detectVideoDuration(ep.url);
        if (secs && secs > 0) {
          await supabase.from("episodes").update({ duration: secs }).eq("id", ep.id);
          updates.push({ id: ep.id, duration: secs });
        }
      }
      setBulkScanProgress({ done: i + 1, total: eps.length });
    }
    if (updates.length > 0) {
      setAllEpisodesForEpg(prev => prev.map(ep => {
        const u = updates.find(u => u.id === ep.id);
        return u ? { ...ep, duration: u.duration } : ep;
      }));
      showToast(`Found durations for ${updates.length} episode${updates.length !== 1 ? "s" : ""}`);
    } else {
      showToast("Couldn't detect durations — videos may not be direct URLs or are inaccessible", "error");
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
    const fallbackSecs = Math.max(1, Number(bulkDefaultMins) || 30) * 60;
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
    // If no entries remain for this channel at all, wipe the source record too
    const { count } = await supabase
      .from("epg_entries")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", selectedChannelForEpg.id);
    if (count === 0) {
      await supabase.from("epg_channel_sources").delete().eq("channel_id", selectedChannelForEpg.id);
      setEpgSources(prev => { const u = { ...prev }; delete u[selectedChannelForEpg.id]; return u; });
    }
  }

  async function deleteLiveStream(id) {
    const { error } = await supabase.from("live_streams").delete().eq("id", id);
    if (error) showToast("Delete failed: " + error.message, "error");
    else { showToast("Stream deleted"); setDeleteLiveConfirm(null); await loadLiveStreams(); }
  }

  async function deletePlaylistSource(source) {
    setDeletingPlaylist(true);
    const { error } = await supabase.from("live_streams").delete().eq("playlist_source", source);
    if (error) showToast("Delete failed: " + error.message, "error");
    else { showToast("Playlist removed"); setDeletePlaylistConfirm(null); await loadLiveStreams(); }
    setDeletingPlaylist(false);
  }

  async function testAllChannels() {
    const streams = liveList.filter(s => s.stream_url);
    if (!streams.length) return;
    setTestingChannels(true);
    setChannelStatuses({});
    setTestProgress({ done: 0, total: streams.length });
    const BATCH = 5;
    for (let i = 0; i < streams.length; i += BATCH) {
      const batch = streams.slice(i, i + BATCH);
      await Promise.all(batch.map(async s => {
        setChannelStatuses(prev => ({ ...prev, [s.id]: "testing" }));
        try {
          const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(s.stream_url)}`, { signal: AbortSignal.timeout(12000) });
          const json = await res.json();
          const ok = json.contents && json.contents.length > 10;
          setChannelStatuses(prev => ({ ...prev, [s.id]: ok ? "ok" : "error" }));
        } catch {
          setChannelStatuses(prev => ({ ...prev, [s.id]: "error" }));
        }
      }));
      setTestProgress({ done: Math.min(i + BATCH, streams.length), total: streams.length });
    }
    setTestingChannels(false);
  }

  function parseM3U(text) {
    const lines = text.split("\n").map(l => l.trim());
    const channels = [];
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith("#EXTINF")) continue;
      const extinf = lines[i];
      let url = "";
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        if (lines[j] && !lines[j].startsWith("#")) { url = lines[j]; break; }
      }
      if (!url) continue;
      const commaIdx = extinf.lastIndexOf(",");
      const name = commaIdx >= 0 ? extinf.slice(commaIdx + 1).trim() : "Unknown Channel";
      const logoMatch = extinf.match(/tvg-logo="([^"]*)"/i);
      const groupMatch = extinf.match(/group-title="([^"]*)"/i);
      channels.push({ name: name || "Unknown Channel", url, logo: logoMatch?.[1] || "", group: groupMatch?.[1] || "" });
    }
    return channels;
  }

  async function fetchM3UPlaylist() {
    if (!m3uUrl.trim()) return;
    setM3uFetching(true); setM3uError(""); setM3uChannels([]); setM3uSelected(new Set()); setM3uPage(0); setM3uImportDone(null);
    let text = "";
    try {
      const res = await fetch(m3uUrl.trim(), { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      text = await res.text();
    } catch {
      try {
        const proxy = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(m3uUrl.trim())}`, { signal: AbortSignal.timeout(20000) });
        const json = await proxy.json();
        text = json.contents || "";
      } catch {
        setM3uError("Could not fetch the playlist. The URL may be invalid or blocked by CORS.");
        setM3uFetching(false); return;
      }
    }
    if (!text.includes("#EXTINF") && !text.includes("#EXTM3U")) {
      setM3uError("This does not appear to be a valid M3U playlist."); setM3uFetching(false); return;
    }
    const channels = parseM3U(text);
    if (channels.length === 0) { setM3uError("No channels found in this playlist."); setM3uFetching(false); return; }
    const existingUrls = new Set(liveList.map(s => s.stream_url).filter(Boolean));
    const tagged = channels.map(ch => ({ ...ch, duplicate: existingUrls.has(ch.url) }));
    setM3uChannels(tagged);
    setM3uSelected(new Set());
    setM3uFetching(false);
  }

  async function importM3USelected() {
    const toImport = m3uChannels.filter((ch, i) => m3uSelected.has(i) && !ch.duplicate);
    if (toImport.length === 0) { showToast("No new channels selected", "error"); return; }
    setM3uImporting(true);
    const { error } = await supabase.from("live_streams").insert(
      toImport.map(ch => ({ title: ch.name, description: ch.group || "", stream_url: ch.url, thumbnail: ch.logo || "", is_live: false, is_hero: false, badge_text: "LIVE", playlist_source: m3uUrl.trim() }))
    );
    if (error) { showToast("Import failed: " + error.message, "error"); }
    else { setM3uImportDone(toImport.length); showToast(`Imported ${toImport.length} channel${toImport.length !== 1 ? "s" : ""}`); await loadLiveStreams(); }
    setM3uImporting(false);
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
            <span style={{ color: "#facc15" }}>peep.</span><span style={{ color: "#4f46e5", fontSize: 13, fontFamily: "sans-serif", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginLeft: 6 }}>admin</span>
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
        <button onClick={() => { setTab("live"); setLivePasscodeInput(""); setLivePasscodeEntered(false); }} style={{ background: "transparent", border: "none", borderBottom: tab === "live" ? "2px solid #ef4444" : "none", color: tab === "live" ? "#ef4444" : "#6b7280", padding: "16px 0", fontSize: 14, fontWeight: tab === "live" ? 600 : 400, cursor: "pointer", transition: "color 0.2s" }}>
          Live ({liveList.length})
        </button>
        <button onClick={() => setTab("reports")} style={{ background: "transparent", border: "none", borderBottom: tab === "reports" ? "2px solid #34d399" : "none", color: tab === "reports" ? "#34d399" : "#6b7280", padding: "16px 0", fontSize: 14, fontWeight: tab === "reports" ? 600 : 400, cursor: "pointer", transition: "color 0.2s" }}>
          Reports
        </button>
        <button onClick={() => setTab("ads")} style={{ background: "transparent", border: "none", borderBottom: tab === "ads" ? "2px solid #f59e0b" : "none", color: tab === "ads" ? "#f59e0b" : "#6b7280", padding: "16px 0", fontSize: 14, fontWeight: tab === "ads" ? 600 : 400, cursor: "pointer", transition: "color 0.2s" }}>
          Ads {adList.length > 0 && `(${adList.length})`}
        </button>
        <button onClick={() => setTab("subscriptions")} style={{ background: "transparent", border: "none", borderBottom: tab === "subscriptions" ? "2px solid #818cf8" : "none", color: tab === "subscriptions" ? "#818cf8" : "#6b7280", padding: "16px 0", fontSize: 14, fontWeight: tab === "subscriptions" ? 600 : 400, cursor: "pointer", transition: "color 0.2s" }}>
          Subscriptions {subs.length > 0 && `(${subs.length})`}
        </button>
        <button onClick={() => setTab("boss")} style={{ background: "transparent", border: "none", borderBottom: tab === "boss" ? "2px solid #facc15" : "none", color: tab === "boss" ? "#facc15" : "#6b7280", padding: "16px 0", fontSize: 14, fontWeight: tab === "boss" ? 600 : 400, cursor: "pointer", transition: "color 0.2s" }}>
          The Boss
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
              { key: "music", label: "Music Videos", count: musicVideosList.length },
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
        {tab === "live" && !livePasscodeEntered && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 400 }}>
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "48px 40px", width: 360, textAlign: "center", boxShadow: "0 8px 32px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize: 36, marginBottom: 16 }}>🔒</div>
              <h2 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Live TV</h2>
              <p style={{ margin: "0 0 24px", fontSize: 13, color: "#6b7280" }}>Enter the passcode to access Live settings</p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={livePasscodeInput}
                onChange={e => setLivePasscodeInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { if (livePasscodeInput === "1234") { setLivePasscodeEntered(true); sessionStorage.setItem("cms_live_unlocked", "1"); } else { setLivePasscodeInput(""); showToast("Incorrect passcode", "error"); } } }}
                placeholder="····"
                autoFocus
                style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", fontSize: 24, textAlign: "center", letterSpacing: 8, outline: "none", marginBottom: 12, boxSizing: "border-box" }}
              />
              <button
                onClick={() => { if (livePasscodeInput === "1234") { setLivePasscodeEntered(true); sessionStorage.setItem("cms_live_unlocked", "1"); } else { setLivePasscodeInput(""); showToast("Incorrect passcode", "error"); } }}
                style={{ width: "100%", background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Unlock
              </button>
            </div>
          </div>
        )}
        {tab === "live" && livePasscodeEntered && (
          <div>
            {/* Header row with Add button */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600, color: "#0f172a" }}>All Streams ({liveList.length})</h2>
                <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Toggle a stream to Live to show it on the homepage "Live Now" section.</p>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {testingChannels && (
                  <span style={{ fontSize: 12, color: "#6b7280" }}>Testing {testProgress.done}/{testProgress.total}…</span>
                )}
                {Object.keys(channelStatuses).length > 0 && !testingChannels && (
                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                    ✓ {Object.values(channelStatuses).filter(s => s === "ok").length} working &nbsp;
                    ✗ {Object.values(channelStatuses).filter(s => s === "error").length} failed
                  </span>
                )}
                <button onClick={testAllChannels} disabled={testingChannels || liveList.length === 0}
                  style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 14px", color: "#374151", fontSize: 13, fontWeight: 600, cursor: testingChannels ? "wait" : "pointer", opacity: testingChannels ? 0.6 : 1 }}>
                  {testingChannels ? "Testing…" : "🔍 Test Channels"}
                </button>
                <button
                  onClick={() => { setM3uOpen(true); setM3uUrl(""); setM3uChannels([]); setM3uSelected(new Set()); setM3uError(""); setM3uSearch(""); setM3uPage(0); setM3uImportDone(null); }}
                  style={{ background: "#0f172a", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                >
                  📋 Import Playlist
                </button>
                <button
                  onClick={() => { setLiveForm(EMPTY_LIVE_STREAM); setEditingLiveId(null); setDrawerOpen(true); }}
                  style={{ background: "#ef4444", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                >
                  + Add Stream
                </button>
              </div>
            </div>

            {/* ── Imported Playlists ── */}
            {(() => {
              const sources = {};
              liveList.forEach(s => { if (s.playlist_source) { sources[s.playlist_source] = (sources[s.playlist_source] || 0) + 1; } });
              const entries = Object.entries(sources);
              if (entries.length === 0) return null;
              return (
                <div style={{ marginBottom: 20, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ padding: "10px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: 0.6 }}>Imported Playlists</span>
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>{entries.length} source{entries.length !== 1 ? "s" : ""}</span>
                  </div>
                  {entries.map(([src, count]) => (
                    <div key={src} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: "1px solid #f1f5f9" }}>
                      <span style={{ fontSize: 11, color: "#6366f1" }}>📋</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: "#0f172a", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{src}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af" }}>{count} channel{count !== 1 ? "s" : ""}</div>
                      </div>
                      <button onClick={() => setDeletePlaylistConfirm({ src, count })}
                        style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.15)", borderRadius: 6, padding: "5px 12px", color: "#dc2626", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                        Delete all {count}
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}

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
                <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                  {channelStatuses[s.id] === "testing" && <span style={{ fontSize: 11, color: "#6b7280" }}>Testing…</span>}
                  {channelStatuses[s.id] === "ok" && <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>✓ Working</span>}
                  {channelStatuses[s.id] === "error" && <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 600 }}>✗ Failed</span>}
                  <button onClick={() => setHero(s)} title={s.is_hero ? "Remove from hero" : "Set as hero"}
                    style={{ background: s.is_hero ? "rgba(250,204,21,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${s.is_hero ? "rgba(250,204,21,0.5)" : "#e2e8f0"}`, borderRadius: 5, padding: "5px 10px", color: s.is_hero ? "#ca8a04" : "#9ca3af", fontSize: 13, cursor: "pointer", lineHeight: 1 }}>
                    {s.is_hero ? "★" : "☆"}
                  </button>
                  <button onClick={() => toggleLive(s)}
                    style={{ background: s.is_live ? "rgba(107,114,128,0.1)" : "rgba(34,197,94,0.1)", border: `1px solid ${s.is_live ? "rgba(107,114,128,0.2)" : "rgba(34,197,94,0.3)"}`, borderRadius: 5, padding: "5px 10px", color: s.is_live ? "#9ca3af" : "#22c55e", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    {s.is_live ? "Go Offline" : "Go Live"}
                  </button>
                  <button onClick={() => startLiveEdit(s)} style={{ background: "rgba(79,70,229,0.08)", border: "1px solid rgba(79,70,229,0.2)", borderRadius: 5, padding: "5px 10px", color: "#4f46e5", fontSize: 11, cursor: "pointer" }}>Edit</button>
<button onClick={() => setDeleteLiveConfirm(s)} style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.15)", borderRadius: 5, padding: "5px 10px", color: "#dc2626", fontSize: 11, cursor: "pointer" }}>Delete</button>
                </div>
              </div>
            ))}

            {/* ── M3U Import Modal ── */}
            {m3uOpen && (
              <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 780, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.2)", overflow: "hidden" }}>

                  {/* Header */}
                  <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 20 }}>📋</span>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Import from Playlist</h2>
                      <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Paste an .m3u or .m3u8 playlist URL to bulk-import channels</p>
                    </div>
                    <button onClick={() => setM3uOpen(false)} style={{ marginLeft: "auto", background: "transparent", border: "none", fontSize: 20, color: "#9ca3af", cursor: "pointer", lineHeight: 1 }}>✕</button>
                  </div>

                  {/* URL input */}
                  <div style={{ padding: "16px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: 10 }}>
                    <input
                      value={m3uUrl} onChange={e => setM3uUrl(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && !m3uFetching && fetchM3UPlaylist()}
                      placeholder="https://example.com/playlist.m3u"
                      style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#0f172a", outline: "none" }}
                    />
                    <button onClick={fetchM3UPlaylist} disabled={m3uFetching || !m3uUrl.trim()}
                      style={{ background: "#0f172a", border: "none", borderRadius: 8, padding: "10px 20px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: m3uFetching ? "wait" : "pointer", opacity: !m3uUrl.trim() ? 0.5 : 1 }}>
                      {m3uFetching ? "Fetching…" : "Fetch"}
                    </button>
                  </div>

                  {/* Error */}
                  {m3uError && <div style={{ padding: "12px 24px", background: "#fef2f2", borderBottom: "1px solid #fecaca", color: "#dc2626", fontSize: 13 }}>{m3uError}</div>}

                  {/* Channel list */}
                  {m3uChannels.length > 0 && (() => {
                    const PAGE_SIZE = 50;
                    const filtered = m3uChannels.filter(ch => !m3uSearch || ch.name.toLowerCase().includes(m3uSearch.toLowerCase()) || ch.group.toLowerCase().includes(m3uSearch.toLowerCase()));
                    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
                    const paginated = filtered.slice(m3uPage * PAGE_SIZE, (m3uPage + 1) * PAGE_SIZE);
                    const selectedCount = [...m3uSelected].filter(i => !m3uChannels[i]?.duplicate).length;
                    const allOnPageSelected = paginated.every(ch => {
                      const idx = m3uChannels.indexOf(ch);
                      return ch.duplicate || m3uSelected.has(idx);
                    });
                    return (
                      <>
                        {/* Toolbar */}
                        <div style={{ padding: "10px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 10, background: "#f8fafc" }}>
                          <input value={m3uSearch} onChange={e => { setM3uSearch(e.target.value); setM3uPage(0); }}
                            placeholder="Search channels…"
                            style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px 12px", fontSize: 12, outline: "none" }} />
                          <span style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>{filtered.length} channel{filtered.length !== 1 ? "s" : ""}</span>
                          <button onClick={() => {
                            const newSel = new Set(m3uSelected);
                            paginated.forEach(ch => { const idx = m3uChannels.indexOf(ch); if (!ch.duplicate) { if (allOnPageSelected) newSel.delete(idx); else newSel.add(idx); } });
                            setM3uSelected(newSel);
                          }} style={{ background: "transparent", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 12px", fontSize: 12, color: "#374151", cursor: "pointer", whiteSpace: "nowrap" }}>
                            {allOnPageSelected ? "Deselect page" : "Select page"}
                          </button>
                          <button onClick={() => {
                            const allNonDupe = new Set(m3uChannels.map((ch, i) => ch.duplicate ? null : i).filter(i => i !== null));
                            const allSelected = allNonDupe.size === m3uSelected.size;
                            setM3uSelected(allSelected ? new Set() : allNonDupe);
                          }} style={{ background: "transparent", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 12px", fontSize: 12, color: "#374151", cursor: "pointer", whiteSpace: "nowrap" }}>
                            Select all ({m3uChannels.filter(ch => !ch.duplicate).length})
                          </button>
                        </div>

                        {/* Rows */}
                        <div style={{ flex: 1, overflowY: "auto" }}>
                          {paginated.map((ch) => {
                            const idx = m3uChannels.indexOf(ch);
                            const checked = m3uSelected.has(idx);
                            return (
                              <div key={idx} onClick={() => { if (ch.duplicate) return; const s = new Set(m3uSelected); checked ? s.delete(idx) : s.add(idx); setM3uSelected(s); }}
                                style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 24px", borderBottom: "1px solid #f8fafc", background: ch.duplicate ? "#f8fafc" : checked ? "#f0fdf4" : "#fff", cursor: ch.duplicate ? "default" : "pointer" }}>
                                <input type="checkbox" checked={checked} readOnly disabled={ch.duplicate} style={{ width: 15, height: 15, flexShrink: 0, accentColor: "#22c55e" }} />
                                {ch.logo ? (
                                  <img src={ch.logo} alt="" style={{ width: 36, height: 24, objectFit: "contain", borderRadius: 3, flexShrink: 0, background: "#f1f5f9" }} onError={e => { e.target.style.display = "none"; }} />
                                ) : (
                                  <div style={{ width: 36, height: 24, background: "#e2e8f0", borderRadius: 3, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#94a3b8" }}>CH</div>
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: ch.duplicate ? "#9ca3af" : "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.name}</div>
                                  <div style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.url}</div>
                                </div>
                                {ch.group && <span style={{ fontSize: 11, color: "#6366f1", background: "#eef2ff", borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap", flexShrink: 0 }}>{ch.group}</span>}
                                {ch.duplicate && <span style={{ fontSize: 11, color: "#f59e0b", background: "#fefce8", border: "1px solid #fde68a", borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap", flexShrink: 0 }}>Already exists</span>}
                              </div>
                            );
                          })}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                          <div style={{ padding: "10px 24px", borderTop: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 8, background: "#f8fafc" }}>
                            <button onClick={() => setM3uPage(p => Math.max(0, p - 1))} disabled={m3uPage === 0} style={{ background: "transparent", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", opacity: m3uPage === 0 ? 0.4 : 1 }}>← Prev</button>
                            <span style={{ fontSize: 12, color: "#6b7280" }}>Page {m3uPage + 1} of {totalPages}</span>
                            <button onClick={() => setM3uPage(p => Math.min(totalPages - 1, p + 1))} disabled={m3uPage === totalPages - 1} style={{ background: "transparent", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", opacity: m3uPage === totalPages - 1 ? 0.4 : 1 }}>Next →</button>
                            <span style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>Showing {m3uPage * PAGE_SIZE + 1}–{Math.min((m3uPage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
                          </div>
                        )}

                        {/* Footer */}
                        <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 12, background: "#fff" }}>
                          {m3uImportDone != null
                            ? <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>✓ Imported {m3uImportDone} channel{m3uImportDone !== 1 ? "s" : ""} successfully</span>
                            : <span style={{ fontSize: 13, color: "#6b7280" }}>{selectedCount} channel{selectedCount !== 1 ? "s" : ""} selected</span>}
                          <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                            <button onClick={() => setM3uOpen(false)} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 18px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Close</button>
                            <button onClick={importM3USelected} disabled={m3uImporting || selectedCount === 0}
                              style={{ background: "#22c55e", border: "none", borderRadius: 8, padding: "10px 22px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: selectedCount === 0 ? "not-allowed" : "pointer", opacity: selectedCount === 0 ? 0.5 : 1 }}>
                              {m3uImporting ? "Importing…" : `Import ${selectedCount > 0 ? selectedCount : ""} Selected`}
                            </button>
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  {/* Empty state before fetch */}
                  {!m3uFetching && m3uChannels.length === 0 && !m3uError && (
                    <div style={{ padding: 48, textAlign: "center", color: "#9ca3af", fontSize: 13 }}>
                      Paste a playlist URL above and click Fetch to preview channels
                    </div>
                  )}
                  {m3uFetching && (
                    <div style={{ padding: 48, textAlign: "center", color: "#6b7280", fontSize: 13 }}>Fetching playlist…</div>
                  )}
                </div>
              </div>
            )}

            {deletePlaylistConfirm && (
              <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "36px 40px", width: 460, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
                  <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "#0f172a" }}>Delete entire playlist?</p>
                  <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>This will permanently delete all <strong>{deletePlaylistConfirm.count} channels</strong> imported from:</p>
                  <p style={{ fontSize: 11, color: "#6366f1", background: "#eef2ff", borderRadius: 6, padding: "8px 12px", marginBottom: 20, wordBreak: "break-all" }}>{deletePlaylistConfirm.src}</p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setDeletePlaylistConfirm(null)} style={{ flex: 1, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "11px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    <button onClick={() => deletePlaylistSource(deletePlaylistConfirm.src)} disabled={deletingPlaylist}
                      style={{ flex: 1, background: "#dc2626", border: "none", borderRadius: 7, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      {deletingPlaylist ? "Deleting…" : `Delete all ${deletePlaylistConfirm.count}`}
                    </button>
                  </div>
                </div>
              </div>
            )}

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
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Channel Schedule</h2>
                    <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>Build each channel's EPG guide</p>
                  </div>
                  <button
                    onClick={() => { setXmltvOpen(true); setXmltvParsed(null); setXmltvChannelMap({}); setXmltvError(""); setXmltvImportDone(null); setXmltvUrl(""); setXmltvFileName(""); setXmltvRawText(""); setXmltvRawOpen(false); }}
                    style={{ background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}>
                    📡 Import XMLTV
                  </button>
                </div>

                {/* Two-column layout */}
                <div style={{ display: "flex", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden", minHeight: 500, background: "#fff" }}>

                  {/* ── Left: channel sidebar ── */}
                  <div style={{ width: 220, borderRight: "1px solid #e2e8f0", background: "#f8fafc", flexShrink: 0, display: "flex", flexDirection: "column" }}>
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0" }}>
                      <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8 }}>Channels ({liveList.length})</p>
                    </div>
                    <div style={{ flex: 1, overflowY: "auto" }}>
                      {liveList.map(ch => {
                        const src = epgSources[ch.id];
                        const isSel = selectedChannelForEpg?.id === ch.id;
                        return (
                          <button key={ch.id}
                            onClick={() => { setSelectedChannelForEpg(ch); setEpgDayOffset(0); loadEpgEntries(ch.id, 0); loadContentForEpg(); }}
                            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 16px", background: isSel ? "#fff" : "transparent", border: "none", borderBottom: "1px solid #f1f5f9", borderLeft: `3px solid ${isSel ? "#4f46e5" : "transparent"}`, cursor: "pointer", textAlign: "left" }}>
                            {ch.channel_number != null && ch.channel_number !== "" && (
                              <div style={{ width: 26, height: 26, borderRadius: 6, background: isSel ? "#4f46e5" : "#e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                <span style={{ fontSize: 10, fontWeight: 700, color: isSel ? "#fff" : "#6b7280" }}>{ch.channel_number}</span>
                              </div>
                            )}
                            <span style={{ fontSize: 13, fontWeight: isSel ? 600 : 400, color: isSel ? "#0f172a" : "#64748b", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.title}</span>
                            {src && <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} title={src.source_name} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ── Right: schedule panel ── */}
                  <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                    {!selectedChannelForEpg ? (
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 48, color: "#9ca3af", textAlign: "center" }}>
                        <div style={{ fontSize: 36, marginBottom: 12 }}>📺</div>
                        <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600, color: "#374151" }}>Select a channel</p>
                        <p style={{ margin: 0, fontSize: 13 }}>Pick a channel from the left to manage its schedule</p>
                      </div>
                    ) : (
                      <>
                        {/* Channel header */}
                        <div style={{ padding: "12px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                            {selectedChannelForEpg.channel_number != null && selectedChannelForEpg.channel_number !== "" && (
                              <span style={{ background: "#4f46e5", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 5, flexShrink: 0 }}>CH {selectedChannelForEpg.channel_number}</span>
                            )}
                            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedChannelForEpg.title}</h3>
                            {(() => {
                              const src = epgSources[selectedChannelForEpg.id];
                              return src ? (
                                <button
                                  onClick={async () => {
                                    setEpgSourceXmlLoading(true);
                                    const { data } = await supabase.from("epg_channel_sources").select("source_name, xml_content").eq("channel_id", selectedChannelForEpg.id).single();
                                    setEpgSourceXmlModal(data || { source_name: src.source_name, xml_content: null });
                                    setEpgSourceXmlLoading(false);
                                  }}
                                  style={{ display: "flex", alignItems: "center", gap: 5, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 20, padding: "3px 10px 3px 8px", fontSize: 11, fontWeight: 600, color: "#15803d", cursor: "pointer", flexShrink: 0, maxWidth: 200 }}>
                                  <span>📄</span>
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{epgSourceXmlLoading ? "Loading…" : src.source_name}</span>
                                </button>
                              ) : null;
                            })()}
                          </div>
                          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                            <button
                              onClick={async () => {
                                await Promise.all([loadEpgEntries(selectedChannelForEpg.id, epgDayOffset), loadLiveStreams()]);
                                const { count } = await supabase.from("epg_entries").select("id", { count: "exact", head: true }).eq("channel_id", selectedChannelForEpg.id);
                                if (count === 0) {
                                  await supabase.from("epg_channel_sources").delete().eq("channel_id", selectedChannelForEpg.id);
                                  setEpgSources(prev => { const u = { ...prev }; delete u[selectedChannelForEpg.id]; return u; });
                                }
                              }}
                              title="Refresh"
                              style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "6px 10px", fontSize: 14, color: "#64748b", cursor: "pointer" }}>↺</button>
                            <button onClick={startBulkSchedule}
                              style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer" }}>⚡ Auto-Schedule</button>
                            <button onClick={startEpgAdd}
                              style={{ background: "#4f46e5", border: "none", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer" }}>+ Add Program</button>
                          </div>
                        </div>

                        {/* Day tabs */}
                        <div style={{ padding: "10px 18px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: 4 }}>
                          {[0, 1, 2].map(offset => {
                            const d = new Date(); d.setDate(d.getDate() + offset);
                            const label = offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                            return (
                              <button key={offset}
                                onClick={() => { setEpgDayOffset(offset); loadEpgEntries(selectedChannelForEpg.id, offset); }}
                                style={{ background: epgDayOffset === offset ? "#0f172a" : "transparent", border: `1px solid ${epgDayOffset === offset ? "#0f172a" : "transparent"}`, borderRadius: 6, padding: "5px 14px", color: epgDayOffset === offset ? "#fff" : "#6b7280", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
                                {label}
                              </button>
                            );
                          })}
                        </div>

                        {/* Program list */}
                        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
                          {epgLoading ? (
                            <div style={{ color: "#6b7280", padding: "60px 0", textAlign: "center", fontSize: 13 }}>Loading schedule…</div>
                          ) : epgEntries.length === 0 ? (
                            <div style={{ padding: "48px 20px", textAlign: "center" }}>
                              <div style={{ fontSize: 36, marginBottom: 12 }}>📅</div>
                              <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 600, color: "#374151" }}>No programs yet</p>
                              <p style={{ margin: "0 0 20px", fontSize: 13, color: "#9ca3af" }}>Import an XML file to auto-fill this channel's guide, or add programs manually.</p>
                              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                                <button
                                  onClick={() => { setXmltvOpen(true); setXmltvParsed(null); setXmltvChannelMap({}); setXmltvError(""); setXmltvImportDone(null); setXmltvUrl(""); setXmltvFileName(""); setXmltvRawText(""); setXmltvRawOpen(false); }}
                                  style={{ background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                                  📡 Import XMLTV
                                </button>
                                <button onClick={startEpgAdd}
                                  style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer" }}>
                                  + Add Program
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              {epgEntries.map(entry => {
                                const start = new Date(entry.start_time);
                                const end = new Date(entry.end_time);
                                const durationMins = Math.round((end - start) / 60000);
                                const isNow = start <= new Date() && end > new Date();
                                return (
                                  <div key={entry.id}
                                    onClick={() => setEpgDetailEntry(entry)}
                                    style={{ background: isNow ? "rgba(79,70,229,0.04)" : "#fff", border: `1px solid ${isNow ? "rgba(79,70,229,0.3)" : "#e2e8f0"}`, borderRadius: 10, padding: "12px 16px", marginBottom: 8, display: "flex", gap: 12, alignItems: "center", cursor: "pointer", transition: "box-shadow 0.15s" }}
                                    onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.06)"}
                                    onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
                                    {entry.thumbnail && (
                                      <img src={entry.thumbnail} alt="" style={{ width: 64, height: 36, objectFit: "cover", borderRadius: 5, flexShrink: 0 }} onError={e => e.target.style.display = "none"} />
                                    )}
                                    <div style={{ flexShrink: 0, minWidth: 60, textAlign: "right" }}>
                                      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</p>
                                      <p style={{ margin: "1px 0 0", fontSize: 11, color: "#9ca3af" }}>{durationMins}m</p>
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                        {isNow && <span style={{ background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 700, padding: "2px 5px", borderRadius: 3, letterSpacing: 0.5 }}>ON AIR</span>}
                                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.title}</p>
                                      </div>
                                      {entry.description && <p style={{ margin: 0, fontSize: 12, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.description}</p>}
                                    </div>
                                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                      <button onClick={e => { e.stopPropagation(); startEpgEdit(entry); }} style={{ background: "rgba(79,70,229,0.08)", border: "1px solid rgba(79,70,229,0.2)", borderRadius: 5, padding: "4px 10px", color: "#4f46e5", fontSize: 11, cursor: "pointer" }}>Edit</button>
                                      <button onClick={e => { e.stopPropagation(); setDeleteEpgConfirm(entry); }} style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.15)", borderRadius: 5, padding: "4px 10px", color: "#dc2626", fontSize: 11, cursor: "pointer" }}>Remove</button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

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

        {/* ────── MUSIC VIDEOS TAB ────── */}
        {tab === "videos" && videoSubTab === "music" && (
          <>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Music Videos ({musicVideosList.length})</h2>
                <button
                  onClick={() => { setMusicVideoForm(EMPTY_MUSIC_VIDEO); setEditingMusicVideoId(null); setDrawerOpen(true); }}
                  style={{ background: "#4f46e5", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                >
                  + Add Music Video
                </button>
              </div>

              {musicVideosLoading ? (
                <div style={{ color: "#6b7280", padding: 40, textAlign: "center" }}>Loading...</div>
              ) : musicVideosList.length === 0 ? (
                <div style={{ padding: 32, textAlign: "center", border: "1px dashed #e2e8f0", borderRadius: 10 }}>
                  <p style={{ color: "#6b7280", margin: 0, fontSize: 14 }}>No music videos yet. Add one using the button above.</p>
                </div>
              ) : musicVideosList.map(mv => (
                <div key={mv.id} style={{ background: "#ffffff", border: `1px solid ${editingMusicVideoId === mv.id ? "#4f46e5" : "#e2e8f0"}`, borderRadius: 10, padding: "12px 14px", marginBottom: 10, display: "flex", gap: 12, alignItems: "center", borderLeft: `3px solid ${editingMusicVideoId === mv.id ? "#4f46e5" : "transparent"}` }}>
                  {(mv.thumbnail || mv.poster) ? (
                    <img src={mv.thumbnail || mv.poster} alt={mv.title} style={{ width: 72, height: 40, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} onError={e => { e.target.style.display = "none"; }} />
                  ) : (
                    <div style={{ width: 72, height: 40, borderRadius: 6, background: "linear-gradient(135deg, #e0e7ff, #c7d2fe)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{mv.artist} — {mv.title}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
                      {mv.duration && <span>{mv.duration}</span>}
                      {mv.duration && mv.year && " · "}
                      {mv.year && <span>{mv.year}</span>}
                      {(mv.duration || mv.year) && " · "}
                      <span style={{ color: mv.enabled ? "#4ade80" : "#f87171" }}>{mv.enabled ? "Enabled" : "Disabled"}</span>
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button onClick={() => startMusicVideoEdit(mv)} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 5, padding: "5px 10px", color: "#374151", fontSize: 11, cursor: "pointer" }}>Edit</button>
                    <button onClick={() => setDeleteMusicVideoConfirm(mv)} style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 5, padding: "5px 10px", color: "#f87171", fontSize: 11, cursor: "pointer" }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>

            {deleteMusicVideoConfirm && (
              <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "36px 40px", width: 400, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
                  <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "#0f172a" }}>Delete "{deleteMusicVideoConfirm.artist} — {deleteMusicVideoConfirm.title}"?</p>
                  <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 28 }}>This music video will be permanently removed.</p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setDeleteMusicVideoConfirm(null)} style={{ flex: 1, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "11px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    <button onClick={() => deleteMusicVideo(deleteMusicVideoConfirm.id)} style={{ flex: 1, background: "#dc2626", border: "none", borderRadius: 7, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ────── ADS TAB ────── */}
        {tab === "ads" && (
          <div>

            {/* ── Ad Performance ── */}
            {adAnalytics && (
              <div style={{ marginBottom: 36 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 18 }}>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Ad Performance <span style={{ fontSize: 12, fontWeight: 400, color: "#9ca3af" }}>last 30 days</span></h2>
                  {adLastFetched && <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: "auto" }}>Updated {adLastFetched.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>}
                  <button onClick={loadAdAnalytics} style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 6, padding: "5px 12px", color: "#6366f1", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Refresh</button>
                </div>

                {/* Today row */}
                {todayStats && (
                  <div style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)", borderRadius: 12, padding: "16px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 32, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#a5f3fc", display: "inline-block", animation: "adpulse 1.5s ease-in-out infinite" }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#c7d2fe", textTransform: "uppercase", letterSpacing: 0.8 }}>Today</span>
                      <span style={{ fontSize: 11, color: "#6366f1" }}>{new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    </div>
                    {[
                      { label: "Impressions", value: todayStats.adImpressionsToday },
                      { label: "Skips", value: todayStats.adSkipsToday },
                      { label: "Completion", value: todayStats.adImpressionsToday > 0 ? Math.round(((todayStats.adImpressionsToday - todayStats.adSkipsToday) / todayStats.adImpressionsToday) * 100) + "%" : "—" },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div style={{ fontSize: 10, color: "#818cf8", textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>{value}</div>
                      </div>
                    ))}
                    <style>{`@keyframes adpulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.4;transform:scale(1.3);}}`}</style>
                  </div>
                )}

                {/* Summary cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 28 }}>
                  {[
                    { label: "Impressions", value: adAnalytics.impressions.toLocaleString(), color: "#6366f1", hint: "How many times an ad started playing" },
                    { label: "Unique Viewers", value: adAnalytics.uniqueViewers.toLocaleString(), color: "#8b5cf6", hint: "Distinct logged-in users who saw at least one ad" },
                    { label: "Skips", value: adAnalytics.skips.toLocaleString(), color: "#64748b", hint: "How many viewers skipped the ad before it finished" },
                    { label: "Completion Rate", value: adAnalytics.completionRate !== null ? adAnalytics.completionRate + "%" : "—", color: "#22c55e", hint: "% of viewers who watched the full ad without skipping. 70%+ is good." },
                    { label: "Fill Rate", value: adAnalytics.fillRate !== null ? adAnalytics.fillRate + "%" : "—", color: "#f59e0b", hint: "How often the ad server had an ad ready. Dropping fill rate means your tag may be broken or inventory is low." },
                  ].map(({ label, value, color, hint }) => (
                    <div key={label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                      <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 6 }}>{label}</div>
                      <div style={{ fontSize: 28, fontWeight: 700, color, marginBottom: 8 }}>{value}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{hint}</div>
                    </div>
                  ))}
                </div>

                {/* Daily impressions chart */}
                {(() => {
                  const max = Math.max(...adAnalytics.dailyData.map(d => d.count), 1);
                  return (
                    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 28, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 16 }}>Impressions / Day (last 14 days)</div>
                      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
                        {adAnalytics.dailyData.map(({ date, count }) => (
                          <div key={date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                            <div title={`${date}: ${count}`} style={{ width: "100%", background: count > 0 ? "#6366f1" : "#e2e8f0", borderRadius: "3px 3px 0 0", height: Math.max(count / max * 68, count > 0 ? 4 : 2), transition: "height 0.3s" }} />
                            <div style={{ fontSize: 10, color: "#374151", transform: "rotate(-45deg)", transformOrigin: "top center", whiteSpace: "nowrap", fontWeight: 500 }}>
                              {new Date(date + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Per-tag breakdown */}
                {adList.length > 0 && Object.keys(adAnalytics.tagStats).length > 0 && (
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", marginBottom: 28, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                          {["Tag", "Impressions", "Completions", "Skips", "Completion %"].map(h => (
                            <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#6b7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.7 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {adList.map((ad, i) => {
                          const s = adAnalytics.tagStats[ad.id];
                          if (!s) return null;
                          const pct = s.impressions > 0 ? Math.round(s.completes / s.impressions * 100) : null;
                          return (
                            <tr key={ad.id} style={{ borderBottom: i < adList.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                              <td style={{ padding: "11px 16px", fontWeight: 600, color: "#0f172a" }}>{ad.name}</td>
                              <td style={{ padding: "11px 16px", color: "#6366f1", fontWeight: 600 }}>{s.impressions.toLocaleString()}</td>
                              <td style={{ padding: "11px 16px", color: "#374151" }}>{s.completes.toLocaleString()}</td>
                              <td style={{ padding: "11px 16px", color: "#374151" }}>{s.skips.toLocaleString()}</td>
                              <td style={{ padding: "11px 16px" }}>
                                {pct !== null ? (
                                  <span style={{ background: pct >= 70 ? "rgba(34,197,94,0.1)" : pct >= 40 ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)", color: pct >= 70 ? "#15803d" : pct >= 40 ? "#92400e" : "#dc2626", borderRadius: 5, padding: "2px 8px", fontWeight: 600 }}>{pct}%</span>
                                ) : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>VAST Ad Tags</h2>
              {!adTableMissing && (
                <button onClick={() => { setEditingAdId(null); setAdForm(EMPTY_AD); setDrawerOpen(true); }}
                  style={{ marginLeft: "auto", background: "#f59e0b", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  + Add Tag
                </button>
              )}
            </div>

            {/* SQL setup callout */}
            {adTableMissing && (
              <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 12, padding: "20px 24px", marginBottom: 24 }}>
                <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "#92400e" }}>Table setup required</p>
                <p style={{ margin: "0 0 14px", fontSize: 13, color: "#78350f" }}>Run this SQL once in your Supabase dashboard (SQL Editor) to enable ad tag management:</p>
                <pre style={{ margin: 0, background: "#1e293b", color: "#e2e8f0", borderRadius: 8, padding: "16px 18px", fontSize: 12, overflowX: "auto", lineHeight: 1.6 }}>{`create table vast_tags (
  id bigserial primary key,
  name text not null,
  tag_url text not null,
  ad_type text not null default 'pre_roll',
  scope text not null default 'global',
  content_id bigint,
  active boolean not null default true,
  created_at timestamptz default now()
);`}</pre>
                <button onClick={loadAds} style={{ marginTop: 14, background: "#f59e0b", border: "none", borderRadius: 7, padding: "9px 18px", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Retry
                </button>
              </div>
            )}

            {adLoading && <div style={{ display: "flex", justifyContent: "center", padding: 80 }}><Spinner /></div>}

            {!adLoading && !adTableMissing && adList.length === 0 && (
              <div style={{ textAlign: "center", padding: 80, color: "#9ca3af" }}>
                <p style={{ margin: "0 0 6px", fontSize: 16 }}>No ad tags yet</p>
                <p style={{ margin: 0, fontSize: 13 }}>Add a VAST tag URL to start serving ads</p>
              </div>
            )}

            {!adLoading && !adTableMissing && adList.length > 0 && (() => {
              const AD_TYPE_LABELS = { pre_roll: "Pre-roll", mid_roll: "Mid-roll", post_roll: "Post-roll" };
              const SCOPE_LABELS = { global: "All content", movie: "Movies", show: "TV Shows", episode: "Episodes", podcast_episode: "Podcasts" };
              const AD_TYPE_COLORS = { pre_roll: "#6366f1", mid_roll: "#f59e0b", post_roll: "#ec4899" };
              return (
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
                        {["Active", "Name", "Type", "Scope", "VAST Tag URL", ""].map(h => (
                          <th key={h} style={{ padding: "11px 16px", textAlign: "left", color: "#6b7280", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.7, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {adList.map((ad, i) => (
                        <tr key={ad.id} style={{ borderBottom: i < adList.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                          <td style={{ padding: "12px 16px" }}>
                            <button onClick={() => toggleAdActive(ad)}
                              style={{ width: 36, height: 20, borderRadius: 10, border: "none", background: ad.active ? "#22c55e" : "#d1d5db", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                              <span style={{ position: "absolute", top: 2, left: ad.active ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", display: "block" }} />
                            </button>
                          </td>
                          <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0f172a" }}>{ad.name}</td>
                          <td style={{ padding: "12px 16px" }}>
                            <span style={{ background: `${AD_TYPE_COLORS[ad.ad_type] || "#94a3b8"}18`, border: `1px solid ${AD_TYPE_COLORS[ad.ad_type] || "#94a3b8"}40`, borderRadius: 5, padding: "2px 8px", color: AD_TYPE_COLORS[ad.ad_type] || "#94a3b8", fontSize: 11, fontWeight: 600 }}>
                              {AD_TYPE_LABELS[ad.ad_type] || ad.ad_type}
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px", color: "#6b7280" }}>
                            {SCOPE_LABELS[ad.scope] || ad.scope}{ad.content_id ? ` #${ad.content_id}` : ""}
                          </td>
                          <td style={{ padding: "12px 16px", color: "#6b7280", maxWidth: 320 }}>
                            <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: 12 }} title={ad.tag_url}>{ad.tag_url}</span>
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => startAdEdit(ad)} style={{ background: "rgba(79,70,229,0.07)", border: "1px solid rgba(79,70,229,0.2)", borderRadius: 6, padding: "5px 12px", color: "#4f46e5", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Edit</button>
                              <button onClick={() => setDeleteAdConfirm(ad)} style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.15)", borderRadius: 6, padding: "5px 12px", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}

            {/* Delete confirm */}
            {deleteAdConfirm && (
              <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: "#fff", borderRadius: 14, padding: "36px 40px", width: 400, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.15)" }}>
                  <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "#0f172a" }}>Delete ad tag?</p>
                  <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 28 }}>"{deleteAdConfirm.name}"</p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setDeleteAdConfirm(null)} style={{ flex: 1, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "11px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    <button onClick={() => deleteAd(deleteAdConfirm.id)} style={{ flex: 1, background: "#dc2626", border: "none", borderRadius: 7, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                  </div>
                </div>
              </div>
            )}
          </div>
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
              {reportLastFetched && <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: "auto" }}>Updated {reportLastFetched.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>}
              <button onClick={() => { loadReports(); loadTodayStats(); loadOnlineUsers(); }} style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 7, padding: "8px 16px", color: "#34d399", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                Refresh
              </button>
            </div>

            {/* ── User Search ── */}
            <div style={{ marginBottom: 28, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 12 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input
                  type="text"
                  placeholder="Search users by email or username…"
                  value={userSearch}
                  onChange={e => { setUserSearch(e.target.value); searchUsers(e.target.value); }}
                  style={{ flex: 1, border: "none", outline: "none", fontSize: 14, color: "#0f172a", background: "transparent" }}
                />
                {userSearch && <button onClick={() => { setUserSearch(""); setUserSearchResults([]); setSelectedUserStats(null); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18, lineHeight: 1 }}>×</button>}
              </div>

              {userSearchResults.length > 0 && !selectedUserStats && (
                <div>
                  {userSearchResults.map(p => (
                    <div key={p.id} onClick={() => { loadSelectedUserStats(p); setUserSearchResults([]); }}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", cursor: "pointer", borderBottom: "1px solid #f8fafc" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#e0e7ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: "#4f46e5", flexShrink: 0 }}>
                        {(p.email || p.username || "?")[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{p.email || p.username}</div>
                        {p.username && p.email && <div style={{ fontSize: 11, color: "#9ca3af" }}>@{p.username}</div>}
                      </div>
                      {p.is_admin && <span style={{ fontSize: 10, background: "#ede9fe", color: "#7c3aed", borderRadius: 4, padding: "2px 7px", fontWeight: 700 }}>Admin</span>}
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>joined {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</span>
                    </div>
                  ))}
                </div>
              )}

              {userSearch && userSearchResults.length === 0 && !selectedUserStats && !userStatsLoading && (
                <div style={{ padding: "20px", fontSize: 13, color: "#9ca3af", textAlign: "center" }}>No users found</div>
              )}

              {userStatsLoading && (
                <div style={{ padding: 32, display: "flex", justifyContent: "center" }}><Spinner /></div>
              )}

              {selectedUserStats && (() => {
                const { profile, watchHistory, adHistory, myList, ratingRows, sessionTimeline } = selectedUserStats;
                const totalHours = +(watchHistory.reduce((s, w) => s + (w.progress_seconds || 0), 0) / 3600).toFixed(1);
                const completed = watchHistory.filter(w => w.completed).length;
                return (
                  <div>
                    <div style={{ background: "linear-gradient(135deg, #064e3b, #065f46)", padding: "16px 20px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(167,243,208,0.2)", border: "2px solid rgba(167,243,208,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#6ee7b7" }}>
                        {(profile.email || profile.username || "?")[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{profile.email || profile.username}</div>
                        <div style={{ fontSize: 11, color: "#6ee7b7" }}>Joined {new Date(profile.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>
                      </div>
                      <div style={{ marginLeft: "auto", display: "flex", gap: 20, flexWrap: "wrap" }}>
                        {[
                          { label: "Sessions", value: watchHistory.length },
                          { label: "Completed", value: completed },
                          { label: "Hours", value: totalHours + "h" },
                          { label: "Ratings", value: ratingRows.length },
                          { label: "My List", value: myList.length },
                          { label: "Ad Views", value: adHistory.filter(r => r.event === "impression").length },
                        ].map(({ label, value }) => (
                          <div key={label} style={{ textAlign: "center" }}>
                            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff" }}>{value}</div>
                            <div style={{ fontSize: 10, color: "#6ee7b7", textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 20 }}>
                      {sessionTimeline.length > 0 && (
                        <div>
                          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: 0.7 }}>Activity — Last 30 Days</p>
                          <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 40 }}>
                            {(() => { const max = Math.max(...sessionTimeline.map(([, c]) => c), 1); return sessionTimeline.map(([day, count]) => (
                              <div key={day} title={`${day}: ${count}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                                <div style={{ width: "100%", background: "rgba(16,185,129,0.5)", borderRadius: "2px 2px 0 0", height: `${Math.round((count / max) * 30) + 3}px` }} />
                                <span style={{ fontSize: 7, color: "#9ca3af" }}>{day.slice(5)}</span>
                              </div>
                            )); })()}
                          </div>
                        </div>
                      )}

                      {watchHistory.length > 0 && (
                        <div>
                          <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: 0.7 }}>Watch History ({watchHistory.length})</p>
                          <div style={{ display: "flex", flexDirection: "column", gap: 1, borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0" }}>
                            {watchHistory.slice(0, 15).map((w, i) => (
                              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: i % 2 === 0 ? "#f8fafc" : "#fff" }}>
                                <span style={{ fontSize: 10, color: "#9ca3af", width: 55, flexShrink: 0 }}>{typeLabel(w.content_type)}</span>
                                <span style={{ flex: 1, fontSize: 12, color: "#0f172a", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.title}</span>
                                {w.pct !== null && <div style={{ width: 70, height: 3, background: "#e2e8f0", borderRadius: 2, flexShrink: 0 }}><div style={{ height: "100%", width: `${Math.min(w.pct, 100)}%`, background: w.completed ? "#22c55e" : "#6366f1", borderRadius: 2 }} /></div>}
                                <span style={{ fontSize: 11, color: w.completed ? "#22c55e" : "#6b7280", width: 32, textAlign: "right", flexShrink: 0 }}>{w.pct !== null ? w.pct + "%" : "—"}</span>
                                <span style={{ fontSize: 10, color: "#9ca3af", width: 65, textAlign: "right", flexShrink: 0 }}>{w.last_watched_at ? new Date(w.last_watched_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
                              </div>
                            ))}
                            {watchHistory.length > 15 && <div style={{ padding: "6px 12px", fontSize: 11, color: "#9ca3af", background: "#f8fafc" }}>+{watchHistory.length - 15} more</div>}
                          </div>
                        </div>
                      )}

                      {watchHistory.length === 0 && <p style={{ margin: 0, fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "20px 0" }}>No watch activity yet</p>}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* ── Today at a Glance ── */}
            {todayStats && (() => {
              const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
              const stats = [
                { label: "Sessions Today", value: todayStats.sessionsToday.toLocaleString(), color: "#6366f1", hint: "Content plays recorded since midnight" },
                { label: "Hours Watched", value: todayStats.hoursToday > 0 ? todayStats.hoursToday + "h" : "<1h", color: "#f472b6", hint: "Sum of all watch progress saved today" },
                { label: "Ad Impressions", value: todayStats.adImpressionsToday.toLocaleString(), color: "#f59e0b", hint: "Ads that started playing today" },
                { label: "Ad Skips", value: todayStats.adSkipsToday.toLocaleString(), color: "#94a3b8", hint: "Ads that were skipped before completing" },
                { label: "New Signups", value: todayStats.newUsers.toLocaleString(), color: "#22c55e", hint: "New accounts created today" },
                { label: "Watching Live Now", value: todayStats.liveNow.toLocaleString(), color: "#ef4444", hint: "Active live viewers (last 90 sec heartbeat)", pulse: todayStats.liveNow > 0 },
                { label: "Users Online Now", value: onlineUsers.length.toLocaleString(), color: "#10b981", hint: "Browsing the app in the last 3 minutes", pulse: onlineUsers.length > 0 },
              ];
              return (
                <div style={{ marginBottom: 32 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 14 }}>
                    <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Today at a Glance</h3>
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>{today}</span>
                    <span style={{ fontSize: 10, color: "#d1fae5", background: "#065f46", borderRadius: 4, padding: "2px 7px", fontWeight: 600, marginLeft: 4 }}>LIVE · updates every min</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                    {stats.map(({ label, value, color, icon, hint, pulse }) => (
                      <div key={label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 18px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
                        <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8, display: "flex", alignItems: "center", gap: 5 }}>
                          {pulse && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "adpulse 1.5s ease-in-out infinite" }} />}
                          {label}
                        </div>
                        <div style={{ fontSize: 26, fontWeight: 700, color, marginBottom: 5 }}>{value}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.3 }}>{hint}</div>
                      </div>
                    ))}
                  </div>
                  <style>{`@keyframes adpulse { 0%,100%{opacity:1;transform:scale(1);}50%{opacity:0.4;transform:scale(1.3);} }`}</style>
                </div>
              );
            })()}

            {/* ── Online Now ── */}
            {(() => {
              const viewers = onlineUsers.filter(u => u.current_page !== "admin");
              const admins = onlineUsers.filter(u => u.current_page === "admin");
              const pageLabels = { home: "Home", movies: "Movies", series: "Series", podcasts: "Podcasts", live: "Live TV", "new-popular": "New & Popular", mylist: "My List", profile: "Profile", settings: "Settings" };
              const renderRow = (u, i, arr) => {
                const email = u.profile?.email || u.user_id;
                const username = u.profile?.username;
                const pageLabel = pageLabels[u.current_page] || u.current_page || "—";
                const secsAgo = Math.floor((Date.now() - new Date(u.last_seen).getTime()) / 1000);
                const agoLabel = secsAgo < 60 ? "just now" : `${Math.floor(secsAgo / 60)}m ago`;
                return (
                  <div key={u.user_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: i < arr.length - 1 ? "1px solid #f8fafc" : "none", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", fontWeight: 700, flexShrink: 0 }}>
                      {(username || email || "?")[0].toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{username || email}</div>
                      {username && <div style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</div>}
                    </div>
                    <div style={{ fontSize: 12, color: "#6366f1", background: "#eef2ff", borderRadius: 5, padding: "2px 8px", whiteSpace: "nowrap" }}>{pageLabel}</div>
                    <div style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>{agoLabel}</div>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: secsAgo < 90 ? "#10b981" : "#fbbf24", flexShrink: 0 }} title={secsAgo < 90 ? "Active" : "Idle"} />
                  </div>
                );
              };
              return (
                <div style={{ marginBottom: 32, display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Viewers */}
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#10b981", display: "inline-block", animation: viewers.length > 0 ? "adpulse 2s ease-in-out infinite" : "none" }} />
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Viewers Online</h3>
                      <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 2 }}>{viewers.length} user{viewers.length !== 1 ? "s" : ""} browsing the app</span>
                      <button onClick={loadOnlineUsers} style={{ marginLeft: "auto", background: "transparent", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 10px", fontSize: 11, color: "#6b7280", cursor: "pointer" }}>Refresh</button>
                    </div>
                    {viewers.length === 0
                      ? <div style={{ padding: "20px", color: "#9ca3af", fontSize: 13, textAlign: "center" }}>No viewers active in the last 3 minutes</div>
                      : <div>{viewers.map((u, i) => renderRow(u, i, viewers))}</div>}
                  </div>

                  {/* Admin sessions */}
                  <div style={{ background: "#fff", border: "1px solid #e0e7ff", borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#6366f1", display: "inline-block", animation: admins.length > 0 ? "adpulse 2s ease-in-out infinite" : "none" }} />
                      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Admin Sessions</h3>
                      <span style={{ fontSize: 12, color: "#6b7280", marginLeft: 2 }}>{admins.length} admin{admins.length !== 1 ? "s" : ""} in the CMS</span>
                    </div>
                    {admins.length === 0
                      ? <div style={{ padding: "20px", color: "#9ca3af", fontSize: 13, textAlign: "center" }}>No admins currently in the CMS</div>
                      : <div>{admins.map((u, i) => {
                          const email = u.profile?.email || u.user_id;
                          const username = u.profile?.username;
                          const secsAgo = Math.floor((Date.now() - new Date(u.last_seen).getTime()) / 1000);
                          const agoLabel = secsAgo < 60 ? "just now" : `${Math.floor(secsAgo / 60)}m ago`;
                          return (
                            <div key={u.user_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", borderBottom: i < admins.length - 1 ? "1px solid #f8fafc" : "none", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg,#4f46e5,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#fff", fontWeight: 700, flexShrink: 0 }}>
                                {(username || email || "?")[0].toUpperCase()}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{username || email}</div>
                                {username && <div style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</div>}
                              </div>
                              <div style={{ fontSize: 12, color: "#4f46e5", background: "#eef2ff", borderRadius: 5, padding: "2px 8px" }}>Admin CMS</div>
                              <div style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>{agoLabel}</div>
                              <div style={{ width: 7, height: 7, borderRadius: "50%", background: secsAgo < 90 ? "#10b981" : "#fbbf24", flexShrink: 0 }} />
                            </div>
                          );
                        })}</div>}
                  </div>
                </div>
              );
            })()}


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
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                      <div style={{ height: 1, flex: 1, background: "#e2e8f0" }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, whiteSpace: "nowrap" }}>All-Time Platform Stats</span>
                      <div style={{ height: 1, flex: 1, background: "#e2e8f0" }} />
                    </div>
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

                    {reportData.userGrowth.length > 0 && (() => {
                      const max = Math.max(...reportData.userGrowth.map(([, c]) => c), 1);
                      const total = reportData.userGrowth.reduce((s, [, c]) => s + c, 0);
                      const MONTH_NAMES = { "01":"Jan","02":"Feb","03":"Mar","04":"Apr","05":"May","06":"Jun","07":"Jul","08":"Aug","09":"Sep","10":"Oct","11":"Nov","12":"Dec" };
                      return (
                        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "24px 28px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
                            <div>
                              <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 700, color: "#0f172a" }}>User Signups</p>
                              <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>New accounts by month</p>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <p style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 700, color: "#0f172a" }}>{total.toLocaleString()}</p>
                              <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>total signups</p>
                            </div>
                          </div>
                          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, borderBottom: "1px solid #f1f5f9", paddingBottom: 8, marginBottom: 8 }}>
                            {reportData.userGrowth.map(([month, count]) => (
                              <div key={month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 4, height: "100%" }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: count === max ? "#0f172a" : "#6b7280" }}>{count}</span>
                                <div style={{ width: "100%", background: count === max ? "#6366f1" : "rgba(99,102,241,0.15)", borderRadius: "4px 4px 0 0", height: `${Math.round((count / max) * 90)}px`, minHeight: 4, transition: "height 0.4s ease" }} />
                              </div>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: 6 }}>
                            {reportData.userGrowth.map(([month]) => (
                              <div key={month} style={{ flex: 1, textAlign: "center", fontSize: 11, color: "#9ca3af", fontWeight: 500 }}>
                                {MONTH_NAMES[month.slice(5)] || month.slice(5)}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}

                {/* ── CONTENT PERFORMANCE ── */}
                {reportSection === "content" && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 24, marginBottom: 24 }}>
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

                    {/* Category performance */}
                    {reportData.categoryStats.length > 0 && (
                      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                        <p style={{ margin: "0 0 18px", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Performance by Category</p>
                        {(() => {
                          const maxS = Math.max(...reportData.categoryStats.map(c => c.sessions), 1);
                          return reportData.categoryStats.map(c => (
                            <div key={c.cat} style={{ marginBottom: 14 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{c.cat}</span>
                                <div style={{ display: "flex", gap: 20, fontSize: 11, color: "#6b7280" }}>
                                  <span><strong style={{ color: "#60a5fa" }}>{c.sessions.toLocaleString()}</strong> sessions</span>
                                  <span><strong style={{ color: "#34d399" }}>{c.completedPct}%</strong> completed</span>
                                  <span><strong style={{ color: "#f472b6" }}>{c.hours}h</strong> watched</span>
                                </div>
                              </div>
                              <div style={{ height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${Math.max(Math.round(c.sessions / maxS * 100), 2)}%`, background: "linear-gradient(90deg, #6366f1, #8b5cf6)", borderRadius: 4 }} />
                              </div>
                            </div>
                          ));
                        })()}
                      </div>
                    )}

                    {/* Watch depth distribution */}
                    {reportData.depthBuckets.some(b => b.count > 0) && (
                      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                        <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Watch Depth Distribution</p>
                        <p style={{ margin: "0 0 18px", fontSize: 11, color: "#9ca3af" }}>How far into content viewers watch on average</p>
                        {(() => {
                          const total = reportData.depthBuckets.reduce((s, b) => s + b.count, 0);
                          const maxB = Math.max(...reportData.depthBuckets.map(b => b.count), 1);
                          return (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                              {reportData.depthBuckets.map(b => {
                                const pct = total > 0 ? Math.round(b.count / total * 100) : 0;
                                const barH = Math.round(b.count / maxB * 80) + 4;
                                return (
                                  <div key={b.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontSize: 13, fontWeight: 700, color: b.color }}>{pct}%</span>
                                    <div style={{ width: "100%", height: 88, display: "flex", alignItems: "flex-end" }}>
                                      <div style={{ width: "100%", height: barH, background: b.color, borderRadius: "4px 4px 0 0", opacity: 0.85 }} />
                                    </div>
                                    <span style={{ fontSize: 11, fontWeight: 600, color: "#374151" }}>{b.label}</span>
                                    <span style={{ fontSize: 10, color: "#9ca3af" }}>{b.count.toLocaleString()} sessions</span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
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

                    {/* Subscriber funnel */}
                    {reportData.subscriberFunnel[0].count > 0 && (
                      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                        <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Subscriber Funnel</p>
                        <p style={{ margin: "0 0 20px", fontSize: 11, color: "#9ca3af" }}>Drop-off at each stage of user engagement</p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
                          {reportData.subscriberFunnel.map((step, i) => {
                            const base = reportData.subscriberFunnel[0].count;
                            const pct = base > 0 ? Math.round(step.count / base * 100) : 0;
                            const dropPct = i > 0 ? Math.round(step.count / reportData.subscriberFunnel[i - 1].count * 100) : 100;
                            const COLORS = ["#34d399", "#60a5fa", "#a78bfa", "#f472b6"];
                            return (
                              <div key={step.label} style={{ position: "relative", padding: "0 8px" }}>
                                {i > 0 && (
                                  <div style={{ position: "absolute", top: 24, left: -2, fontSize: 10, color: dropPct >= 70 ? "#34d399" : dropPct >= 40 ? "#facc15" : "#f87171", fontWeight: 600, zIndex: 1 }}>
                                    {dropPct}%→
                                  </div>
                                )}
                                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 12px", textAlign: "center" }}>
                                  <div style={{ fontSize: 22, fontWeight: 800, color: COLORS[i], marginBottom: 4 }}>{step.count.toLocaleString()}</div>
                                  <div style={{ fontSize: 10, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{step.label}</div>
                                  <div style={{ height: 4, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${pct}%`, background: COLORS[i], borderRadius: 2 }} />
                                  </div>
                                  <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 5 }}>{pct}% of total</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Content type breakdown */}
                    {reportData.contentTypeStats.length > 0 && (
                      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                        <p style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Sessions by Content Type</p>
                        {(() => {
                          const maxSessions = Math.max(...reportData.contentTypeStats.map(t => t.sessions), 1);
                          const TYPE_COLORS = { Movies: "#60a5fa", "TV Episodes": "#34d399", Podcasts: "#f472b6", Shows: "#a78bfa" };
                          return reportData.contentTypeStats.map(t => {
                            const barColor = TYPE_COLORS[t.label] || "#94a3b8";
                            const barW = Math.max(Math.round((t.sessions / maxSessions) * 100), 2);
                            return (
                              <div key={t.type} style={{ marginBottom: 14 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{t.label}</span>
                                  <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#6b7280" }}>
                                    <span><strong style={{ color: barColor }}>{t.sessions.toLocaleString()}</strong> sessions</span>
                                    <span><strong style={{ color: "#34d399" }}>{t.completedPct}%</strong> completed</span>
                                    <span><strong style={{ color: "#f472b6" }}>{t.hours}h</strong> watched</span>
                                  </div>
                                </div>
                                <div style={{ height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${barW}%`, background: barColor, borderRadius: 4, transition: "width 0.3s" }} />
                                </div>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}

                    {/* Day-of-week activity */}
                    {reportData.dowStats.some(d => d.count > 0) && (
                      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                        <p style={{ margin: "0 0 20px", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Activity by Day of Week</p>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
                          {(() => {
                            const max = Math.max(...reportData.dowStats.map(d => d.count), 1);
                            return reportData.dowStats.map(d => (
                              <div key={d.label} title={`${d.label}: ${d.count} sessions`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "default" }}>
                                <div style={{ width: "100%", background: "rgba(167,139,250,0.25)", borderRadius: 4, height: `${Math.round((d.count / max) * 52) + 4}px`, minHeight: 4 }} />
                                <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 500 }}>{d.label}</span>
                              </div>
                            ));
                          })()}
                        </div>
                        <p style={{ margin: "8px 0 0", fontSize: 11, color: "#9ca3af" }}>All-time sessions · hover bars for count</p>
                      </div>
                    )}

                    {/* Hour of day activity */}
                    {reportData.hourStats.some(h => h.count > 0) && (
                      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginBottom: 24, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                        <p style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Activity by Hour of Day</p>
                        <p style={{ margin: "0 0 20px", fontSize: 11, color: "#9ca3af" }}>All-time watch sessions by local hour (viewer's timezone)</p>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 72 }}>
                          {(() => {
                            const max = Math.max(...reportData.hourStats.map(h => h.count), 1);
                            return reportData.hourStats.map((h, i) => {
                              const isPrimetime = i >= 18 && i <= 23;
                              return (
                                <div key={h.label} title={`${h.label}: ${h.count} sessions`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "default" }}>
                                  <div style={{ width: "100%", background: isPrimetime ? "rgba(251,146,60,0.35)" : "rgba(96,165,250,0.25)", borderRadius: "3px 3px 0 0", height: `${Math.round((h.count / max) * 52) + 2}px`, minHeight: 2 }} />
                                  {i % 4 === 0 && <span style={{ fontSize: 8, color: "#9ca3af" }}>{h.label}</span>}
                                </div>
                              );
                            });
                          })()}
                        </div>
                        <p style={{ margin: "8px 0 0", fontSize: 11, color: "#9ca3af" }}>Orange bars = 6pm–midnight · hover for exact count</p>
                      </div>
                    )}

                    {/* Sessions + hours trend (last 30 days, stacked full-width) */}
                    {(reportData.sessionTrend.length > 0 || reportData.hoursTrend.length > 0) && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
                        {[
                          { data: reportData.sessionTrend, label: "Sessions — Last 30 Days", color: "rgba(96,165,250,0.5)", suffix: " sessions", statLabel: "active days" },
                          { data: reportData.hoursTrend, label: "Hours Watched — Last 30 Days", color: "rgba(244,114,182,0.5)", suffix: "h", statLabel: "active days" },
                        ].map(({ data, label, color, suffix, statLabel }) => data.length > 0 && (
                          <div key={label} style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{label}</p>
                              <span style={{ fontSize: 11, color: "#9ca3af" }}>{data.length} {statLabel}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 96 }}>
                              {(() => {
                                const max = Math.max(...data.map(([, v]) => v), 1);
                                return data.map(([day, val]) => (
                                  <div key={day} title={`${day}: ${val}${suffix}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "default", minWidth: 0 }}>
                                    <div style={{ width: "100%", background: color, borderRadius: "3px 3px 0 0", height: `${Math.round((val / max) * 80) + 4}px`, minHeight: 4, transition: "height 0.3s" }} />
                                    <span style={{ fontSize: 9, color: "#9ca3af", whiteSpace: "nowrap" }}>{day.slice(5)}</span>
                                  </div>
                                ));
                              })()}
                            </div>
                          </div>
                        ))}
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

        {/* ────── SUBSCRIPTIONS TAB ────── */}
        {tab === "subscriptions" && (() => {
          const active = subs.filter(s => s.status === "active");
          const activePaid = active.filter(s => s.plan !== "comp");
          const activeComp = active.filter(s => s.plan === "comp");
          const inactive = subs.filter(s => s.status !== "active");
          const mrr = activePaid.length * 10;
          const arr = mrr * 12;
          const now = new Date();
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          const netNewThisMonth = subs.filter(s => s.plan !== "comp" && s.created_at && new Date(s.created_at) >= startOfMonth).length;
          const paidTotal = subs.filter(s => s.plan !== "comp").length;
          const churnRate = paidTotal > 0 ? (((paidTotal - activePaid.length) / paidTotal) * 100).toFixed(1) : "0.0";
          const atRisk = activePaid.filter(s => !s.last_seen || (now - new Date(s.last_seen)) > 14 * 24 * 60 * 60 * 1000);

          const filtered = subs
            .filter(s => subStatusFilter === "all" || s.status === subStatusFilter)
            .filter(s => !subSearch || (s.email || "").toLowerCase().includes(subSearch.toLowerCase()))
            .sort((a, b) => {
              const av = a[subSort.col] ?? "";
              const bv = b[subSort.col] ?? "";
              return subSort.dir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
            });

          const SortTh = ({ col, label }) => (
            <th onClick={() => setSubSort(s => ({ col, dir: s.col === col && s.dir === "asc" ? "desc" : "asc" }))}
              style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: subSort.col === col ? "#4f46e5" : "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, cursor: "pointer", whiteSpace: "nowrap", userSelect: "none" }}>
              {label} {subSort.col === col ? (subSort.dir === "asc" ? "↑" : "↓") : ""}
            </th>
          );

          return (
            <div>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Subscriptions</h2>
                <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                  <button onClick={exportSubsCSV} disabled={subs.length === 0} style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 7, padding: "8px 16px", color: "#34d399", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Export CSV
                  </button>
                  <button onClick={loadSubscriptions} style={{ background: "rgba(129,140,248,0.1)", border: "1px solid rgba(129,140,248,0.2)", borderRadius: 7, padding: "8px 16px", color: "#818cf8", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Refresh
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, marginBottom: 32 }}>
                {[
                  { label: "MRR", value: `$${mrr}`, sub: "Paid only", color: "#facc15" },
                  { label: "ARR", value: `$${arr}`, sub: "Paid only", color: "#f59e0b" },
                  { label: "Active Paid", value: activePaid.length, color: "#34d399" },
                  { label: "Comped", value: activeComp.length, sub: "Free access granted", color: "#818cf8" },
                  { label: "Churned", value: inactive.length, color: "#f87171" },
                  { label: "Churn Rate", value: `${churnRate}%`, sub: "Paid subs only", color: inactive.length > 0 ? "#f87171" : "#34d399" },
                  { label: "New This Month", value: netNewThisMonth, color: "#a78bfa" },
                  { label: "At Risk", value: atRisk.length, sub: "Paid, no activity 14d+", color: atRisk.length > 0 ? "#f59e0b" : "#34d399" },
                ].map(({ label, value, color, sub }) => (
                  <div key={label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px 20px" }}>
                    <p style={{ margin: "0 0 4px", fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</p>
                    <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color }}>{value}</p>
                    {sub && <p style={{ margin: "4px 0 0", fontSize: 10, color: "#9ca3af" }}>{sub}</p>}
                  </div>
                ))}
              </div>

              {/* Filters */}
              <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", flex: 1, minWidth: 200 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input value={subSearch} onChange={e => setSubSearch(e.target.value)} placeholder="Search by email…" style={{ border: "none", outline: "none", fontSize: 13, color: "#0f172a", background: "transparent", flex: 1 }} />
                </div>
                <select value={subStatusFilter} onChange={e => setSubStatusFilter(e.target.value)} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#0f172a", cursor: "pointer", outline: "none" }}>
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="canceled">Cancelled</option>
                  <option value="past_due">Past Due</option>
                </select>
              </div>

              {/* Table */}
              {subsLoading ? (
                <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>Loading…</div>
              ) : filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>{subs.length === 0 ? "No subscribers yet" : "No results"}</div>
              ) : (
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                        <SortTh col="email" label="Email" />
                        <SortTh col="status" label="Status" />
                        <SortTh col="created_at" label="Started" />
                        <SortTh col="current_period_end" label="Renews" />
                        <SortTh col="last_seen" label="Last Seen" />
                        <SortTh col="watch_sessions" label="Sessions" />
                        <SortTh col="profile_count" label="Profiles" />
                        <th style={{ padding: "12px 16px" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((s, i) => {
                        const daysSinceActive = s.last_seen ? Math.floor((now - new Date(s.last_seen)) / 86400000) : null;
                        const isAtRisk = s.status === "active" && (daysSinceActive === null || daysSinceActive > 14);
                        return (
                          <tr key={s.id} style={{ borderBottom: i < filtered.length - 1 ? "1px solid #f1f5f9" : "none", background: isAtRisk ? "rgba(245,158,11,0.03)" : "transparent" }}>
                            <td style={{ padding: "14px 16px", color: "#0f172a", fontWeight: 500, maxWidth: 220 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                {isAtRisk && <span title="No activity in 14+ days" style={{ fontSize: 10, background: "rgba(245,158,11,0.15)", color: "#b45309", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>at risk</span>}
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.email || <span style={{ color: "#9ca3af", fontFamily: "monospace", fontSize: 11 }}>{s.user_id?.slice(0, 16)}…</span>}</span>
                              </div>
                            </td>
                            <td style={{ padding: "14px 16px" }}>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <span style={{ background: s.status === "active" ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)", color: s.status === "active" ? "#059669" : "#dc2626", border: `1px solid ${s.status === "active" ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>
                                  {s.status}
                                </span>
                                {s.plan === "comp" && (
                                  <span style={{ background: "rgba(129,140,248,0.12)", color: "#818cf8", border: "1px solid rgba(129,140,248,0.3)", borderRadius: 20, padding: "3px 8px", fontSize: 10, fontWeight: 700 }}>COMP</span>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: "14px 16px", color: "#6b7280", whiteSpace: "nowrap" }}>{s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}</td>
                            <td style={{ padding: "14px 16px", color: "#6b7280", whiteSpace: "nowrap" }}>{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}</td>
                            <td style={{ padding: "14px 16px", color: daysSinceActive !== null && daysSinceActive > 14 ? "#f59e0b" : "#6b7280", whiteSpace: "nowrap" }}>
                              {daysSinceActive === null ? <span style={{ color: "#9ca3af" }}>Never</span> : daysSinceActive === 0 ? "Today" : `${daysSinceActive}d ago`}
                            </td>
                            <td style={{ padding: "14px 16px", color: "#0f172a", fontWeight: 500, textAlign: "center" }}>{s.watch_sessions}</td>
                            <td style={{ padding: "14px 16px", color: "#0f172a", textAlign: "center" }}>{s.profile_count}</td>
                            <td style={{ padding: "14px 16px" }}>
                              <button onClick={() => setRevokeConfirm(s)} style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 6, padding: "5px 12px", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                                Revoke
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Revoke confirm modal */}
              {revokeConfirm && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ background: "#fff", borderRadius: 16, padding: "32px 36px", maxWidth: 380, width: "90%", textAlign: "center" }}>
                    <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "#0f172a" }}>Revoke subscription?</p>
                    <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>{revokeConfirm.email || revokeConfirm.user_id}</p>
                    <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 28 }}>This removes access immediately. It does not cancel billing in Stripe — do that separately.</p>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => setRevokeConfirm(null)} style={{ flex: 1, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "11px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                      <button onClick={() => revokeSubscription(revokeConfirm.id)} style={{ flex: 1, background: "#dc2626", border: "none", borderRadius: 7, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Revoke Access</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ────── THE BOSS TAB ────── */}
        {tab === "boss" && !bossAuthed && (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}>
            <div style={{ width: 320, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "40px 36px", textAlign: "center" }}>
              <p style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>The Boss</p>
              <p style={{ margin: "0 0 24px", fontSize: 13, color: "#9ca3af" }}>Enter your access code</p>
              <input
                type="password"
                maxLength={8}
                value={bossPinInput}
                autoFocus
                onChange={e => { setBossPinInput(e.target.value); setBossPinError(false); }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    if (bossPinInput === "0319") { sessionStorage.setItem("peep_boss_auth", "1"); setBossAuthed(true); loadPromos(); loadBossSettings(); }
                    else { setBossPinError(true); setBossPinInput(""); }
                  }
                }}
                placeholder="••••"
                style={{ width: "100%", background: "#f8fafc", border: `1px solid ${bossPinError ? "#ef4444" : "#e2e8f0"}`, borderRadius: 8, padding: "12px 16px", fontSize: 18, color: "#0f172a", outline: "none", textAlign: "center", letterSpacing: "0.3em", boxSizing: "border-box" }}
              />
              {bossPinError && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#ef4444" }}>Incorrect code</p>}
              <button
                onClick={() => {
                  if (bossPinInput === "0319") { sessionStorage.setItem("peep_boss_auth", "1"); setBossAuthed(true); loadPromos(); loadBossSettings(); }
                  else { setBossPinError(true); setBossPinInput(""); }
                }}
                style={{ width: "100%", marginTop: 16, background: "#facc15", border: "none", borderRadius: 8, padding: "12px", color: "#0a0a0a", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                Enter
              </button>
            </div>
          </div>
        )}

        {tab === "boss" && bossAuthed && bossView === "security" && (() => {
          const now = new Date();
          return (
            <div style={{ maxWidth: 760 }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
                <button onClick={() => setBossView("main")} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#374151", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  ← Back
                </button>
                <div>
                  <h2 style={{ margin: "0 0 2px", fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Security</h2>
                  <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>Access control, blocked accounts, session monitoring</p>
                </div>
                <button onClick={loadSecurityData} style={{ marginLeft: "auto", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 7, padding: "8px 16px", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Refresh
                </button>
              </div>

              {/* Lockout Settings */}
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "24px 28px", marginBottom: 20 }}>
                <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Admin Lockout</p>
                <p style={{ margin: "0 0 18px", fontSize: 13, color: "#9ca3af" }}>Lock the admin login after too many wrong PINs.</p>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Max Attempts</label>
                    <input type="number" min="1" max="20"
                      value={lockoutSettings.lockout_max_attempts}
                      onChange={e => setLockoutSettings(p => ({ ...p, lockout_max_attempts: e.target.value }))}
                      onBlur={e => saveSetting("lockout_max_attempts", e.target.value)}
                      style={{ width: 80, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 14, color: "#0f172a", outline: "none", textAlign: "center" }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Lockout Duration (mins)</label>
                    <input type="number" min="1" max="1440"
                      value={lockoutSettings.lockout_duration_mins}
                      onChange={e => setLockoutSettings(p => ({ ...p, lockout_duration_mins: e.target.value }))}
                      onBlur={e => saveSetting("lockout_duration_mins", e.target.value)}
                      style={{ width: 100, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 14, color: "#0f172a", outline: "none", textAlign: "center" }} />
                  </div>
                </div>
              </div>

              {/* Failed Login Attempts */}
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "24px 28px", marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div>
                    <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Failed Login Attempts</p>
                    <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>Wrong PINs entered on the admin login screen.</p>
                  </div>
                  {loginAttempts.length > 0 && (
                    <button onClick={async () => { await supabase.from("admin_login_attempts").delete().neq("id", "00000000-0000-0000-0000-000000000000"); loadLoginAttempts(); showToast("Cleared"); }}
                      style={{ background: "none", border: "none", fontSize: 12, color: "#9ca3af", cursor: "pointer", textDecoration: "underline" }}>Clear all</button>
                  )}
                </div>
                {loginAttempts.length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "16px 0" }}>No failed attempts — all clear</p>
                ) : (
                  <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #f1f5f9" }}>
                    {loginAttempts.map((a, i) => {
                      const date = new Date(a.attempted_at);
                      const masked = a.pin_entered ? a.pin_entered.slice(0, 1) + "*".repeat(Math.max(0, a.pin_entered.length - 1)) : "?";
                      return (
                        <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", background: i % 2 === 0 ? "#fafafa" : "#fff", borderBottom: i < loginAttempts.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 16 }}>🚨</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>Tried <code style={{ background: "rgba(239,68,68,0.08)", color: "#dc2626", padding: "1px 6px", borderRadius: 4, letterSpacing: "0.1em" }}>{masked}</code></span>
                          </div>
                          <span style={{ fontSize: 11, color: "#9ca3af" }}>{date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Block User */}
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "24px 28px", marginBottom: 20 }}>
                <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Block User</p>
                <p style={{ margin: "0 0 16px", fontSize: 13, color: "#9ca3af" }}>Blocked users are signed out immediately and can't log back in.</p>
                <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                  <input value={blockEmail} onChange={e => setBlockEmail(e.target.value)} placeholder="user@email.com" type="email"
                    style={{ flex: 2, minWidth: 180, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", fontSize: 14, color: "#0f172a", outline: "none" }} />
                  <input value={blockReason} onChange={e => setBlockReason(e.target.value)} placeholder="Reason (optional)"
                    style={{ flex: 2, minWidth: 140, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", fontSize: 14, color: "#0f172a", outline: "none" }} />
                  <button onClick={blockUser} disabled={blockLoading || !blockEmail.trim()}
                    style={{ background: "#dc2626", border: "none", borderRadius: 8, padding: "10px 20px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: blockLoading ? 0.6 : 1, whiteSpace: "nowrap" }}>
                    {blockLoading ? "…" : "Block"}
                  </button>
                </div>
                {blockedUsers.length > 0 && (
                  <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #f1f5f9" }}>
                    {blockedUsers.map((u, i) => (
                      <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", background: i % 2 === 0 ? "#fafafa" : "#fff", borderBottom: i < blockedUsers.length - 1 ? "1px solid #f1f5f9" : "none", gap: 12 }}>
                        <div>
                          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{u.email}</p>
                          {u.reason && <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>{u.reason}</p>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                          <span style={{ fontSize: 11, color: "#9ca3af" }}>{new Date(u.blocked_at).toLocaleDateString()}</span>
                          <button onClick={() => unblockUser(u.id)} style={{ background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.2)", borderRadius: 6, padding: "4px 12px", color: "#059669", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Unblock</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {blockedUsers.length === 0 && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#9ca3af" }}>No blocked users</p>}
              </div>

              {/* Active Sessions */}
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "24px 28px", marginBottom: 20 }}>
                <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Active Sessions</p>
                <p style={{ margin: "0 0 16px", fontSize: 13, color: "#9ca3af" }}>Users seen in the last 5 minutes.</p>
                {activeSessions.filter(s => (now - new Date(s.last_seen)) < 5 * 60 * 1000).length === 0 ? (
                  <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>No active sessions right now</p>
                ) : (
                  <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #f1f5f9" }}>
                    {activeSessions.filter(s => (now - new Date(s.last_seen)) < 5 * 60 * 1000).map((s, i, arr) => (
                      <div key={s.user_id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 16px", background: i % 2 === 0 ? "#fafafa" : "#fff", borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", flexShrink: 0, display: "inline-block" }} />
                          <div>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#0f172a" }}>{s.email || <span style={{ color: "#9ca3af", fontFamily: "monospace", fontSize: 11 }}>{s.user_id?.slice(0, 16)}…</span>}</p>
                            {s.profileName && <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>Profile: {s.profileName}</p>}
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          {s.current_page && <span style={{ fontSize: 11, background: "#f1f5f9", padding: "2px 8px", borderRadius: 4, color: "#6b7280" }}>{s.current_page}</span>}
                          <span style={{ fontSize: 11, color: "#9ca3af" }}>{Math.floor((now - new Date(s.last_seen)) / 1000)}s ago</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {tab === "boss" && bossAuthed && bossView === "main" && (
          <div style={{ maxWidth: 700 }}>
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#0f172a" }}>The Boss</h2>
              <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>Platform controls — only you can see this.</p>
            </div>

            {/* ── Maintenance Mode ── */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "24px 28px", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                <div>
                  <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Maintenance Mode</p>
                  <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>Shows a "Be right back" screen to all users. Admin still works at /admin.</p>
                </div>
                <button
                  onClick={() => { const next = bossSettings.maintenance_mode !== "true"; saveSetting("maintenance_mode", String(next)); showToast(next ? "Maintenance mode ON" : "Maintenance mode OFF"); }}
                  style={{ width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer", background: bossSettings.maintenance_mode === "true" ? "#ef4444" : "#d1d5db", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                  <span style={{ position: "absolute", top: 4, left: bossSettings.maintenance_mode === "true" ? 26 : 4, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)", transition: "left 0.2s" }} />
                </button>
              </div>
              {bossSettings.maintenance_mode === "true" && (
                <div style={{ marginTop: 12, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#ef4444", fontWeight: 600 }}>
                  ⚠ Maintenance mode is ON — users cannot access the app right now
                </div>
              )}
            </div>


            {/* ── Grant Access ── */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "24px 28px", marginBottom: 20 }}>
              <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Grant Access by Email</p>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: "#9ca3af" }}>Give any existing account free access instantly. Shows as COMP in subscriptions.</p>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  value={grantEmail}
                  onChange={e => { setGrantEmail(e.target.value); setGrantResult(null); }}
                  onKeyDown={e => e.key === "Enter" && grantAccessByEmail()}
                  placeholder="user@email.com"
                  type="email"
                  style={{ flex: 1, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", fontSize: 14, color: "#0f172a", outline: "none" }}
                />
                <button onClick={grantAccessByEmail} disabled={grantLoading || !grantEmail.trim()}
                  style={{ background: "#facc15", border: "none", borderRadius: 8, padding: "10px 24px", color: "#0a0a0a", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: grantLoading ? 0.6 : 1, whiteSpace: "nowrap" }}>
                  {grantLoading ? "…" : "Grant Access"}
                </button>
              </div>
              {grantResult && (
                <p style={{ margin: "10px 0 0", fontSize: 13, color: grantResult.success ? "#059669" : "#dc2626", fontWeight: 500 }}>
                  {grantResult.success ? "✓ " : "✗ "}{grantResult.msg}
                </p>
              )}
            </div>

            {/* ── Security Card ── */}
            <div onClick={() => { setBossView("security"); loadSecurityData(); }}
              style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "22px 28px", marginBottom: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "box-shadow 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"}
              onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <div>
                  <p style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Security</p>
                  <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>Login attempts, blocked users, lockout settings, active sessions</p>
                </div>
              </div>
              <span style={{ fontSize: 18, color: "#d1d5db" }}>→</span>
            </div>

            {/* Create new code */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "28px 28px", marginBottom: 28 }}>
              <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Create Promo Code</h3>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Name</label>
                  <input
                    value={promoForm.name}
                    onChange={e => setPromoForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Friends & Family"
                    onKeyDown={e => e.key === "Enter" && savePromo()}
                    style={{ width: "100%", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", fontSize: 14, color: "#0f172a", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Code</label>
                  <input
                    value={promoForm.code}
                    onChange={e => setPromoForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                    placeholder="e.g. FAMILY50"
                    onKeyDown={e => e.key === "Enter" && savePromo()}
                    style={{ width: "100%", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", fontSize: 14, color: "#0f172a", outline: "none", fontFamily: "monospace", letterSpacing: "0.08em", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button onClick={savePromo} disabled={promoSaving || !promoForm.name.trim() || !promoForm.code.trim()}
                    style={{ background: "#facc15", border: "none", borderRadius: 8, padding: "10px 24px", color: "#0a0a0a", fontSize: 14, fontWeight: 700, cursor: "pointer", opacity: promoSaving ? 0.6 : 1, whiteSpace: "nowrap" }}>
                    {promoSaving ? "Saving…" : "Add Code"}
                  </button>
                </div>
              </div>
            </div>

            {/* Code list */}
            {promosLoading ? (
              <div style={{ textAlign: "center", padding: 40, color: "#9ca3af" }}>Loading…</div>
            ) : promos.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: "#9ca3af", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16 }}>No promo codes yet</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {promos.map(p => (
                  <div key={p.id} style={{ background: "#fff", border: `1px solid ${p.active ? "#e2e8f0" : "#f1f5f9"}`, borderRadius: 14, padding: "20px 24px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", opacity: p.active ? 1 : 0.6 }}>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 120 }}>
                      <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>{p.name}</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <code style={{ fontSize: 13, color: "#4f46e5", background: "rgba(79,70,229,0.07)", padding: "2px 8px", borderRadius: 5, letterSpacing: "0.08em" }}>{p.code}</code>
                        <button onClick={() => { navigator.clipboard.writeText(p.code); showToast("Copied!"); }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 11, padding: 0 }}>
                          Copy
                        </button>
                      </div>
                    </div>

                    {/* Uses */}
                    <div style={{ textAlign: "center", minWidth: 60 }}>
                      <p style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 700, color: "#0f172a" }}>{p.uses}</p>
                      <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>Uses</p>
                    </div>

                    {/* Toggle */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <button onClick={() => togglePromo(p.id, !p.active)}
                        style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", background: p.active ? "#22c55e" : "#d1d5db", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                        <span style={{ position: "absolute", top: 3, left: p.active ? 22 : 3, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)", transition: "left 0.2s" }} />
                      </button>
                      <span style={{ fontSize: 10, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>{p.active ? "On" : "Off"}</span>
                    </div>

                    {/* Delete */}
                    <button onClick={() => deletePromo(p.id)}
                      style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 7, padding: "7px 14px", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      Delete
                    </button>
                  </div>
                ))}
              </div>
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
          const fallbackSecs = Math.max(1, Number(bulkDefaultMins) || 30) * 60;
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
                  {tab === "videos" && videoSubTab === "music" && (editingMusicVideoId ? "Edit Music Video" : "Add Music Video")}
                  {tab === "carousels" && (editingCarouselId ? "Edit Carousel" : "Add Carousel")}
                  {tab === "live" && drawerFormType !== "epg" && drawerFormType !== "bulk" && (editingLiveId ? "Edit Stream" : "Add Stream")}
                  {tab === "live" && drawerFormType === "epg" && (editingEpgId ? "Edit Program" : "Add Program")}
                  {tab === "live" && drawerFormType === "bulk" && "Auto-Schedule Block"}
                  {tab === "ads" && (editingAdId ? "Edit Ad Tag" : "Add Ad Tag")}
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

                {/* ── MUSIC VIDEO FORM ── */}
                {tab === "videos" && videoSubTab === "music" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <FieldInput label="Artist *" value={musicVideoForm.artist} onChange={v => setMusicVideoForm(f => ({ ...f, artist: v }))} placeholder="e.g. Daft Punk" />
                    <FieldInput label="Title *" value={musicVideoForm.title} onChange={v => setMusicVideoForm(f => ({ ...f, title: v }))} placeholder="e.g. Get Lucky" />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <FieldInput label="Year" value={musicVideoForm.year} onChange={v => setMusicVideoForm(f => ({ ...f, year: v }))} placeholder="2013" type="number" />
                      <FieldInput label="Duration" value={musicVideoForm.duration} onChange={v => setMusicVideoForm(f => ({ ...f, duration: v }))} placeholder="4:09" />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Thumbnail (16:9)</label>
                      <ImageUploader label="Upload Thumbnail (JPG/PNG)" folder="music-thumbs" onUploadSuccess={url => setMusicVideoForm(f => ({ ...f, thumbnail: url }))} onError={err => showToast("Upload failed: " + err, "error")} />
                      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
                        <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
                        <span style={{ fontSize: 11, color: "#9ca3af" }}>or paste URL</span>
                        <div style={{ flex: 1, height: 1, background: "#e2e8f0" }} />
                      </div>
                      <input type="text" value={musicVideoForm.thumbnail} onChange={e => setMusicVideoForm(f => ({ ...f, thumbnail: e.target.value }))} placeholder="https://..." style={{ width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                      {musicVideoForm.thumbnail && (
                        <div style={{ marginTop: 8, borderRadius: 6, overflow: "hidden", border: "1px solid #e2e8f0" }}>
                          <img src={musicVideoForm.thumbnail} alt="" style={{ width: "100%", height: 90, objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />
                        </div>
                      )}
                    </div>
                    <FieldInput label="Video URL *" value={musicVideoForm.url} onChange={v => setMusicVideoForm(f => ({ ...f, url: v }))} placeholder="https://..." />
                    <FieldInput label="Trailer URL (optional)" value={musicVideoForm.trailer_url} onChange={v => setMusicVideoForm(f => ({ ...f, trailer_url: v }))} placeholder="https://youtube.com/watch?v=..." />
                    <FieldInput label="Tags (comma-separated)" value={musicVideoForm.tags} onChange={v => setMusicVideoForm(f => ({ ...f, tags: v }))} placeholder="Pop, Electronic, 2013" />
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Description</label>
                      <textarea value={musicVideoForm.description} onChange={e => setMusicVideoForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Short description..." style={{ width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.7 }}>Status</label>
                      <button onClick={() => setMusicVideoForm(f => ({ ...f, enabled: !f.enabled }))}
                        style={{ width: "100%", background: musicVideoForm.enabled ? "rgba(79,70,229,0.08)" : "rgba(107,114,128,0.08)", border: `1px solid ${musicVideoForm.enabled ? "rgba(79,70,229,0.3)" : "#e2e8f0"}`, borderRadius: 7, padding: "10px 12px", color: musicVideoForm.enabled ? "#4f46e5" : "#6b7280", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
                        {musicVideoForm.enabled ? "✓ Enabled" : "○ Disabled"}
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                      <button onClick={saveMusicVideo} disabled={musicVideoSaving} style={{ flex: 1, background: "#4f46e5", border: "none", borderRadius: 7, padding: "12px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: musicVideoSaving ? "not-allowed" : "pointer", opacity: musicVideoSaving ? 0.7 : 1 }}>
                        {musicVideoSaving ? "Saving…" : editingMusicVideoId ? "Save Changes" : "Add Music Video"}
                      </button>
                      <button onClick={cancelMusicVideoEdit} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "12px 20px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
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
                {tab === "live" && drawerFormType !== "epg" && drawerFormType !== "bulk" && (
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
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.7 }}>Hero Image</label>
                      <p style={{ margin: "0 0 6px", fontSize: 11, color: "#9ca3af" }}>Wide banner shown behind the featured hero card. Recommended: 1920×1080. Keep the main subject center-right as text overlays the left.</p>
                      <ImageUploader label="Upload Hero Image" folder="live" onUploadSuccess={url => setLiveForm(f => ({ ...f, hero_image: url }))} onError={err => showToast("Upload failed: " + err, "error")} />
                      <input type="text" value={liveForm.hero_image} onChange={e => setLiveForm(f => ({ ...f, hero_image: e.target.value }))} placeholder="or paste URL..." style={{ width: "100%", marginTop: 8, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                      {liveForm.hero_image && <img src={liveForm.hero_image} alt="" style={{ marginTop: 8, width: "100%", height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid #e2e8f0" }} onError={e => { e.target.style.display = "none"; }} />}
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

                {/* ── ADS FORM ── */}
                {tab === "ads" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Name *</label>
                      <input value={adForm.name} onChange={e => setAdForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Global Pre-roll"
                        style={{ width: "100%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                        onFocus={e => (e.target.style.borderColor = "#f59e0b")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>VAST Tag URL *</label>
                      <input value={adForm.tag_url} onChange={e => setAdForm(f => ({ ...f, tag_url: e.target.value }))} placeholder="https://..."
                        style={{ width: "100%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "monospace" }}
                        onFocus={e => (e.target.style.borderColor = "#f59e0b")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Ad Position</label>
                      <div style={{ display: "flex", gap: 6 }}>
                        {[{ value: "pre_roll", label: "Pre-roll" }, { value: "mid_roll", label: "Mid-roll" }, { value: "post_roll", label: "Post-roll" }].map(opt => (
                          <button key={opt.value} onClick={() => setAdForm(f => ({ ...f, ad_type: opt.value }))}
                            style={{ flex: 1, background: adForm.ad_type === opt.value ? "#f59e0b" : "#f1f5f9", border: `1px solid ${adForm.ad_type === opt.value ? "#f59e0b" : "#e2e8f0"}`, borderRadius: 7, padding: "9px", color: adForm.ad_type === opt.value ? "#fff" : "#374151", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Applies To</label>
                      <select value={adForm.scope} onChange={e => setAdForm(f => ({ ...f, scope: e.target.value, content_id: "" }))}
                        style={{ width: "100%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none", cursor: "pointer" }}
                        onFocus={e => (e.target.style.borderColor = "#f59e0b")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")}>
                        <option value="global">All Content</option>
                        <option value="movie">Movies</option>
                        <option value="show">TV Shows</option>
                        <option value="episode">Episodes</option>
                        <option value="podcast_episode">Podcasts</option>
                      </select>
                    </div>
                    {adForm.scope !== "global" && (
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Content ID <span style={{ textTransform: "none", color: "#94a3b8" }}>(leave blank for all in type)</span></label>
                        <input value={adForm.content_id} onChange={e => setAdForm(f => ({ ...f, content_id: e.target.value }))} placeholder="e.g. 42" type="number"
                          style={{ width: "100%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                          onFocus={e => (e.target.style.borderColor = "#f59e0b")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 0" }}>
                      <button onClick={() => setAdForm(f => ({ ...f, active: !f.active }))}
                        style={{ width: 40, height: 22, borderRadius: 11, border: "none", background: adForm.active ? "#22c55e" : "#d1d5db", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                        <span style={{ position: "absolute", top: 3, left: adForm.active ? 20 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", display: "block" }} />
                      </button>
                      <span style={{ fontSize: 13, color: "#374151" }}>{adForm.active ? "Active — tag will be served" : "Inactive — tag is paused"}</span>
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                      <button onClick={saveAd} disabled={adSaving} style={{ flex: 1, background: "#f59e0b", border: "none", borderRadius: 7, padding: "12px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: adSaving ? "not-allowed" : "pointer", opacity: adSaving ? 0.7 : 1 }}>
                        {adSaving ? "Saving…" : editingAdId ? "Save Changes" : "Add Tag"}
                      </button>
                      <button onClick={cancelAdEdit} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "12px 20px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </>
        );
      })()}

    {/* ── EPG PROGRAM DETAIL MODAL ── */}
    {epgDetailEntry && (() => {
      const entry = epgDetailEntry;
      const start = new Date(entry.start_time);
      const end = new Date(entry.end_time);
      const durationMins = Math.round((end - start) / 60000);
      const now = new Date();
      const isNow = start <= now && end > now;
      return (
        <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setEpgDetailEntry(null); }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, boxShadow: "0 24px 80px rgba(0,0,0,0.2)", overflow: "hidden" }}>
            {entry.thumbnail && (
              <div style={{ position: "relative", aspectRatio: "16/9", background: "#0f172a" }}>
                <img src={entry.thumbnail} alt={entry.title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} onError={e => e.target.parentElement.style.display = "none"} />
                {isNow && (
                  <div style={{ position: "absolute", top: 12, left: 12, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 4, letterSpacing: 0.5 }}>ON AIR</div>
                )}
              </div>
            )}
            <div style={{ padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                <div>
                  {!entry.thumbnail && isNow && <span style={{ display: "inline-block", background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4, letterSpacing: 0.5, marginBottom: 6 }}>ON AIR</span>}
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{entry.title}</h2>
                </div>
                <button onClick={() => setEpgDetailEntry(null)} style={{ background: "none", border: "none", fontSize: 20, color: "#9ca3af", cursor: "pointer", flexShrink: 0, lineHeight: 1, padding: 0 }}>✕</button>
              </div>
              {entry.description && <p style={{ margin: "0 0 16px", fontSize: 14, color: "#4b5563", lineHeight: 1.6 }}>{entry.description}</p>}
              <div style={{ display: "flex", gap: 24, padding: "14px 0", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9", marginBottom: 16 }}>
                <div>
                  <p style={{ margin: "0 0 2px", fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>Starts</p>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</p>
                  <p style={{ margin: 0, fontSize: 11, color: "#6b7280" }}>{start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</p>
                </div>
                <div>
                  <p style={{ margin: "0 0 2px", fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>Ends</p>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</p>
                </div>
                <div>
                  <p style={{ margin: "0 0 2px", fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>Duration</p>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{durationMins >= 60 ? `${Math.floor(durationMins / 60)}h ${durationMins % 60}m` : `${durationMins}m`}</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { setEpgDetailEntry(null); startEpgEdit(entry); }}
                  style={{ flex: 1, background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Edit Program
                </button>
                <button onClick={() => { setEpgDetailEntry(null); setDeleteEpgConfirm(entry); }}
                  style={{ background: "rgba(220,38,38,0.07)", color: "#dc2626", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    })()}

    {/* ── EPG SOURCE XML VIEWER MODAL ── */}
    {epgSourceXmlModal && (
      <div style={{ position: "fixed", inset: 0, zIndex: 450, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        onClick={e => { if (e.target === e.currentTarget) setEpgSourceXmlModal(null); }}>
        <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 700, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.25)" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>📄</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{epgSourceXmlModal.source_name}</span>
            </div>
            <button onClick={() => setEpgSourceXmlModal(null)} style={{ background: "none", border: "none", fontSize: 20, color: "#9ca3af", cursor: "pointer", lineHeight: 1, padding: 4 }}>✕</button>
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            {epgSourceXmlModal.xml_content ? (
              <pre style={{ margin: 0, padding: 20, fontSize: 11, lineHeight: 1.7, color: "#334155", fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {epgSourceXmlModal.xml_content}
              </pre>
            ) : (
              <div style={{ padding: 48, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>
                <p style={{ margin: "0 0 8px", fontSize: 32 }}>📭</p>
                <p style={{ margin: 0 }}>No XML content saved for this import.</p>
                <p style={{ margin: "6px 0 0", fontSize: 12 }}>Re-import the file to enable XML viewing.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    {/* ── XMLTV IMPORT MODAL ── */}
    {xmltvOpen && (
      <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        onClick={e => { if (e.target === e.currentTarget) setXmltvOpen(false); }}>
        <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 640, maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.25)" }}>

          {/* Header */}
          <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a" }}>Import EPG · XMLTV</h2>
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "#6b7280" }}>Upload a .xml file or load from a URL, then map channels to your live streams</p>
            </div>
            <button onClick={() => setXmltvOpen(false)} style={{ background: "none", border: "none", fontSize: 20, color: "#9ca3af", cursor: "pointer", lineHeight: 1, padding: 4 }}>✕</button>
          </div>

          <div style={{ padding: 24 }}>
            {xmltvImportDone ? (
              /* Success screen */
              <div style={{ textAlign: "center", padding: "32px 0" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                <h3 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Import Complete</h3>
                <p style={{ margin: "0 0 24px", color: "#4b5563", fontSize: 14 }}>{xmltvImportDone.toLocaleString()} programs imported successfully</p>
                <button onClick={() => setXmltvOpen(false)}
                  style={{ background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  Done
                </button>
              </div>
            ) : (
              <>
                {/* Step 1: source */}
                <div style={{ marginBottom: 24 }}>
                  <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#374151" }}>1. Load XMLTV source</p>
                  <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                    <input
                      ref={xmltvFileRef}
                      type="file"
                      accept=".xml,.gz"
                      style={{ display: "none" }}
                      onChange={e => { if (e.target.files[0]) loadXmltvFile(e.target.files[0]); }}
                    />
                    {xmltvFileName ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, maxWidth: 260 }}>
                        <button onClick={() => setXmltvRawOpen(o => !o)}
                          style={{ background: xmltvRawOpen ? "#0f172a" : "#f0fdf4", border: `1px solid ${xmltvRawOpen ? "#0f172a" : "#86efac"}`, borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 600, color: xmltvRawOpen ? "#fff" : "#15803d", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden" }}>
                          <span style={{ flexShrink: 0 }}>📄</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{xmltvFileName}</span>
                        </button>
                        <button onClick={() => xmltvFileRef.current?.click()}
                          style={{ background: "none", border: "none", fontSize: 12, color: "#9ca3af", cursor: "pointer", padding: "2px 4px", flexShrink: 0, textDecoration: "underline" }}>
                          Change
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => xmltvFileRef.current?.click()}
                        style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, color: "#374151", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                        <span>📂</span>
                        <span>Upload .xml file</span>
                      </button>
                    )}
                    <span style={{ color: "#9ca3af", display: "flex", alignItems: "center", fontSize: 13, flexShrink: 0 }}>or</span>
                    <input
                      value={xmltvUrl}
                      onChange={e => setXmltvUrl(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && loadXmltvUrl()}
                      placeholder="https://example.com/epg.xml"
                      style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none" }}
                    />
                    <button onClick={loadXmltvUrl} disabled={xmltvLoading || !xmltvUrl.trim()}
                      style={{ background: "#0f172a", color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0, opacity: !xmltvUrl.trim() ? 0.4 : 1 }}>
                      {xmltvLoading ? "Loading…" : "Load"}
                    </button>
                  </div>
                  {xmltvError && <p style={{ margin: 0, fontSize: 13, color: "#ef4444" }}>{xmltvError}</p>}
                  {xmltvLoading && !xmltvParsed && <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>Parsing…</p>}
                  {xmltvRawOpen && xmltvRawText && (
                    <div style={{ marginTop: 10, border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ background: "#0f172a", padding: "8px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", fontFamily: "monospace" }}>{xmltvFileName || xmltvUrl}</span>
                        <button onClick={() => setXmltvRawOpen(false)} style={{ background: "none", border: "none", color: "#64748b", fontSize: 16, cursor: "pointer", lineHeight: 1, padding: 0 }}>✕</button>
                      </div>
                      <pre style={{ margin: 0, padding: 16, maxHeight: 360, overflowY: "auto", fontSize: 11, lineHeight: 1.6, color: "#334155", background: "#f8fafc", fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                        {xmltvRawText}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Step 2: channel mapping */}
                {xmltvParsed && (
                  <>
                    <div style={{ marginBottom: 20, padding: "12px 16px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                      <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>
                        Found <strong>{Object.keys(xmltvParsed.channels).length}</strong> channel{Object.keys(xmltvParsed.channels).length !== 1 ? "s" : ""} · <strong>{xmltvParsed.programmes.length.toLocaleString()}</strong> programs
                      </p>
                    </div>

                    <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#374151" }}>2. Map XMLTV channels to your live streams</p>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto", gap: 0, background: "#f8fafc", padding: "8px 16px", borderBottom: "1px solid #e2e8f0" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>XMLTV Channel</span>
                        <span />
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Map to</span>
                        <span />
                      </div>
                      {Object.entries(xmltvParsed.channels).map(([xId, xName]) => {
                        const progCount = xmltvParsed.programmes.filter(p => p.channel === xId).length;
                        const isPreviewing = xmltvPreviewChannel === xId;
                        return (
                          <div key={xId} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr auto", gap: 12, alignItems: "center", padding: "10px 16px", borderBottom: "1px solid #f1f5f9" }}>
                            <div>
                              <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#0f172a" }}>{xName}</p>
                              <p style={{ margin: "1px 0 0", fontSize: 11, color: "#9ca3af" }}>{progCount} program{progCount !== 1 ? "s" : ""}</p>
                            </div>
                            <span style={{ color: "#9ca3af", fontSize: 16 }}>→</span>
                            <select
                              value={xmltvChannelMap[xId] || ""}
                              onChange={e => setXmltvChannelMap(m => ({ ...m, [xId]: e.target.value ? Number(e.target.value) : undefined }))}
                              style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 10px", fontSize: 13, background: xmltvChannelMap[xId] ? "#f0fdf4" : "#fff", color: xmltvChannelMap[xId] ? "#15803d" : "#374151" }}>
                              <option value="">— Skip —</option>
                              {liveList.map(ch => (
                                <option key={ch.id} value={ch.id}>{ch.channel_number ? `CH ${ch.channel_number} · ` : ""}{ch.title}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => setXmltvPreviewChannel(isPreviewing ? null : xId)}
                              style={{ background: isPreviewing ? "#4f46e5" : "#f1f5f9", border: `1px solid ${isPreviewing ? "#4f46e5" : "#e2e8f0"}`, borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, color: isPreviewing ? "#fff" : "#374151", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
                              {isPreviewing ? "▲ Hide" : "▼ Preview"}
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Program preview */}
                    {xmltvPreviewChannel && (() => {
                      const progs = xmltvParsed.programmes
                        .filter(p => p.channel === xmltvPreviewChannel)
                        .sort((a, b) => a.start_time - b.start_time);
                      return (
                        <div style={{ marginBottom: 20, border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                          <div style={{ background: "#f8fafc", padding: "10px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0f172a" }}>
                              {xmltvParsed.channels[xmltvPreviewChannel]} · {progs.length} programs
                            </p>
                            <button onClick={() => setXmltvPreviewChannel(null)} style={{ background: "none", border: "none", color: "#9ca3af", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 0 }}>✕</button>
                          </div>
                          <div style={{ maxHeight: 300, overflowY: "auto" }}>
                            {progs.map((p, i) => {
                              const durMins = Math.round((p.end_time - p.start_time) / 60000);
                              return (
                                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 16px", borderBottom: "1px solid #f1f5f9" }}>
                                  <div style={{ flexShrink: 0, textAlign: "right", minWidth: 100 }}>
                                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{p.start_time.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                                    <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>{p.start_time.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}</p>
                                    <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>{durMins}m</p>
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</p>
                                    {p.description && <p style={{ margin: 0, fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.description}</p>}
                                  </div>
                                  {p.thumbnail && <img src={p.thumbnail} alt="" style={{ width: 60, height: 34, objectFit: "cover", borderRadius: 4, flexShrink: 0 }} onError={e => e.target.style.display = "none"} />}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Summary + import */}
                    {(() => {
                      const mappedCount = xmltvParsed.programmes.filter(p => xmltvChannelMap[p.channel]).length;
                      return (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
                          <p style={{ margin: 0, fontSize: 13, color: mappedCount > 0 ? "#15803d" : "#6b7280" }}>
                            {mappedCount > 0
                              ? `${mappedCount.toLocaleString()} programs ready to import`
                              : "Map at least one channel to import"}
                          </p>
                          <button
                            onClick={importXmltv}
                            disabled={xmltvImporting || mappedCount === 0}
                            style={{ background: mappedCount > 0 ? "#4f46e5" : "#e2e8f0", color: mappedCount > 0 ? "#fff" : "#9ca3af", border: "none", borderRadius: 8, padding: "10px 22px", fontSize: 14, fontWeight: 700, cursor: mappedCount > 0 ? "pointer" : "not-allowed", flexShrink: 0, minWidth: 160 }}>
                            {xmltvImporting ? "Importing…" : `Import ${mappedCount > 0 ? mappedCount.toLocaleString() : ""} Programs`}
                          </button>
                        </div>
                      );
                    })()}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    )}
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
