import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../supabase";
import { Wordmark } from "./Wordmark";
import { IS_DEV_DB } from "./EnvBadge";
import { SUPABASE_URL } from "../lib/config";
import { ImageUploader } from "./ImageUploader";
import {
  PAD,
  EMPTY_ROW,
  EMPTY_SHOW,
  EMPTY_EPISODE,
  EMPTY_CAROUSEL,
  EMPTY_CHANNEL,
  EMPTY_LIVE_STREAM,
  EMPTY_PODCAST,
  EMPTY_PODCAST_EPISODE,
} from "./cms/constants";
import FeedsPanel from "./cms/FeedsPanel";
import FlagsPanel from "./cms/FlagsPanel";
import StoragePanel from "./cms/StoragePanel";

const EMPTY_AD = {
  name: "",
  tag_url: "",
  ad_type: "pre_roll",
  scope: "global",
  content_id: "",
  active: true,
};

// SUPABASE_URL comes from lib/config — see the import at the top of this file.

async function getAdminToken() {
  await supabase.auth.getUser(); // validates + auto-refreshes if expired
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

// Reusable "Peep Premium" toggle for content forms (movies, series, channels)
function PremiumToggleButton({ on, onToggle }) {
  return (
    <button type="button" onClick={onToggle}
      style={{ width: "100%", background: on ? "rgba(250,204,21,0.12)" : "#f8fafc", border: `1px solid ${on ? "#facc15" : "#e2e8f0"}`, borderRadius: 8, padding: "11px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}>
      <span style={{ fontSize: 16 }}>{on ? "🔒" : "🔓"}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: on ? "#a16207" : "#374151" }}>Peep Premium</div>
        <div style={{ fontSize: 11, color: "#6b7280" }}>{on ? "Locked — subscribers only" : "Free — available to everyone"}</div>
      </div>
      <div style={{ width: 40, height: 22, borderRadius: 999, background: on ? "#facc15" : "#cbd5e1", position: "relative", flexShrink: 0 }}>
        <span style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.15s" }} />
      </div>
    </button>
  );
}

// Preview-tier picker for content forms. Production = live for all; Stage/Test = only
// accounts at that tier (or higher) see it.
function TierSelect({ value, onChange }) {
  const opts = [
    { v: "production", l: "Production", d: "All users", c: "#22c55e" },
    { v: "test", l: "Test", d: "Test accounts only", c: "#a855f7" },
  ];
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 11, color: "#6b7280", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Tier</label>
      <div style={{ display: "flex", gap: 8 }}>
        {opts.map(o => {
          const active = (value || "production") === o.v;
          return (
            <button key={o.v} type="button" onClick={() => onChange(o.v)}
              style={{ flex: 1, background: active ? `${o.c}1f` : "#f8fafc", border: `1.5px solid ${active ? o.c : "#e2e8f0"}`, borderRadius: 9, padding: "9px 8px", cursor: "pointer", textAlign: "left" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: active ? o.c : "#374151" }}>{o.l}</div>
              <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 1 }}>{o.d}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Top-level admin categories. Each maps to existing internal render state (tab + sub-tab),
// so the underlying feature blocks stay untouched — only the navigation is reorganized.
const ADMIN_NAV = [
  { key: "feeds", label: "Feeds", color: "#ef4444", target: { tab: "live", liveSubTab: "feeds" } },
  { key: "channels", label: "Channels", color: "#ef4444", target: { tab: "live", liveSubTab: "channels" } },
  { key: "epg", label: "EPG", color: "#f59e0b", target: { tab: "live", liveSubTab: "channels" } },
  { key: "shows", label: "Shows", color: "#3b82f6", sections: [
    { key: "series", label: "Series", target: { tab: "content", videoSubTab: "series" } },
    { key: "episodes", label: "Episodes", target: { tab: "content", videoSubTab: "episodes" } },
  ] },
  { key: "vod", label: "VOD", color: "#4f46e5", sections: [
    { key: "movies", label: "Movies", target: { tab: "content", videoSubTab: "shorts" } },
    { key: "podcasts", label: "Podcasts", target: { tab: "content", videoSubTab: "podcasts" } },
    { key: "carousels", label: "Carousels", target: { tab: "content", videoSubTab: "carousels" } },
  ] },
  { key: "regions", label: "Regions & Packages", color: "#14b8a6", scaffold: { icon: "🌍", blurb: "Define subscription packages and tiers, and control regional (geo) availability of content." } },
  { key: "commercial", label: "Commercial", color: "#a855f7", target: { tab: "analytics", analyticsTab: "ads" } },
  { key: "resources", label: "Resources", color: "#0ea5e9", scaffold: { icon: "📄", blurb: "Manage static pages and help content — FAQ, legal, about, and support articles." } },
  { key: "devices", label: "Devices", color: "#64748b", scaffold: { icon: "📱", blurb: "Manage supported device platforms and app builds — web, mobile, Roku, Fire TV, and more." } },
  { key: "streaming", label: "Streaming", color: "#ec4899", sections: [
    { key: "streams", label: "Live Streams", target: { tab: "live", liveSubTab: "streams" } },
    { key: "applications", label: "Applications", target: { tab: "live", liveSubTab: "applications" } },
    { key: "partners", label: "Partners", target: { tab: "creators", creatorsTab: "list" } },
  ] },
  { key: "reports", label: "Reports", color: "#34d399", sections: [
    { key: "content", label: "Content Reports", target: { tab: "moderation" } },
    { key: "analytics", label: "Analytics", target: { tab: "analytics", analyticsTab: "reports" } },
  ] },
  { key: "system", label: "System", color: "#eab308", sections: [
    { key: "members", label: "Members", target: { tab: "members", membersTab: "users" } },
    { key: "subs", label: "Subscriptions", target: { tab: "members", membersTab: "subscriptions" } },
    { key: "support", label: "Support", target: { tab: "members", membersTab: "support" } },
    { key: "storage", label: "Storage", target: { tab: "storage" } },
    { key: "flags", label: "Feature Flags", target: { tab: "flags" } },
    { key: "audit", label: "Audit Log", target: { tab: "audit" } },
    { key: "settings", label: "Settings", target: { tab: "settings" } },
    { key: "security", label: "Security", target: { tab: "security" } },
  ] },
];

// Uploads a file to the public "content" storage bucket and returns its URL.
function UploadButton({ onUploaded, accept = "image/*", label = "Upload" }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  async function pick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("content").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { alert("Upload failed: " + error.message + "\n\n(Did you create the 'content' bucket yet?)"); setBusy(false); e.target.value = ""; return; }
    const { data: { publicUrl } } = supabase.storage.from("content").getPublicUrl(path);
    onUploaded(publicUrl);
    setBusy(false);
    e.target.value = "";
  }
  return (
    <>
      <button type="button" onClick={() => ref.current?.click()} disabled={busy}
        style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 7, padding: "0 14px", color: "#4f46e5", fontSize: 12, fontWeight: 600, cursor: busy ? "wait" : "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
        {busy ? "Uploading…" : `↑ ${label}`}
      </button>
      <input ref={ref} type="file" accept={accept} style={{ display: "none" }} onChange={pick} />
    </>
  );
}

export function CMS({ onExit, currentUser }) {
  const [tab, setTab] = useState("content");
  const [videoSubTab, setVideoSubTab] = useState("shorts"); // "shorts" | "series" | "episodes" | "carousels" | "podcasts" | "music"
  const [section, setSection] = useState("vod"); // top-level admin category (see ADMIN_NAV)
  const [openMenu, setOpenMenu] = useState(null); // which category dropdown is open
  const [analyticsTab, setAnalyticsTab] = useState("reports"); // "reports" | "ads"
  const [membersTab, setMembersTab] = useState("users"); // "users" | "subscriptions" | "support"
  const [creatorsTab, setCreatorsTab] = useState("list"); // "list" | "review" | "payouts"
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
  const [carouselPageTab, setCarouselPageTab] = useState("home"); // which screen's rows the carousel admin is showing
  const [homeHeroForm, setHomeHeroForm] = useState({ enabled: false, image_url: "", video_url: "", title: "", subtitle: "", badge: "", cta_type: "none", cta_label: "", cta_value: "" });
  const [homeHeroSaving, setHomeHeroSaving] = useState(false);
  const [homeHeroOpen, setHomeHeroOpen] = useState(false);
  const carouselsOnPage = (page) => carousels.filter(c => (c.pages || "home").split(",").map(p => p.trim()).includes(page));
  const [editingCarouselId, setEditingCarouselId] = useState(null);
  const [carouselForm, setCarouselForm] = useState(EMPTY_CAROUSEL);
  const [carouselSaving, setCarouselSaving] = useState(false);
  const carouselSaveRef = useRef(false); // hard guard against double-submit duplicates
  const suppressCarouselRT = useRef(false); // ignore our own realtime echoes during a reorder
  const [dragCarouselIdx, setDragCarouselIdx] = useState(null); // drag-to-reorder source (index within current page)
  const [dragOverCarouselIdx, setDragOverCarouselIdx] = useState(null);
  const [deleteCarouselConfirm, setDeleteCarouselConfirm] = useState(null);
  const [handpickedSearch, setHandpickedSearch] = useState("");
  const [handpickedSelected, setHandpickedSelected] = useState([]); // [{id, type, title, thumbnail}]
  
  // Shows state
  const [showsList, setShowsList] = useState([]);
  const [showsLoading, setShowsLoading] = useState(true);
  const [videosList, setVideosList] = useState([]);
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

  // RSS import state
  const [rssOpen, setRssOpen] = useState(false);
  const [rssUrl, setRssUrl] = useState("");
  const [rssLoading, setRssLoading] = useState(false);
  const [rssPreview, setRssPreview] = useState(null);
  const [rssImporting, setRssImporting] = useState(false);
  const [rssError, setRssError] = useState(null);
  const [rssSyncTarget, setRssSyncTarget] = useState(null); // existing podcast when re-syncing

  // Podcast Episodes state
  const [selectedPodcastForEp, setSelectedPodcastForEp] = useState(null);
  const [podEpList, setPodEpList] = useState([]);
  const [podEpLoading, setPodEpLoading] = useState(false);
  const [editingPodEpId, setEditingPodEpId] = useState(null);
  const [podEpForm, setPodEpForm] = useState(EMPTY_PODCAST_EPISODE);
  const [podEpSaving, setPodEpSaving] = useState(false);
  const [deletePodEpConfirm, setDeletePodEpConfirm] = useState(null);

  // Live Streams state
  const [liveSubTab, setLiveSubTab] = useState("streams");
  const [applications, setApplications] = useState([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [approvingId, setApprovingId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [appRejectNote, setAppRejectNote] = useState("");
  const [rejectTarget, setRejectTarget] = useState(null);
  const [revealedKeys, setRevealedKeys] = useState({});
  const [liveList, setLiveList] = useState([]);
  const [liveLoading, setLiveLoading] = useState(true);
  const [editingLiveId, setEditingLiveId] = useState(null);
  const [liveForm, setLiveForm] = useState(EMPTY_LIVE_STREAM);
  const [channelList, setChannelList] = useState([]);
  const [channelFeeds, setChannelFeeds] = useState([]); // live_feeds for the "Linked Feed" dropdown
  const [channelLoading, setChannelLoading] = useState(false);
  const [editingChannelId, setEditingChannelId] = useState(null);
  const [channelForm, setChannelForm] = useState(EMPTY_CHANNEL);
  const [channelSaving, setChannelSaving] = useState(false);
  const [liveSaving, setLiveSaving] = useState(false);
  const [deleteLiveConfirm, setDeleteLiveConfirm] = useState(null);
  const [deletePlaylistConfirm, setDeletePlaylistConfirm] = useState(null);
  const [deletingPlaylist, setDeletingPlaylist] = useState(false);
  const [channelStatuses, setChannelStatuses] = useState({});
  const [testingChannels, setTestingChannels] = useState(false);
  const [testProgress, setTestProgress] = useState({ done: 0, total: 0 });
  // Health check for the Fast Channels (channels table)
  const [fastChannelStatuses, setFastChannelStatuses] = useState({});
  const [testingFastChannels, setTestingFastChannels] = useState(false);
  const [fastTestProgress, setFastTestProgress] = useState({ done: 0, total: 0 });
  const [m3uOpen, setM3uOpen] = useState(false);
  const [m3uUrl, setM3uUrl] = useState("");
  const [m3uFetching, setM3uFetching] = useState(false);
  const [m3uChannels, setM3uChannels] = useState([]);
  const [m3uSelected, setM3uSelected] = useState(new Set());
  const [m3uError, setM3uError] = useState("");
  const [m3uSearch, setM3uSearch] = useState("");
  const [m3uCategoryFilter, setM3uCategoryFilter] = useState("All");
  const [m3uPage, setM3uPage] = useState(0);
  const [m3uImporting, setM3uImporting] = useState(false);
  const [m3uImportProgress, setM3uImportProgress] = useState({ done: 0, total: 0 });
  const [m3uImportResult, setM3uImportResult] = useState(null);
  const [m3uSourceLabel, setM3uSourceLabel] = useState("");
  const m3uFileInputRef = useRef(null);

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

  // Creators state
  const [creatorsList, setCreatorsList] = useState([]);
  const [creatorsLoading, setCreatorsLoading] = useState(false);
  const [creatorModal, setCreatorModal] = useState(false);
  const [editingCreator, setEditingCreator] = useState(null);
  const [creatorForm, setCreatorForm] = useState({ name: "", email: "", payment_method: "PayPal", payment_handle: "", routing_number: "", status: "active", notes: "", agreement_signed_at: "" });
  const [creatorSaving, setCreatorSaving] = useState(false);
  const [deleteCreatorConfirm, setDeleteCreatorConfirm] = useState(null);
  const [resendingInvite, setResendingInvite] = useState(false);

  // Payouts state
  const [payoutMonth, setPayoutMonth] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  });
  const [payoutData, setPayoutData] = useState([]);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutView, setPayoutView] = useState("current"); // "current" | "history"
  const [showPayoutInfo, setShowPayoutInfo] = useState(false);
  const [payoutHistory, setPayoutHistory] = useState([]);
  const [payoutHistoryLoading, setPayoutHistoryLoading] = useState(false);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [fetchingRevenue, setFetchingRevenue] = useState(false);

  // Content-creator links state
  const [contentCreators, setContentCreators] = useState([]);
  const [contentCreatorsLoading, setContentCreatorsLoading] = useState(false);

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

  // Content moderation state
  const [contentReports, setContentReports] = useState([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsFilter, setReportsFilter] = useState("pending");
  const [globalBannedWords, setGlobalBannedWords] = useState([]);
  const [bannedWordInput, setBannedWordInput] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportNotes, setReportNotes] = useState("");
  const [reporterProfile, setReporterProfile] = useState(null);
  const [notesSaving, setNotesSaving] = useState(false);
  const [reportVods, setReportVods] = useState([]);
  const [reportVodsLoading, setReportVodsLoading] = useState(false);
  const [reportPlayingVod, setReportPlayingVod] = useState(null);

  // Subscriptions state
  const [subs, setSubs] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState(null);
  const [subSearch, setSubSearch] = useState("");
  const [subStatusFilter, setSubStatusFilter] = useState("all");
  const [subSort, setSubSort] = useState({ col: "created_at", dir: "desc" });

  // Users state
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersSearch, setUsersSearch] = useState("");
  const [deleteUserConfirm, setDeleteUserConfirm] = useState(null);
  const [deletingUser, setDeletingUser] = useState(false);

  // Support tab state
  const [supportSearch, setSupportSearch] = useState("");
  const [supportResults, setSupportResults] = useState([]);
  const [supportSearching, setSupportSearching] = useState(false);
  const [supportUser, setSupportUser] = useState(null); // selected user detail
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportAction, setSupportAction] = useState(null); // "grant"|"revoke"|"delete"|"reset"
  const [supportActionLoading, setSupportActionLoading] = useState(false);
  const [supportActionMsg, setSupportActionMsg] = useState(null);
  const [supportDeleteConfirm, setSupportDeleteConfirm] = useState(false);

  // The Boss state
  const [promos, setPromos] = useState([]);
  const [promosLoading, setPromosLoading] = useState(false);
  const [promoForm, setPromoForm] = useState({ name: "", code: "" });
  const [promoSaving, setPromoSaving] = useState(false);
  const [bossSettings, setBossSettings] = useState({ maintenance_mode: "false", banner_active: "false", banner_text: "", banner_expires_at: "" });
  const [bossTodos, setBossTodos] = useState([]);
  const [newTodo, setNewTodo] = useState("");
  const [newTodoLabel, setNewTodoLabel] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [newGoalLabel, setNewGoalLabel] = useState("");
  const [grantEmail, setGrantEmail] = useState("");
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantResult, setGrantResult] = useState(null);
  const [loginAttempts, setLoginAttempts] = useState([]);
  const [bossView, setBossView] = useState("main"); // "main" | "security" | "creators" | "payouts" | "review"
  const [reviewEpisodes, setReviewEpisodes] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [rejectModal, setRejectModal] = useState(null); // episode row
  const [rejectNote, setRejectNote] = useState("");
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

  const categories = ["Strange", "Conspiracy", "Space", "Paranormal", "Animation", "Comedy", "Documentary", "Found Footage", "Cult", "Experimental", "Public Access", "Horror"];
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
    loadApplications();
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

  const [refreshingEpg, setRefreshingEpg] = useState(false);
  async function refreshEpgNow() {
    setRefreshingEpg(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/refresh-epg`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: "{}",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      showToast("EPG refresh started — guides update in ~30s");
    } catch (e) {
      showToast("Refresh failed: " + (e?.message || e), "error");
    } finally {
      setRefreshingEpg(false);
    }
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
    if (tab === "analytics") { loadReports(); loadAdAnalytics(); loadTodayStats(); loadOnlineUsers(); }
    if (tab === "members") { loadSubscriptions(); loadUsers(); }
    if (tab === "settings") { loadPromos(); loadBossSettings(); supabase.from("episodes").select("id", { count: "exact", head: true }).eq("status", "pending").then(({ count }) => setPendingCount(count || 0)); }
    if (tab === "security") loadSecurityData();
    if (tab === "moderation") loadContentReports();
    if (tab === "creators") { loadCreators(); loadContentCreators(); }
    if (tab === "storage") {
      supabase.from("videos").select("id, title").order("title").then(({ data }) => setVideosList(data || []));
      supabase.from("shows").select("id, title").order("title").then(({ data }) => setShowsList(prev => prev.length ? prev : (data || [])));
    }
  }, [tab]);

  useEffect(() => {
    if (tab !== "creators") return;
    if (creatorsTab === "list") { loadCreators(); loadContentCreators(); }
    if (creatorsTab === "payouts") { loadPayoutHistory(); loadPayouts(); }
    if (creatorsTab === "review") { loadReviewQueue(); }
  }, [creatorsTab]);

  useEffect(() => {
    if (liveSubTab === "applications") loadApplications();
    if (liveSubTab === "channels") loadChannels();
  }, [liveSubTab]);

  useEffect(() => {
    if (tab !== "analytics") return;
    const fiveMin = setInterval(() => { loadAdAnalytics(); loadReports(); loadTodayStats(); }, 5 * 60 * 1000);
    const oneMin = setInterval(() => { loadTodayStats(); loadOnlineUsers(); }, 60 * 1000);
    return () => { clearInterval(fiveMin); clearInterval(oneMin); };
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
      const { data } = await supabase.from("profiles").select("id, username, email, created_at, role, is_admin").or(`email.ilike.%${query}%,username.ilike.%${query}%`).limit(10);
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
        .select("id, email, username, full_name")
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

  async function setUserAccessTier(userId, tier) {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, access_tier: tier } : u));
    const { error } = await supabase.from("profiles").update({ access_tier: tier }).eq("id", userId);
    if (error) { showToast("Failed: " + error.message, "error"); loadUsers(); }
    else { showToast(`Tier → ${tier}`); logAudit?.("update", "profile", userId, `access_tier → ${tier}`); }
  }

  async function loadUsers() {
    setUsersLoading(true);
    const { data: profileData } = await supabase.from("profiles").select("id, full_name, email, username, created_at, access_tier").order("created_at", { ascending: false });
    const profiles = profileData || [];
    if (!profiles.length) { setUsers([]); setUsersLoading(false); return; }
    const ids = profiles.map(p => p.id);
    const [{ data: subData }, { data: streamerData }] = await Promise.all([
      supabase.from("subscriptions").select("user_id, status, plan").in("user_id", ids),
      supabase.from("live_streams").select("user_id").in("user_id", ids),
    ]);
    const subMap = {};
    (subData || []).forEach(s => { subMap[s.user_id] = s; });
    const streamerSet = new Set((streamerData || []).map(s => s.user_id));
    setUsers(profiles.map(p => ({ ...p, subscription: subMap[p.id] || null, isStreamer: streamerSet.has(p.id) })));
    setUsersLoading(false);
  }

  async function deleteUser(user_id) {
    setDeletingUser(true);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ user_id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setUsers(prev => prev.filter(u => u.id !== user_id));
      setDeleteUserConfirm(null);
      showToast("User deleted");
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
    setDeletingUser(false);
  }

  async function searchSupportUsers(query) {
    if (!query.trim()) { setSupportResults([]); return; }
    setSupportSearching(true);
    const q = query.trim();
    const isUuid = /^[0-9a-f-]{8,}$/i.test(q);
    const { data } = await supabase.from("profiles").select("id, full_name, email, username, created_at")
      .or(isUuid ? `id.eq.${q},email.ilike.%${q}%,full_name.ilike.%${q}%` : `email.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(10);
    let results = data || [];

    // If UUID search found nothing in profiles, check subscriptions + presence
    if (isUuid && results.length === 0) {
      const [{ data: sub }, { data: presence }] = await Promise.all([
        supabase.from("subscriptions").select("user_id, email, created_at").eq("user_id", q).maybeSingle(),
        supabase.from("user_presence").select("user_id, last_seen").eq("user_id", q).maybeSingle(),
      ]);
      if (sub || presence) {
        results = [{ id: q, full_name: null, email: sub?.email || null, username: null, created_at: sub?.created_at || null, _ghost: true }];
      }
    }

    setSupportResults(results);
    setSupportSearching(false);
  }

  async function loadSupportUser(profile) {
    setSupportUser(null);
    setSupportLoading(true);
    setSupportActionMsg(null);
    setSupportDeleteConfirm(false);
    const [{ data: sub }, { data: presence }, { data: vprofiles }, { data: watchData }] = await Promise.all([
      supabase.from("subscriptions").select("*").eq("user_id", profile.id).maybeSingle(),
      supabase.from("user_presence").select("last_seen, current_page").eq("user_id", profile.id).maybeSingle(),
      supabase.from("viewer_profiles").select("id, name, avatar_id").eq("user_id", profile.id),
      supabase.from("watch_progress").select("id").eq("user_id", profile.id),
    ]);
    setSupportUser({ ...profile, subscription: sub || null, presence: presence || null, viewer_profiles: vprofiles || [], watch_count: watchData?.length || 0 });
    setSupportLoading(false);
  }

  async function supportGrantAccess() {
    setSupportActionLoading(true); setSupportActionMsg(null);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/grant-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ email: supportUser.email }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSupportActionMsg({ ok: true, text: "Free access granted" });
      loadSupportUser(supportUser);
    } catch (err) { setSupportActionMsg({ ok: false, text: err.message }); }
    setSupportActionLoading(false);
  }

  async function supportRevokeAccess() {
    setSupportActionLoading(true); setSupportActionMsg(null);
    try {
      const { error } = await supabase.from("subscriptions").delete().eq("user_id", supportUser.id);
      if (error) throw new Error(error.message);
      setSupportActionMsg({ ok: true, text: "Access revoked" });
      loadSupportUser(supportUser);
    } catch (err) { setSupportActionMsg({ ok: false, text: err.message }); }
    setSupportActionLoading(false);
  }

  async function supportSendPasswordReset() {
    setSupportActionLoading(true); setSupportActionMsg(null);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-reset-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ email: supportUser.email }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSupportActionMsg({ ok: true, text: `Password reset email sent to ${supportUser.email}` });
    } catch (err) { setSupportActionMsg({ ok: false, text: err.message }); }
    setSupportActionLoading(false);
  }

  async function supportDeleteUser() {
    setSupportActionLoading(true); setSupportActionMsg(null);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ user_id: supportUser.id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSupportUser(null);
      setSupportResults(prev => prev.filter(u => u.id !== supportUser.id));
      setSupportActionMsg({ ok: true, text: "Account deleted" });
      setSupportDeleteConfirm(false);
    } catch (err) { setSupportActionMsg({ ok: false, text: err.message }); }
    setSupportActionLoading(false);
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

  async function loadContentReports() {
    setReportsLoading(true);
    const { data } = await supabase.from("content_reports").select("*").order("created_at", { ascending: false }).limit(200);
    setContentReports(data || []);
    const { data: setting } = await supabase.from("app_settings").select("value").eq("key", "global_banned_words").maybeSingle();
    if (setting?.value) { try { setGlobalBannedWords(JSON.parse(setting.value)); } catch {} }
    setReportsLoading(false);
  }

  async function updateReportStatus(id, status) {
    await supabase.from("content_reports").update({ status, reviewed_at: new Date().toISOString() }).eq("id", id);
    setContentReports(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    if (selectedReport?.id === id) setSelectedReport(prev => ({ ...prev, status }));
  }

  async function deleteReport(id) {
    await supabase.from("content_reports").delete().eq("id", id);
    setContentReports(prev => prev.filter(r => r.id !== id));
    if (selectedReport?.id === id) { setSelectedReport(null); setDrawerOpen(false); }
  }

  async function openReportDrawer(report) {
    setSelectedReport(report);
    setReportNotes(report.notes || "");
    setReporterProfile(null);
    setReportVods([]);
    setReportPlayingVod(null);
    setDrawerFormType("report");
    setDrawerOpen(true);

    // Load reporter profile and all streams in parallel
    const [profileRes, streamsRes] = await Promise.all([
      report.reporter_id
        ? supabase.from("profiles").select("username, full_name, avatar_url").eq("id", report.reporter_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("live_streams").select("*"),
    ]);
    setReporterProfile(profileRes.data ?? false);

    // Match using the same slug logic as StreamerProfile
    const matchedStream = (streamsRes.data || []).find(s => {
      const slug = s.slug || s.username || (s.channel_name || s.title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
      return slug === report.content_id;
    });
    const streamUid = matchedStream?.stream_uid;
    if (streamUid) {
      setReportVodsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;
        const prevUids = matchedStream?.previous_stream_uids;
        const prevParam = Array.isArray(prevUids) && prevUids.length
          ? `&previous_uids=${prevUids.join(",")}`
          : "";
        const res = await fetch(`${SUPABASE_URL}/functions/v1/get-vods?stream_uid=${streamUid}${prevParam}`, {
          headers: { "Authorization": `Bearer ${token}` },
        });
        const json = await res.json();
        setReportVods(json.vods || []);
      } catch (_) {}
      setReportVodsLoading(false);
    }
  }

  async function saveReportNotes() {
    if (!selectedReport) return;
    setNotesSaving(true);
    await supabase.from("content_reports").update({ notes: reportNotes }).eq("id", selectedReport.id);
    setContentReports(prev => prev.map(r => r.id === selectedReport.id ? { ...r, notes: reportNotes } : r));
    setNotesSaving(false);
  }

  async function saveGlobalBannedWords(words) {
    await supabase.from("app_settings").upsert({ key: "global_banned_words", value: JSON.stringify(words), updated_at: new Date().toISOString() }, { onConflict: "key" });
    setGlobalBannedWords(words);
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

  const TODO_LABELS = [
    { name: "Legal", color: "#3b82f6" },
    { name: "Tech", color: "#7c3aed" },
    { name: "Business", color: "#fb923c" },
    { name: "Content", color: "#10b981" },
    { name: "Finance", color: "#06b6d4" },
  ];

  const DEFAULT_TODOS = [
    { id: "t1", text: "Form LLC", done: false, section: "todo", label: "Legal" },
    { id: "t2", text: "Register DMCA agent at copyright.gov ($6)", done: false, section: "todo", label: "Legal" },
    { id: "t3", text: "Set up Terms of Service + Privacy Policy", done: false, section: "todo", label: "Legal" },
    { id: "t4", text: "Write creator agreement template", done: false, section: "todo", label: "Legal" },
    { id: "t5", text: "Set up Stripe for subscriptions", done: true, section: "todo", label: "Tech" },
    { id: "g1", text: "First licensed content on platform", done: false, section: "goal", label: "Content" },
    { id: "g2", text: "Legal Team", done: false, section: "goal", label: "Legal" },
    { id: "g3", text: "Content Licensing Team", done: false, section: "goal", label: "Content" },
    { id: "g4", text: "Marketing/Growth Team + Customer Support", done: false, section: "goal", label: "Business" },
    { id: "g5", text: "Finance/Accounting Team", done: false, section: "goal", label: "Finance" },
  ];

  async function loadBossSettings() {
    const { data } = await supabase.from("app_settings").select("key, value");
    const s = {};
    (data || []).forEach(r => { s[r.key] = r.value; });
    setBossSettings(prev => ({ ...prev, ...s }));
    const todosRow = (data || []).find(r => r.key === "boss_todos");
    const parsed = todosRow ? JSON.parse(todosRow.value) : DEFAULT_TODOS;
    setBossTodos(parsed.map(t => ({ section: "todo", label: "", ...t })));
  }

  async function saveTodos(todos) {
    setBossTodos(todos);
    await supabase.from("app_settings").upsert({ key: "boss_todos", value: JSON.stringify(todos), updated_at: new Date().toISOString() }, { onConflict: "key" });
  }

  function toggleTodo(id) {
    saveTodos(bossTodos.map(t => t.id === id ? { ...t, done: !t.done } : t));
  }

  function deleteTodo(id) {
    saveTodos(bossTodos.filter(t => t.id !== id));
  }

  function addTodo() {
    if (!newTodo.trim()) return;
    saveTodos([...bossTodos, { id: Date.now().toString(), text: newTodo.trim(), done: false, section: "todo", label: newTodoLabel }]);
    setNewTodo(""); setNewTodoLabel("");
  }

  function addGoal() {
    if (!newGoal.trim()) return;
    saveTodos([...bossTodos, { id: Date.now().toString(), text: newGoal.trim(), done: false, section: "goal", label: newGoalLabel }]);
    setNewGoal(""); setNewGoalLabel("");
  }

  async function saveSetting(key, value) {
    const { error } = await supabase.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) {
      console.error("saveSetting error:", error);
      showToast(`Failed to save setting: ${error.message}`, "error");
      return;
    }
    setBossSettings(prev => ({ ...prev, [key]: value }));
  }

  // ── Home Hero (custom promo banner) ──
  useEffect(() => {
    supabase.from("app_settings").select("value").eq("key", "home_hero").maybeSingle()
      .then(({ data }) => { if (data?.value) { try { setHomeHeroForm(f => ({ ...f, ...JSON.parse(data.value) })); } catch {} } });
  }, []);

  async function saveHomeHero() {
    setHomeHeroSaving(true);
    await saveSetting("home_hero", JSON.stringify(homeHeroForm));
    logAudit("update", "home_hero", "home");
    showToast(homeHeroForm.enabled ? "Home hero saved — live on the home screen" : "Home hero saved (currently off)");
    setHomeHeroSaving(false);
  }

  async function grantAccessByEmail() {
    if (!grantEmail.trim()) return;
    setGrantLoading(true);
    setGrantResult(null);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/grant-access`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
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

  // ──── CREATORS ────


  async function loadCreators() {
    setCreatorsLoading(true);
    const { data } = await supabase.from("creators").select("*").order("created_at", { ascending: false });
    setCreatorsList(data || []);
    setCreatorsLoading(false);
  }

  function parseAgreementDate(notes) {
    const m = (notes || "").match(/\[AGREEMENT:(\d{4}-\d{2}-\d{2})\]/);
    return m ? m[1] : "";
  }

  function buildNotesWithAgreement(notes, dateStr) {
    const stripped = (notes || "").replace(/\[AGREEMENT:\d{4}-\d{2}-\d{2}\]\s*/g, "").trim();
    return dateStr ? `[AGREEMENT:${dateStr}]\n${stripped}` : stripped;
  }

  function openCreatorModal(creator = null) {
    if (creator) {
      setEditingCreator(creator);
      setCreatorForm({ name: creator.name, email: creator.email, payment_method: creator.payment_method || "PayPal", payment_handle: creator.payment_handle || "", routing_number: creator.routing_number || "", status: creator.status, notes: (creator.notes || "").replace(/\[AGREEMENT:\d{4}-\d{2}-\d{2}\]\s*/g, "").trim(), agreement_signed_at: parseAgreementDate(creator.notes) });
    } else {
      setEditingCreator(null);
      setCreatorForm({ name: "", email: "", payment_method: "PayPal", payment_handle: "", status: "active", notes: "", agreement_signed_at: "" });
    }
    setCreatorModal(true);
  }

  async function fetchStripeRevenue() {
    setFetchingRevenue(true);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/get-stripe-revenue`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ month: payoutMonth }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setTotalRevenue(data.revenue);
      showToast(`Pulled $${data.revenue.toFixed(2)} from Stripe for ${payoutMonth}`);
    } catch (err) {
      showToast(err.message, "error");
    }
    setFetchingRevenue(false);
  }

  async function loadReviewQueue() {
    setReviewLoading(true);
    const { data: eps } = await supabase.from("episodes").select("*, shows(title, thumbnail)").eq("status", "pending").order("created_at", { ascending: false });
    if (!eps?.length) { setReviewEpisodes([]); setReviewLoading(false); return; }

    // Look up creator for each show
    const showIds = [...new Set(eps.map(e => String(e.show_id)))];
    const { data: links } = await supabase.from("content_creators").select("content_id, creators(name, email)").eq("content_type", "show").in("content_id", showIds);
    const creatorByShow = {};
    (links || []).forEach(l => { creatorByShow[l.content_id] = l.creators; });

    setReviewEpisodes(eps.map(ep => ({ ...ep, showTitle: ep.shows?.title, showThumb: ep.shows?.thumbnail, creator: creatorByShow[String(ep.show_id)] || null })));
    setReviewLoading(false);
  }

  async function approveEpisode(ep) {
    await supabase.from("episodes").update({ status: "approved" }).eq("id", ep.id);
    setReviewEpisodes(prev => prev.filter(e => e.id !== ep.id));
    setPendingCount(c => Math.max(0, c - 1));
    showToast("Episode approved — it's now live");
    const token = await getAdminToken();
    fetch(`${SUPABASE_URL}/functions/v1/notify-episode-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ type: "approved", episode_id: ep.id }),
    });
  }

  async function rejectEpisode(ep, note) {
    await supabase.from("episodes").update({ status: "rejected", rejection_note: note || null }).eq("id", ep.id);
    setReviewEpisodes(prev => prev.filter(e => e.id !== ep.id));
    setPendingCount(c => Math.max(0, c - 1));
    setRejectModal(null);
    setRejectNote("");
    showToast("Episode rejected — creator notified");
    const token = await getAdminToken();
    fetch(`${SUPABASE_URL}/functions/v1/notify-episode-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ type: "rejected", episode_id: ep.id, rejection_note: note || null }),
    });
  }

  async function saveCreator() {
    if (!creatorForm.name.trim() || !creatorForm.email.trim()) return;
    setCreatorSaving(true);
    try {
      const { agreement_signed_at, notes, ...rest } = creatorForm;
      const payload = { ...rest, email: creatorForm.email.trim().toLowerCase(), notes: buildNotesWithAgreement(notes, agreement_signed_at) };
      if (editingCreator) {
        const { error } = await supabase.from("creators").update(payload).eq("id", editingCreator.id);
        if (error) { showToast(error.message, "error"); return; }
        showToast("Partner updated"); setCreatorModal(false); loadCreators();
      } else {
        const { error } = await supabase.from("creators").insert(payload);
        if (error) { showToast(error.message, "error"); return; }
        loadCreators();
        // Send invite
        try {
          const token = await getAdminToken();
          const invRes = await fetch(`${SUPABASE_URL}/functions/v1/invite-creator`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ name: creatorForm.name.trim(), email: creatorForm.email.trim().toLowerCase() }),
          });
          const invData = await invRes.json();
          if (invData.error) showToast(`Creator added but invite failed: ${invData.error}`, "error");
          else showToast("Partner added — invite email sent");
        } catch (invErr) {
          showToast(`Creator added but invite failed: ${invErr.message}`, "error");
        }
        setCreatorModal(false);
      }
    } finally {
      setCreatorSaving(false);
    }
  }

  async function resendInvite(creator) {
    setResendingInvite(true);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-creator`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ name: creator.name, email: creator.email }),
      });
      const data = await res.json();
      if (data.error) showToast(`Failed: ${data.error}`, "error");
      else showToast("Invite resent successfully");
    } catch (err) {
      showToast(err.message, "error");
    }
    setResendingInvite(false);
  }

  async function deleteCreator(id) {
    await supabase.from("creators").delete().eq("id", id);
    setCreatorsList(c => c.filter(x => x.id !== id));
    setDeleteCreatorConfirm(null);
    showToast("Partner removed");
  }

  // ──── CONTENT-CREATOR LINKS ────

  async function loadContentCreators() {
    setContentCreatorsLoading(true);
    const { data } = await supabase.from("content_creators").select("*");
    setContentCreators(data || []);
    setContentCreatorsLoading(false);
  }

  async function linkCreatorContent(creatorId, contentId, contentType) {
    const { error } = await supabase.from("content_creators").insert([{ creator_id: creatorId, content_id: String(contentId), content_type: contentType }]);
    if (error) { showToast("Failed to link content: " + error.message, "error"); return; }
    await loadContentCreators();
  }

  async function unlinkCreatorContent(id) {
    const { error } = await supabase.from("content_creators").delete().eq("id", id);
    if (error) { showToast("Failed to unlink: " + error.message, "error"); return; }
    await loadContentCreators();
  }

  // ──── PAYOUTS ────

  async function loadPayouts() {
    setPayoutLoading(true);
    const { data: creators } = await supabase.from("creators").select("*");
    if (!creators?.length) { setPayoutData([]); setPayoutLoading(false); return; }

    const monthStart = `${payoutMonth}-01T00:00:00.000Z`;
    const _ms = new Date(monthStart);
    const monthEnd = new Date(Date.UTC(_ms.getUTCFullYear(), _ms.getUTCMonth() + 1, 1)).toISOString();

    const [
      { data: links },
      { data: watchData },
      { data: episodes },
      { data: podEps },
      { data: existingPayouts },
    ] = await Promise.all([
      supabase.from("content_creators").select("*"),
      supabase.from("watch_progress").select("content_id, content_type, progress_seconds, duration_seconds, user_id").gte("first_watched_at", monthStart).lt("first_watched_at", monthEnd),
      supabase.from("episodes").select("id, show_id"),
      supabase.from("podcast_episodes").select("id, podcast_id"),
      supabase.from("creator_payouts").select("*").eq("month", payoutMonth),
    ]);

    // Build map: "content_type:content_id" → creator_id
    const contentToCreator = {};
    (links || []).forEach(l => { contentToCreator[`${l.content_type}:${l.content_id}`] = l.creator_id; });

    // Deduplicate: keep best (highest progress) session per user per content
    const userContentBest = {};
    (watchData || []).forEach(w => {
      const key = `${w.user_id}:${w.content_type}:${w.content_id}`;
      if (!userContentBest[key] || w.progress_seconds > userContentBest[key].progress_seconds) {
        userContentBest[key] = w;
      }
    });

    // 25% threshold: must have watched at least 25% of content to count
    const qualifyingWatches = Object.values(userContentBest).filter(w => {
      if (w.duration_seconds > 0) return w.progress_seconds >= w.duration_seconds * 0.25;
      return w.progress_seconds >= 60; // fallback: at least 1 min if duration unknown
    });

    // Sum watch seconds per creator, track per-user for fraud detection
    const creatorSeconds = {};
    const creatorUserSeconds = {};
    let totalSeconds = 0;
    qualifyingWatches.forEach(w => {
      let creatorId = contentToCreator[`${w.content_type}:${w.content_id}`];
      if (!creatorId && w.content_type === "episode") {
        const ep = (episodes || []).find(e => String(e.id) === String(w.content_id));
        if (ep) creatorId = contentToCreator[`show:${ep.show_id}`];
      }
      if (!creatorId && w.content_type === "podcast_episode") {
        const ep = (podEps || []).find(e => String(e.id) === String(w.content_id));
        if (ep) creatorId = contentToCreator[`podcast:${ep.podcast_id}`];
      }
      if (creatorId) {
        creatorSeconds[creatorId] = (creatorSeconds[creatorId] || 0) + (w.progress_seconds || 0);
        totalSeconds += (w.progress_seconds || 0);
        if (!creatorUserSeconds[creatorId]) creatorUserSeconds[creatorId] = {};
        const uid = w.user_id || "unknown";
        creatorUserSeconds[creatorId][uid] = (creatorUserSeconds[creatorId][uid] || 0) + (w.progress_seconds || 0);
      }
    });

    // Fraud flag: one user accounts for >40% of a creator's watch time
    const fraudFlags = {};
    Object.entries(creatorUserSeconds).forEach(([cId, userMap]) => {
      const total = creatorSeconds[cId] || 0;
      if (total === 0) return;
      const maxUserSecs = Math.max(...Object.values(userMap));
      if (maxUserSecs / total > 0.4) fraudFlags[cId] = Math.round(maxUserSecs / total * 100);
    });

    const creatorPool = +(totalRevenue * 0.5).toFixed(2);

    // Load rollover: previous below-min unpaid months not yet rolled into another payout
    const { data: allPriorPayouts } = await supabase
      .from("creator_payouts")
      .select("id, creator_id, payout_amount, month")
      .lt("month", payoutMonth)
      .is("rolled_into_month", null)
      .neq("status", "paid");

    const rows = creators.map(c => {
      const secs = creatorSeconds[c.id] || 0;
      const watchMins = Math.round(secs / 60);
      const share = totalSeconds > 0 ? secs / totalSeconds : 0;
      const basePayout = +(creatorPool * share).toFixed(2);

      // Accumulate rolled-over below-min amounts
      const rolloverSources = (allPriorPayouts || []).filter(p => p.creator_id === c.id && p.payout_amount < 10);
      const rolloverAmount = +(rolloverSources.reduce((s, p) => s + (p.payout_amount || 0), 0)).toFixed(2);
      const rolloverIds = rolloverSources.map(p => p.id);
      const payout = +(basePayout + rolloverAmount).toFixed(2);

      const saved = (existingPayouts || []).find(p => p.creator_id === c.id);
      return {
        creator: c, watchMins, share: +(share * 100).toFixed(1),
        basePayout, rolloverAmount, rolloverIds, payout,
        status: saved?.status || "unpaid", paid_at: saved?.paid_at || null,
        payout_id: saved?.id || null, fraudFlag: fraudFlags[c.id] || null,
      };
    });

    setPayoutData(rows);
    setPayoutLoading(false);
  }

  async function loadPayoutHistory() {
    setPayoutHistoryLoading(true);
    const { data } = await supabase.from("creator_payouts").select("*").eq("status", "paid").order("month", { ascending: false });
    setPayoutHistory(data || []);
    setPayoutHistoryLoading(false);
  }

  async function togglePayoutStatus(row) {
    const newStatus = row.status === "paid" ? "unpaid" : "paid";

    // Require confirmation before marking unpaid (prevents accidental reversal)
    if (newStatus === "unpaid") {
      if (!window.confirm(`Mark ${row.creator.name}'s ${payoutMonth} payout as UNPAID?\n\nThis reverses a payment already recorded as sent.`)) return;
    }

    const now = new Date().toISOString();
    const payload = {
      creator_id: row.creator.id, creator_name: row.creator.name,
      month: payoutMonth, watch_minutes: row.watchMins, lifetime_subscribers: 0,
      revenue: totalRevenue, platform_cut: +(totalRevenue * 0.5).toFixed(2),
      payout_amount: row.payout,
      rollover_amount: row.rolloverAmount || 0,
      status: newStatus, paid_at: newStatus === "paid" ? now : null,
    };

    let payoutId = row.payout_id;
    if (payoutId) {
      await supabase.from("creator_payouts").update({ status: newStatus, paid_at: payload.paid_at }).eq("id", payoutId);
    } else {
      const { data: inserted } = await supabase.from("creator_payouts").insert(payload).select("id").single();
      payoutId = inserted?.id;
    }

    // Write audit log
    if (payoutId) {
      await supabase.from("payout_audit_log").insert({
        payout_id: payoutId,
        creator_name: row.creator.name,
        month: payoutMonth,
        old_status: row.status,
        new_status: newStatus,
      });
    }

    // When marking paid: mark any rolled-over source months as consumed
    if (newStatus === "paid" && row.rolloverIds?.length) {
      await supabase.from("creator_payouts").update({ rolled_into_month: payoutMonth }).in("id", row.rolloverIds);
    }

    loadPayouts();
    if (newStatus === "paid") loadPayoutHistory();
  }

  function exportPayoutsCSV() {
    const headers = ["Partner", "Email", "Watch Time (mins)", "Watch Share %", "Total Revenue", "Partner Payout", "Status", "Paid Date"];
    const csvRows = payoutData.map(r => [r.creator.name, r.creator.email, r.watchMins, r.share + "%", totalRevenue.toFixed(2), r.payout.toFixed(2), r.status, r.paid_at ? new Date(r.paid_at).toLocaleDateString() : ""].map(v => `"${v}"`));
    const csv = [headers, ...csvRows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `peep-payouts-${payoutMonth}.csv`; a.click();
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
      supabase.from("ratings").select("user_id, content_id, content_type, rating"),
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
    const parseId = (type, id) => type === "movie" ? id : parseInt(id);
    const topWatchedRaw = Object.entries(watchMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([key, count]) => { const [type, ...rest] = key.split(":"); const id = rest.join(":"); return { type, id: parseId(type, id), count }; });
    const topByTimeRaw = Object.entries(watchTimeMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([key, secs]) => { const [type, ...rest] = key.split(":"); const id = rest.join(":"); return { type, id: parseId(type, id), secs }; });

    // Build raw rated + saved before title fetch so all IDs are included
    // Cross-reference content_type from watch_progress since ratings table may not have it
    const watchTypeMap = {};
    (watchData || []).forEach(w => { if (w.content_id && w.content_type) watchTypeMap[w.content_id] = w.content_type; });
    const ratingMap = {};
    (ratingsData || []).forEach(r => {
      if (r.rating >= 4) {
        const ctype = r.content_type || watchTypeMap[r.content_id] || null;
        if (!ctype) return;
        const key = `${ctype}:${r.content_id}`;
        ratingMap[key] = (ratingMap[key] || 0) + 1;
      }
    });
    const topRatedRaw = Object.entries(ratingMap)
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([key, count]) => { const [type, ...rest] = key.split(":"); const id = rest.join(":"); return { type, id: parseId(type, id), count }; });

    const saveMap = {};
    (listData || []).forEach(s => { const key = `${s.content_type}:${s.content_id}`; saveMap[key] = (saveMap[key] || 0) + 1; });
    const topSavedRaw = Object.entries(saveMap).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([key, count]) => { const [type, ...rest] = key.split(":"); const id = rest.join(":"); return { type, id: parseId(type, id), count }; });

    // Unified title fetch — covers all four panels and all content types
    const allItems = [...topWatchedRaw, ...topByTimeRaw, ...topRatedRaw, ...topSavedRaw];
    // movies use UUID strings; episodes/shows/podcasts use bigint
    const idsForStr = (prefix) => [...new Set(allItems.filter(t => t.type === prefix).map(t => t.id))];
    const allEpIds = [...new Set((watchData || []).filter(w => w.content_type === "episode").map(w => parseInt(w.content_id)))].filter(Boolean);
    const [movTitles, epTitles, podEpTitles, showTitles, epShowRes] = await Promise.all([
      idsForStr("movie").length ? supabase.from("videos").select("id, title").in("id", idsForStr("movie")) : { data: [] },
      idsForStr("episode").length ? supabase.from("episodes").select("id, title").in("id", idsForStr("episode")) : { data: [] },
      idsForStr("podcast_episode").length ? supabase.from("podcast_episodes").select("id, title").in("id", idsForStr("podcast_episode")) : { data: [] },
      idsForStr("show").length ? supabase.from("shows").select("id, title").in("id", idsForStr("show")) : { data: [] },
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
      is_premium: row.is_premium ?? false,
      visibility_tier: row.visibility_tier ?? "production",
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
      tags: (() => {
        if (!row.tags) return "";
        if (Array.isArray(row.tags)) {
          // Filter out any elements that are themselves arrays/objects (corrupted)
          const clean = row.tags.filter(t => typeof t === "string" && !t.startsWith("[") && !t.startsWith("{"));
          return clean.join(", ");
        }
        if (typeof row.tags === "string") {
          try { const p = JSON.parse(row.tags); if (Array.isArray(p)) return p.filter(t => typeof t === "string" && !t.startsWith("[")).join(", "); } catch {}
        }
        return "";
      })(),
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
      tags: (() => {
        const raw = form.tags.trim();
        if (!raw) return [];
        // If it looks like JSON, try to parse it rather than splitting blindly
        if (raw.startsWith("[")) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed.filter(t => typeof t === "string" && t.trim()).map(t => t.trim());
          } catch {}
        }
        return raw.split(",").map(t => t.trim()).filter(Boolean);
      })(),
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
          // During a local reorder we own the order optimistically — ignore our own echoes
          // so the list doesn't jump around or spam toasts while positions settle.
          if (suppressCarouselRT.current && payload.eventType === "UPDATE") return;
          if (payload.eventType === "INSERT") {
            setCarousels(prev => prev.some(c => c.id === payload.new.id) ? prev : [...prev, payload.new].sort((a, b) => a.position - b.position));
            showToast("Carousel added", "success");
          } else if (payload.eventType === "UPDATE") {
            setCarousels(prev =>
              prev.map(c => c.id === payload.new.id ? payload.new : c).sort((a, b) => a.position - b.position)
            );
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
      layout: carousel.layout ?? "standard",
      enabled: carousel.enabled ?? true,
      position: carousel.position ?? 0,
      pages: carousel.pages ?? "home",
      visibility_tier: carousel.visibility_tier ?? "production",
    });
    if (carousel.type === "handpicked") {
      try {
        const stored = JSON.parse(carousel.filter_value || "[]");
        const pool = [
          ...rows.map(v => ({ id: v.id, type: "movie", title: v.title, subtitle: v.category, thumbnail: v.poster || v.thumbnail })),
          ...showsList.map(s => ({ id: s.id, type: "show", title: s.title, subtitle: "Series", thumbnail: s.poster || s.thumbnail })),
        ];
        const enriched = stored.map(({ id, type }) => {
          const found = pool.find(p => p.id === id && p.type === type);
          return found ?? { id, type, title: "", thumbnail: null };
        });
        setHandpickedSelected(enriched);
      } catch { setHandpickedSelected([]); }
    } else {
      setHandpickedSelected([]);
    }
    setHandpickedSearch("");
  }

  function cancelCarouselEdit() {
    setEditingCarouselId(null);
    setCarouselForm(EMPTY_CAROUSEL);
    setHandpickedSelected([]);
    setHandpickedSearch("");
    setDrawerOpen(false);
  }

  async function saveCarousel() {
    if (carouselSaveRef.current) return; // already saving — ignore duplicate clicks
    if (!carouselForm.title.trim()) {
      showToast("Title is required.", "error");
      return;
    }
    if (carouselForm.type === "category" && !carouselForm.filter_value.trim()) {
      showToast("Category is required for category type.", "error");
      return;
    }
    if (carouselForm.type === "handpicked" && handpickedSelected.length === 0) {
      showToast("Pick at least one title.", "error");
      return;
    }
    // Block duplicate rows: same name already on one of the chosen screens
    if (!editingCarouselId) {
      const t = carouselForm.title.trim().toLowerCase();
      const newPages = (carouselForm.pages || "").split(",").map(p => p.trim()).filter(Boolean);
      const dupe = carousels.find(c =>
        (c.title || "").trim().toLowerCase() === t &&
        (c.pages || "").split(",").map(p => p.trim()).some(p => newPages.includes(p))
      );
      if (dupe) { showToast("A row with that name already exists on this screen.", "error"); return; }
    }

    carouselSaveRef.current = true;
    setCarouselSaving(true);
    const serializedForm = carouselForm.type === "handpicked"
      ? { ...carouselForm, filter_value: JSON.stringify(handpickedSelected.map(({ id, type }) => ({ id, type }))) }
      : carouselForm;
    const payload = { ...serializedForm, position: editingCarouselId ? carouselForm.position : carousels.length };

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
    carouselSaveRef.current = false;
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
    // Renumber positions to match the new order.
    const renumbered = newCarousels.map((c, idx) => ({ ...c, position: idx }));
    // 1) Update the UI immediately so the move feels instant.
    setCarousels(renumbered);
    // 2) Ignore the realtime echoes our own writes will fire (they'd re-sort mid-flight).
    suppressCarouselRT.current = true;
    try {
      // 3) Persist all positions in parallel (fast, no mid-flight re-sorts).
      const results = await Promise.all(renumbered.map(c => supabase.from("carousels").update({ position: c.position }).eq("id", c.id)));
      const failed = results.find(r => r.error);
      if (failed) throw failed.error;
      showToast("Order updated");
    } catch (error) {
      showToast("Reorder failed: " + (error?.message || error), "error");
      loadCarousels(); // fall back to server truth on failure
    } finally {
      // Re-enable realtime after the echoes have drained.
      setTimeout(() => { suppressCarouselRT.current = false; }, 1200);
    }
  }

  async function moveCarousel(idx, dir) {
    const next = [...carousels];
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= next.length) return;
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    await reorderCarousels(next);
  }

  // Drag-to-reorder within the selected screen. `from`/`to` are indices in the page list.
  async function dropReorderCarousel(from, to) {
    setDragCarouselIdx(null); setDragOverCarouselIdx(null);
    if (from == null || to == null || from === to) return;
    const page = carouselPageTab;
    const pageList = carouselsOnPage(page);
    if (from < 0 || from >= pageList.length || to < 0 || to >= pageList.length) return;
    const reordered = [...pageList];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    // Slot the reordered page rows back into the same global positions they occupied,
    // leaving other pages' rows untouched — then renumber everything.
    const slots = [];
    carousels.forEach((c, gi) => { if (pageList.includes(c)) slots.push(gi); });
    const next = [...carousels];
    slots.forEach((slot, k) => { next[slot] = reordered[k]; });
    await reorderCarousels(next);
  }

  // Reorder within the selected screen — swap with the adjacent row on the same page
  async function moveCarouselOnPage(carousel, dir) {
    const pageList = carouselsOnPage(carouselPageTab);
    const swapWith = pageList[pageList.indexOf(carousel) + dir];
    if (!swapWith) return;
    const next = [...carousels];
    const a = next.indexOf(carousel), b = next.indexOf(swapWith);
    if (a < 0 || b < 0) return;
    [next[a], next[b]] = [next[b], next[a]];
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
    setShowForm({ title: show.title ?? "", category: show.category ?? "Horror", rating: show.rating ?? "NR", year: show.year ?? "", score: show.score ?? "", thumbnail: show.thumbnail ?? "", poster: show.poster ?? "", description: show.description ?? "", tags: Array.isArray(show.tags) ? show.tags.join(", ") : (show.tags ?? ""), trailer_url: show.trailer_url ?? "", is_premium: show.is_premium ?? false, visibility_tier: show.visibility_tier ?? "production" });
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
    setPodcastForm({ title: p.title ?? "", host: p.host ?? "", description: p.description ?? "", artwork_url: p.artwork_url ?? "", link_url: p.link_url ?? "", episode_count: p.episode_count ?? "", tags: Array.isArray(p.tags) ? p.tags.join(", ") : (p.tags ?? ""), enabled: p.enabled ?? true, visibility_tier: p.visibility_tier ?? "production" });
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
      logAudit("delete", "podcast", id);
      setDeletePodcastConfirm(null);
      if (selectedPodcastForEp?.id === id) { setSelectedPodcastForEp(null); setPodEpList([]); cancelPodEpEdit(); }
      await loadPodcasts();
    }
  }

  // ──── RSS IMPORT ────

  function openRssImport(podcast = null) {
    setRssSyncTarget(podcast);
    setRssUrl(podcast?.feed_url || "");
    setRssPreview(null);
    setRssError(null);
    setRssOpen(true);
  }

  function closeRssImport() {
    setRssOpen(false);
    setRssSyncTarget(null);
    setRssUrl("");
    setRssPreview(null);
    setRssError(null);
  }

  async function fetchRssPreview() {
    const url = rssUrl.trim();
    if (!url) { setRssError("Paste a podcast RSS feed URL first."); return; }
    setRssLoading(true); setRssError(null); setRssPreview(null);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-rss?url=${encodeURIComponent(url)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.episodes?.length) throw new Error("No episodes found in that feed. Double-check the URL points to an RSS/XML feed.");
      setRssPreview(data);
    } catch (e) {
      setRssError(e.message || "Could not read that feed.");
    }
    setRssLoading(false);
  }

  async function importRss() {
    if (!rssPreview) return;
    setRssImporting(true);
    setRssError(null);
    try {
      const meta = rssPreview.podcast || {};
      const feedUrl = rssUrl.trim();
      let podcastId = rssSyncTarget?.id;

      if (!rssSyncTarget) {
        const { data: created, error } = await supabase.from("podcasts").insert([{
          title: meta.title || "Untitled Podcast",
          host: meta.host || "",
          description: (meta.description || "").slice(0, 1000),
          artwork_url: meta.artwork_url || "",
          link_url: meta.link_url || "",
          episode_count: rssPreview.total ?? null,
          tags: [],
          enabled: true,
        }]).select().single();
        if (error) throw error;
        podcastId = created.id;
      }

      // Best-effort: store the feed URL for one-click re-sync. Ignored gracefully
      // if the feed_url column hasn't been added yet (see podcasts_feed_url_migration.sql).
      supabase.from("podcasts").update({ feed_url: feedUrl }).eq("id", podcastId).then(() => {});

      // Dedup against episodes already stored (by title) so re-syncing only adds new ones
      const { data: existing } = await supabase.from("podcast_episodes").select("title").eq("podcast_id", podcastId);
      const seen = new Set((existing || []).map(e => (e.title || "").trim().toLowerCase()));

      const total = rssPreview.episodes.length;
      const rows = rssPreview.episodes
        .filter(ep => ep.audio_url && !seen.has((ep.title || "").trim().toLowerCase()))
        .map(ep => {
          // Feed index 0 = newest. Number oldest→newest so ascending sort reads chronologically.
          const number = ep.episode_number ?? (total - ep.index);
          let published_at = null;
          if (ep.pub_date) { const d = new Date(ep.pub_date); if (!isNaN(d.getTime())) published_at = d.toISOString(); }
          return {
            podcast_id: podcastId,
            episode_number: number,
            title: ep.title || `Episode ${number}`,
            description: (ep.description || "").slice(0, 1000),
            audio_url: ep.audio_url,
            duration: ep.duration || "",
            thumbnail: ep.thumbnail || "",
            published_at,
          };
        });

      if (rows.length) {
        const { error: insErr } = await supabase.from("podcast_episodes").insert(rows);
        if (insErr) throw insErr;
      }

      // Keep episode_count accurate
      const { count } = await supabase.from("podcast_episodes").select("*", { count: "exact", head: true }).eq("podcast_id", podcastId);
      await supabase.from("podcasts").update({ episode_count: count ?? rows.length }).eq("id", podcastId);

      const skipped = total - rows.length;
      showToast(rssSyncTarget
        ? (rows.length ? `Synced — ${rows.length} new episode${rows.length === 1 ? "" : "s"} added` : "Already up to date — no new episodes")
        : `Imported "${meta.title || "podcast"}" with ${rows.length} episode${rows.length === 1 ? "" : "s"}${skipped ? ` (${skipped} skipped)` : ""}`);

      closeRssImport();
      await loadPodcasts();
      if (rssSyncTarget && selectedPodcastForEp?.id === rssSyncTarget.id) loadPodEpisodes(rssSyncTarget.id);
    } catch (e) {
      setRssError(e.message || "Import failed.");
    }
    setRssImporting(false);
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
    else { showToast("Episode deleted"); logAudit("delete", "podcast_episode", id); setDeletePodEpConfirm(null); await loadPodEpisodes(selectedPodcastForEp.id); }
  }

  // ──── MUSIC VIDEOS ────

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

  async function loadApplications() {
    setAppsLoading(true);
    const { data, error } = await supabase.from("streamer_applications").select("*").order("created_at", { ascending: false });
    if (!error) setApplications(data || []);
    setAppsLoading(false);
  }

  async function approveApplication(app) {
    setApprovingId(app.id);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/approve-streamer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ application_id: app.id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast(`${app.name} approved — stream key sent to ${app.email}`);
      logAudit("approve", "streamer_application", app.id, { email: app.email });
      await loadApplications();
      await loadLiveStreams();
    } catch (err) {
      showToast(`Error: ${err.message}`, "error");
    }
    setApprovingId(null);
  }

  async function rejectApplication() {
    if (!rejectTarget) return;
    setRejectingId(rejectTarget.id);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/reject-streamer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ application_id: rejectTarget.id, note: appRejectNote }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      showToast(`${rejectTarget.name} rejected`);
      logAudit("reject", "streamer_application", rejectTarget.id);
      setRejectTarget(null);
      setAppRejectNote("");
      await loadApplications();
    } catch (err) {
      showToast(`Error: ${err.message}`, "error");
    }
    setRejectingId(null);
  }

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
    setLiveForm({ title: s.title ?? "", description: s.description ?? "", stream_url: s.stream_url ?? "", thumbnail: s.thumbnail ?? "", hero_image: s.hero_image ?? "", is_live: s.is_live ?? true, is_hero: s.is_hero ?? false });
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

  // ──── Channels ────
  async function loadChannels() {
    setChannelLoading(true);
    const [{ data }, feedsRes] = await Promise.all([
      supabase.from("channels").select("*").order("sort_order"),
      supabase.from("live_feeds").select("id, name, cloudflare_hls_url, playback_status, relay_status").order("name"),
    ]);
    setChannelList(data || []);
    setChannelFeeds(feedsRes.data || []);
    setChannelLoading(false);
  }

  async function saveChannel() {
    if (!channelForm.name.trim()) { showToast("Name is required.", "error"); return; }
    setChannelSaving(true);
    const slug = channelForm.slug.trim() || channelForm.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const payload = { ...channelForm, name: channelForm.name.trim(), slug };
    try {
      if (editingChannelId) {
        const { error } = await supabase.from("channels").update(payload).eq("id", editingChannelId);
        if (error) throw error;
        showToast("Channel updated");
      } else {
        const { error } = await supabase.from("channels").insert([payload]);
        if (error) throw error;
        showToast("Channel added");
      }
      setEditingChannelId(null); setChannelForm(EMPTY_CHANNEL); setDrawerOpen(false);
      loadChannels();
    } catch (e) { showToast("Save failed: " + e.message, "error"); }
    setChannelSaving(false);
  }

  async function deleteChannel(id) {
    if (!confirm("Delete this channel?")) return;
    await supabase.from("channels").delete().eq("id", id);
    logAudit("delete", "channel", id);
    loadChannels();
  }

  // Ping each channel's playback URL to find dead streams (M3U imports go stale often).
  function fastChannelUrl(ch) {
    if (ch.hls_url) return ch.hls_url;
    if (ch.stream_uid) return `https://customer-x9w8t8qxjaf49jqb.cloudflarestream.com/${ch.stream_uid}/manifest/video.m3u8`;
    return "";
  }
  // Health-check channels server-side via the check-channels edge function.
  // Server-side is the only reliable way — no CORS, real User-Agent, true HTTP status.
  async function testFastChannels() {
    const list = channelList.filter(c => fastChannelUrl(c));
    if (!list.length) { showToast("No channels with a playback URL to test", "error"); return; }
    setTestingFastChannels(true);
    setFastChannelStatuses(Object.fromEntries(list.map(c => [c.id, "testing"])));
    setFastTestProgress({ done: 0, total: list.length });
    // Direct fetch to the edge function (matches our other function calls; avoids
    // supabase-js invoke quirks). Chunked so big lists stay under the time limit and
    // results/progress stream in. Counting is done outside setState to stay correct.
    const token = await getAdminToken();
    const CHUNK = 40;
    let ok = 0, dead = 0, failedChunks = 0, done = 0, lastErr = "";
    for (let i = 0; i < list.length; i += CHUNK) {
      const chunk = list.slice(i, i + CHUNK);
      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/check-channels`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ channels: chunk.map(c => ({ id: String(c.id), url: fastChannelUrl(c) })) }),
          signal: AbortSignal.timeout(90000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const results = json.results || {};
        const upd = {};
        chunk.forEach(c => { const st = results[String(c.id)] === "ok" ? "ok" : "error"; upd[c.id] = st; if (st === "ok") ok++; else dead++; });
        setFastChannelStatuses(prev => ({ ...prev, ...upd }));
      } catch (e) {
        failedChunks++;
        lastErr = e?.message || "request failed";
        const upd = {};
        chunk.forEach(c => { upd[c.id] = "unknown"; });
        setFastChannelStatuses(prev => ({ ...prev, ...upd }));
      }
      done += chunk.length;
      setFastTestProgress({ done, total: list.length });
    }
    setTestingFastChannels(false);
    if (ok === 0 && dead === 0) {
      showToast(`Channel checker failed: ${lastErr || "unreachable"}`, "error");
    } else {
      showToast(`Test complete · ${ok} online, ${dead} dead${failedChunks ? " · some untested" : ""}`);
    }
  }

  // ──── Feature flags + audit log ────
  const [auditRows, setAuditRows] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  async function logAudit(action, entity, entityId, details) {
    try {
      await supabase.from("audit_log").insert({
        actor_id: currentUser?.id ?? null,
        actor_email: currentUser?.email ?? null,
        action,
        entity: entity ?? null,
        entity_id: entityId != null ? String(entityId) : null,
        details: details ?? null,
      });
    } catch { /* audit is best-effort — never block the action */ }
  }

  async function loadAudit() {
    setAuditLoading(true);
    const { data } = await supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(200);
    setAuditRows(data || []);
    setAuditLoading(false);
  }

  useEffect(() => {
    if (tab === "audit") loadAudit();
  }, [tab]);

  // ──── Admin navigation ────
  function applyTarget(t) {
    if (!t) return;
    setTab(t.tab);
    if (t.videoSubTab) setVideoSubTab(t.videoSubTab);
    if (t.liveSubTab) setLiveSubTab(t.liveSubTab);
    if (t.analyticsTab) setAnalyticsTab(t.analyticsTab);
    if (t.membersTab) setMembersTab(t.membersTab);
    if (t.creatorsTab) setCreatorsTab(t.creatorsTab);
    if (t.tab === "members") { setSupportUser(null); setSupportResults([]); setSupportSearch(""); setSupportActionMsg(null); }
  }
  function selectCategory(cat) {
    setSection(cat.key);
    if (cat.scaffold) { setTab("scaffold"); return; }
    applyTarget(cat.target || cat.sections?.[0]?.target);
  }
  function isTargetActive(t) {
    if (!t || t.tab !== tab) return false;
    if (t.videoSubTab && t.videoSubTab !== videoSubTab) return false;
    if (t.liveSubTab && t.liveSubTab !== liveSubTab) return false;
    if (t.analyticsTab && t.analyticsTab !== analyticsTab) return false;
    if (t.membersTab && t.membersTab !== membersTab) return false;
    if (t.creatorsTab && t.creatorsTab !== creatorsTab) return false;
    return true;
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
      const match = channelList.find(ch => {
        const name = (ch.name || "").toLowerCase();
        return name && (name.includes(lower) || lower.includes(name));
      });
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
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-xmltv?url=${encodeURIComponent(xmltvUrl.trim())}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status} — check the URL`;
        try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
        throw new Error(msg);
      }
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
    // Save source tracking to DB per channel — records the feed URL + which XMLTV
    // channel each of our channels maps to, so the daily refresh cron can re-pull.
    const sourceName = xmltvFileName || xmltvUrl || "XMLTV import";
    const now = new Date().toISOString();
    const srcUrl = xmltvFileName ? null : (xmltvUrl.trim() || null);
    const channelToXmltv = {};
    Object.entries(xmltvChannelMap).forEach(([xId, cid]) => { if (cid) channelToXmltv[cid] = xId; });
    const sourceRows = channelIds.map(cId => ({
      channel_id: cId,
      source_name: sourceName,
      source_url: srcUrl,
      xmltv_channel_id: channelToXmltv[cId] || null,
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
    const lines = text.split(/\r?\n/).map(l => l.trim());
    const channels = [];
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith("#EXTINF")) continue;
      const extinf = lines[i];
      let url = "";
      for (let j = i + 1; j < lines.length; j++) {
        const l = lines[j];
        if (!l) continue;
        if (l.startsWith("#")) continue; // skip #EXTVLCOPT, #EXTGRP, etc.
        url = l; break;
      }
      if (!url || !/^https?:\/\//i.test(url)) continue; // only real playback URLs
      const commaIdx = extinf.lastIndexOf(",");
      const displayName = commaIdx >= 0 ? extinf.slice(commaIdx + 1).trim() : "";
      const tvgName = extinf.match(/tvg-name="([^"]*)"/i)?.[1] || "";
      const name = (displayName || tvgName || "Unknown Channel").replace(/\s+/g, " ").trim();
      const logo = extinf.match(/tvg-logo="([^"]*)"/i)?.[1] || "";
      const group = extinf.match(/group-title="([^"]*)"/i)?.[1] || "";
      channels.push({ name: name || "Unknown Channel", url, logo, group });
    }
    return channels;
  }

  // Tag channels against existing DB channels + against each other (dupe by URL or name).
  function tagM3UChannels(channels) {
    const existingUrls = new Set(channelList.map(c => (c.hls_url || "").trim().toLowerCase()).filter(Boolean));
    const existingNames = new Set(channelList.map(c => (c.name || "").trim().toLowerCase()).filter(Boolean));
    const seenUrls = new Set();
    const seenNames = new Set();
    return channels.map(ch => {
      const u = ch.url.trim().toLowerCase();
      const n = ch.name.trim().toLowerCase();
      let duplicate = false, reason = "";
      if (existingUrls.has(u) || existingNames.has(n)) { duplicate = true; reason = "Already exists"; }
      else if (seenUrls.has(u) || seenNames.has(n)) { duplicate = true; reason = "Duplicate in file"; }
      seenUrls.add(u); seenNames.add(n);
      return { ...ch, duplicate, dupeReason: reason };
    });
  }

  function ingestM3UText(text, sourceLabel) {
    if (!text || (!text.includes("#EXTINF") && !text.includes("#EXTM3U"))) {
      setM3uError("This does not appear to be a valid M3U playlist."); setM3uFetching(false); return;
    }
    const channels = parseM3U(text);
    if (channels.length === 0) { setM3uError("No channels found in this playlist."); setM3uFetching(false); return; }
    const tagged = tagM3UChannels(channels);
    setM3uChannels(tagged);
    // Auto-select everything that isn't a duplicate.
    const preselect = new Set();
    tagged.forEach((ch, i) => { if (!ch.duplicate) preselect.add(i); });
    setM3uSelected(preselect);
    setM3uSourceLabel(sourceLabel);
    setM3uCategoryFilter("All");
    setM3uFetching(false);
  }

  function resetM3UPreview() {
    setM3uError(""); setM3uChannels([]); setM3uSelected(new Set()); setM3uPage(0);
    setM3uImportResult(null); setM3uSearch(""); setM3uCategoryFilter("All");
  }

  async function fetchM3UPlaylist() {
    if (!m3uUrl.trim()) return;
    setM3uFetching(true); resetM3UPreview();
    const target = m3uUrl.trim();
    let text = "";
    // Primary: our server-side proxy (no CORS limits, works with any source).
    try {
      const token = await getAdminToken();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-m3u?url=${encodeURIComponent(target)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: AbortSignal.timeout(30000),
      });
      if (res.ok) {
        text = await res.text();
      } else {
        let msg = `Playlist fetch failed (HTTP ${res.status})`;
        try { const j = await res.json(); if (j.error) msg = j.error; } catch {}
        throw new Error(msg);
      }
    } catch (proxyErr) {
      // Fallback: try a direct browser fetch (works for CORS-enabled sources even if the proxy is down).
      try {
        const res = await fetch(target, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        text = await res.text();
      } catch {
        setM3uError(proxyErr?.message || "Could not reach that URL. It may be offline or invalid.");
        setM3uFetching(false); return;
      }
    }
    ingestM3UText(text, target);
  }

  async function loadM3UFromFile(file) {
    if (!file) return;
    const okExt = /\.(m3u|m3u8)$/i.test(file.name);
    setM3uFetching(true); resetM3UPreview();
    try {
      const text = await file.text();
      if (!okExt && !text.includes("#EXTM3U") && !text.includes("#EXTINF")) {
        setM3uError("That file doesn't look like an M3U playlist."); setM3uFetching(false); return;
      }
      ingestM3UText(text, file.name);
    } catch {
      setM3uError("Could not read that file."); setM3uFetching(false);
    }
    if (m3uFileInputRef.current) m3uFileInputRef.current.value = "";
  }

  async function importM3USelected() {
    const toImport = m3uChannels.filter((ch, i) => m3uSelected.has(i) && !ch.duplicate);
    const skippedDupes = m3uChannels.filter(ch => ch.duplicate).length;
    if (toImport.length === 0) { showToast("No new channels selected", "error"); return; }
    setM3uImporting(true);
    setM3uImportProgress({ done: 0, total: toImport.length });
    let imported = 0, failed = 0;
    const usedSlugs = new Set(channelList.map(c => c.slug).filter(Boolean));
    const baseOrder = channelList.reduce((max, c) => Math.max(max, c.sort_order || 0), 0);
    const BATCH = 200;
    for (let i = 0; i < toImport.length; i += BATCH) {
      const batch = toImport.slice(i, i + BATCH);
      const payload = batch.map((ch, bi) => {
        let slug = (ch.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")) || "channel";
        let unique = slug, n = 2;
        while (usedSlugs.has(unique)) unique = `${slug}-${n++}`;
        usedSlugs.add(unique);
        return {
          name: ch.name.trim(),
          slug: unique,
          description: "",
          logo_url: ch.logo || "",
          hero_url: "",
          category: ch.group?.trim() || "general",
          ingest_type: "hls",
          hls_url: ch.url.trim(),
          stream_uid: "",
          is_active: true,
          sort_order: baseOrder + i + bi + 1,
          is_premium: false,
        };
      });
      const { data, error } = await supabase.from("channels").insert(payload).select("id");
      if (error) { failed += batch.length; }
      else { imported += (data?.length ?? batch.length); }
      setM3uImportProgress({ done: Math.min(i + BATCH, toImport.length), total: toImport.length });
    }
    setM3uImportResult({ imported, skipped: skippedDupes, failed });
    if (imported > 0) {
      logAudit("import", "channel", `${imported} via M3U (${m3uSourceLabel || "playlist"})`);
      showToast(`Imported ${imported} channel${imported !== 1 ? "s" : ""}`);
      await loadChannels();
    } else {
      showToast("Import failed — no channels were added", "error");
    }
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


  return (
    <div style={{ background: "#f8fafc", minHeight: "100vh", fontFamily: "'Space Grotesk', sans-serif", color: "#0f172a" }}>

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
          {IS_DEV_DB ? (
            <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#a855f7", flexShrink: 0 }} />
              <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: 3, color: "#0f172a" }}>FARRIS</span>
            </span>
          ) : (
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Wordmark height={24} variant="yellow" />
              <span style={{ color: "#4f46e5", fontSize: 13, fontFamily: "sans-serif", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>admin</span>
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => window.location.reload(true)}
            title="Hard refresh"
            style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", color: "#374151", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
            Refresh
          </button>
          <button
            onClick={() => onExit()}
            style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 16px", color: "#dc2626", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Log Out
          </button>
          <button
            onClick={onExit}
            style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 16px", color: "#374151", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Exit CMS
          </button>
        </div>
      </div>

      {/* Top category nav (dropdowns) */}
      <div style={{ position: "relative", zIndex: 20, borderBottom: "1px solid #e2e8f0", padding: `0 ${PAD}`, display: "flex", gap: 2, background: "#ffffff", flexWrap: "wrap" }}>
        {ADMIN_NAV.map(cat => {
          const on = section === cat.key;
          const badge = cat.key === "reports" ? contentReports.filter(r => r.status === "pending").length : 0;
          const hasMenu = !!cat.sections;
          const menuOpen = openMenu === cat.key;
          return (
            <div key={cat.key} style={{ position: "relative" }}>
              <button
                onClick={() => { if (hasMenu) setOpenMenu(menuOpen ? null : cat.key); else { selectCategory(cat); setOpenMenu(null); } }}
                style={{ background: menuOpen ? "#f8fafc" : "transparent", border: "none", borderBottom: on ? `2px solid ${cat.color}` : "2px solid transparent", color: on ? cat.color : "#6b7280", padding: "16px 12px", fontSize: 14, fontWeight: on ? 600 : 400, cursor: "pointer", transition: "color 0.2s", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                {cat.label}{badge > 0 ? ` (${badge})` : ""}
                {hasMenu && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ opacity: 0.55, transform: menuOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}><polyline points="6 9 12 15 18 9" /></svg>}
              </button>
              {hasMenu && menuOpen && (
                <div style={{ position: "absolute", top: "100%", left: 0, marginTop: -1, minWidth: 200, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.12)", padding: 6, zIndex: 40 }}>
                  {cat.sections.map(sec => {
                    const secOn = isTargetActive(sec.target);
                    return (
                      <button key={sec.key}
                        onClick={() => { setSection(cat.key); applyTarget(sec.target); setOpenMenu(null); }}
                        style={{ display: "block", width: "100%", textAlign: "left", background: secOn ? `${cat.color}14` : "transparent", border: "none", borderRadius: 7, padding: "9px 12px", color: secOn ? cat.color : "#374151", fontSize: 13, fontWeight: secOn ? 600 : 400, cursor: "pointer", whiteSpace: "nowrap" }}
                        onMouseEnter={e => { if (!secOn) e.currentTarget.style.background = "#f1f5f9"; }}
                        onMouseLeave={e => { if (!secOn) e.currentTarget.style.background = "transparent"; }}>
                        {sec.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {openMenu && <div onClick={() => setOpenMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 15 }} />}

      <div style={{ maxWidth: 1600, margin: "0 auto", padding: `40px ${PAD} 80px` }}>

        {/* ────── SCAFFOLD (new categories without features yet) ────── */}
        {tab === "scaffold" && (() => {
          const cat = ADMIN_NAV.find(c => c.key === section);
          if (!cat?.scaffold) return null;
          return (
            <div style={{ padding: "80px 24px", textAlign: "center", border: "1px dashed #e2e8f0", borderRadius: 16, background: "#fafafa" }}>
              <div style={{ fontSize: 48, marginBottom: 20 }}>{cat.scaffold.icon}</div>
              <h2 style={{ margin: "0 0 10px", fontSize: 22, fontWeight: 700, color: "#0f172a" }}>{cat.label}</h2>
              <p style={{ margin: "0 auto", maxWidth: 440, fontSize: 14, color: "#6b7280", lineHeight: 1.7 }}>{cat.scaffold.blurb}</p>
              <div style={{ display: "inline-block", marginTop: 22, background: `${cat.color}14`, border: `1px solid ${cat.color}`, borderRadius: 20, padding: "5px 16px", fontSize: 12, fontWeight: 700, color: cat.color, letterSpacing: 0.5 }}>COMING SOON</div>
            </div>
          );
        })()}

        {/* ────── FEATURE FLAGS ────── */}
        {tab === "flags" && <FlagsPanel showToast={showToast} logAudit={logAudit} />}

        {/* ────── AUDIT LOG ────── */}
        {tab === "audit" && (
          <div>
            <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Audit Log</h2>
                <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Recent admin actions — who did what, and when. Last 200 events.</p>
              </div>
              <button onClick={loadAudit} disabled={auditLoading} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer", flexShrink: 0 }}>{auditLoading ? "…" : "↻ Refresh"}</button>
            </div>
            {auditLoading ? <div style={{ color: "#6b7280", padding: 40, textAlign: "center" }}>Loading…</div>
              : auditRows.length === 0 ? <div style={{ color: "#6b7280", padding: 40, textAlign: "center", border: "1px dashed #e2e8f0", borderRadius: 10 }}>No audit entries yet. Deletes, approvals, and flag changes will show up here.</div>
              : (
                <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
                  {auditRows.map(r => (
                    <div key={r.id} style={{ display: "grid", gridTemplateColumns: "180px 1fr 150px", gap: 12, padding: "10px 16px", borderBottom: "1px solid #f1f5f9", fontSize: 13, alignItems: "center" }}>
                      <span style={{ fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.action}{r.entity ? ` · ${r.entity}` : ""}</span>
                      <span style={{ color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.entity_id ? `#${r.entity_id} · ` : ""}{r.actor_email || r.actor_id || "—"}{r.details ? ` · ${JSON.stringify(r.details)}` : ""}</span>
                      <span style={{ color: "#9ca3af", textAlign: "right" }}>{new Date(r.created_at).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
          </div>
        )}

        {/* ────── CONTENT SUB-TAB BAR (retired — replaced by section nav) ────── */}
        {false && tab === "content" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 8, paddingBottom: 20, borderBottom: "1px solid #e2e8f0" }}>
            {[
              { key: "shorts",    label: "Movies",    count: rows.length },
              { key: "series",    label: "Series",    count: showsList.length },
              { key: "episodes",  label: "Episodes",  count: null },
              { key: "podcasts",  label: "Podcasts",  count: podcastsList.length },
              { key: "carousels", label: "Carousels", count: carousels.length },
            ].map(({ key, label, count }) => (
              <button key={key} onClick={() => setVideoSubTab(key)} style={{ background: videoSubTab === key ? "rgba(79,70,229,0.08)" : "transparent", border: `1px solid ${videoSubTab === key ? "rgba(79,70,229,0.3)" : "#e2e8f0"}`, borderRadius: 8, padding: "7px 16px", color: videoSubTab === key ? "#4f46e5" : "#6b7280", fontSize: 13, fontWeight: videoSubTab === key ? 600 : 400, cursor: "pointer", transition: "all 0.15s" }}>
                {label}{count !== null ? ` (${count})` : ""}
              </button>
            ))}
          </div>
        )}

        {/* ────── VIDEOS TAB — MOVIES ────── */}
        {tab === "content" && videoSubTab === "shorts" && (
          <>
            <div>
              {/* Header row with Add button */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Shorts ({rows.length})</h2>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>Add content via Storage →</span>
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
        {tab === "content" && videoSubTab === "series" && (
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
        {tab === "content" && videoSubTab === "episodes" && (
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
        {tab === "content" && videoSubTab === "carousels" && (
          <div>
            {/* Page selector — which screen these rows appear on */}
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "#6b7280" }}>Pick a screen to see and manage the rows that appear on it:</p>
            <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
              {[{ key: "home", label: "🏠 Home" }, { key: "shorts", label: "🎬 Movies" }, { key: "series", label: "📺 Series" }, { key: "podcasts", label: "🎙️ Podcasts" }, { key: "live", label: "📡 Live TV" }].map(pg => {
                const count = carouselsOnPage(pg.key).length;
                const on = carouselPageTab === pg.key;
                return (
                  <button key={pg.key} onClick={() => setCarouselPageTab(pg.key)}
                    style={{ background: on ? "#4f46e5" : "#ffffff", border: `1px solid ${on ? "#4f46e5" : "#e2e8f0"}`, borderRadius: 10, padding: "10px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: on ? "0 2px 10px rgba(79,70,229,0.28)" : "none", transition: "all 0.15s" }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: on ? "#fff" : "#0f172a" }}>{pg.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, background: on ? "rgba(255,255,255,0.25)" : "#f1f5f9", color: on ? "#fff" : "#6b7280", borderRadius: 20, padding: "1px 8px" }}>{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Home Hero (custom promo banner) — only relevant on the Home screen */}
            {carouselPageTab === "home" && (() => {
              const lbl = { display: "block", fontSize: 12, color: "#6b7280", marginBottom: 5, fontWeight: 600 };
              const inp = { width: "100%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "9px 12px", color: "#0f172a", fontSize: 13, outline: "none", boxSizing: "border-box" };
              const list = homeHeroForm.cta_type === "movie" ? rows : homeHeroForm.cta_type === "show" ? showsList : homeHeroForm.cta_type === "channel" ? channelList : podcastsList;
              return (
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, marginBottom: 20, overflow: "hidden" }}>
                  <button onClick={() => setHomeHeroOpen(o => !o)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "14px 18px", background: "transparent", border: "none", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 18 }}>🎬</span>
                      <div style={{ textAlign: "left" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>Home Hero — custom banner</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>{homeHeroForm.enabled ? "On — overrides the ☆ featured movie/series" : "Off — home shows the ☆ featured movie/series"}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20, background: homeHeroForm.enabled ? "rgba(34,197,94,0.12)" : "#f1f5f9", color: homeHeroForm.enabled ? "#15803d" : "#6b7280" }}>{homeHeroForm.enabled ? "LIVE" : "OFF"}</span>
                      <span style={{ color: "#9ca3af", fontSize: 13 }}>{homeHeroOpen ? "▲" : "▼"}</span>
                    </div>
                  </button>
                  {homeHeroOpen && (
                    <div style={{ padding: "4px 18px 18px", display: "flex", flexDirection: "column", gap: 14, borderTop: "1px solid #f1f5f9" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginTop: 12 }}>
                        <input type="checkbox" checked={homeHeroForm.enabled} onChange={e => setHomeHeroForm(f => ({ ...f, enabled: e.target.checked }))} />
                        <span style={{ fontSize: 13, color: "#374151", fontWeight: 600 }}>Show this custom hero on the home screen</span>
                      </label>
                      <div>
                        <label style={lbl}>Background image (1920×1080)</label>
                        <ImageUploader label="Upload Hero Image" folder="hero" onUploadSuccess={url => setHomeHeroForm(f => ({ ...f, image_url: url }))} onError={err => showToast("Upload failed: " + err, "error")} />
                        <input value={homeHeroForm.image_url} onChange={e => setHomeHeroForm(f => ({ ...f, image_url: e.target.value }))} placeholder="or paste image URL…" style={{ ...inp, marginTop: 8 }} />
                        {homeHeroForm.image_url && <img src={homeHeroForm.image_url} alt="" onError={e => { e.target.style.display = "none"; }} style={{ marginTop: 8, width: "100%", maxHeight: 130, objectFit: "cover", borderRadius: 8, border: "1px solid #e2e8f0" }} />}
                      </div>
                      <div>
                        <label style={lbl}>Background video URL (optional — direct .mp4, autoplays muted)</label>
                        <input value={homeHeroForm.video_url} onChange={e => setHomeHeroForm(f => ({ ...f, video_url: e.target.value }))} placeholder="https://…/loop.mp4" style={inp} />
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div><label style={lbl}>Badge (small pill)</label><input value={homeHeroForm.badge} onChange={e => setHomeHeroForm(f => ({ ...f, badge: e.target.value }))} placeholder="NEW · LIVE EVENT" style={inp} /></div>
                        <div><label style={lbl}>Title</label><input value={homeHeroForm.title} onChange={e => setHomeHeroForm(f => ({ ...f, title: e.target.value }))} placeholder="Big headline" style={inp} /></div>
                      </div>
                      <div><label style={lbl}>Subtitle</label><input value={homeHeroForm.subtitle} onChange={e => setHomeHeroForm(f => ({ ...f, subtitle: e.target.value }))} placeholder="One line of supporting text" style={inp} /></div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        <div>
                          <label style={lbl}>Button links to</label>
                          <select value={homeHeroForm.cta_type} onChange={e => setHomeHeroForm(f => ({ ...f, cta_type: e.target.value, cta_value: "" }))} style={{ ...inp, cursor: "pointer" }}>
                            <option value="none">No button</option>
                            <option value="movie">A movie</option>
                            <option value="show">A series</option>
                            <option value="channel">A live channel</option>
                            <option value="podcast">A podcast</option>
                            <option value="tab">A section (tab)</option>
                            <option value="url">External URL</option>
                          </select>
                        </div>
                        {homeHeroForm.cta_type !== "none" && (
                          <div><label style={lbl}>Button label</label><input value={homeHeroForm.cta_label} onChange={e => setHomeHeroForm(f => ({ ...f, cta_label: e.target.value }))} placeholder="Watch now" style={inp} /></div>
                        )}
                      </div>
                      {homeHeroForm.cta_type !== "none" && (
                        <div>
                          <label style={lbl}>Button target</label>
                          {homeHeroForm.cta_type === "url" ? (
                            <input value={homeHeroForm.cta_value} onChange={e => setHomeHeroForm(f => ({ ...f, cta_value: e.target.value }))} placeholder="https://…" style={inp} />
                          ) : homeHeroForm.cta_type === "tab" ? (
                            <select value={homeHeroForm.cta_value} onChange={e => setHomeHeroForm(f => ({ ...f, cta_value: e.target.value }))} style={{ ...inp, cursor: "pointer" }}>
                              <option value="">Choose…</option>
                              <option value="Home">Home</option>
                              <option value="Movies">Movies</option>
                              <option value="Series">Series</option>
                              <option value="Streams">Live TV</option>
                              <option value="Podcasts">Podcasts</option>
                            </select>
                          ) : (
                            <select value={homeHeroForm.cta_value} onChange={e => setHomeHeroForm(f => ({ ...f, cta_value: e.target.value }))} style={{ ...inp, cursor: "pointer" }}>
                              <option value="">Choose…</option>
                              {(list || []).map(item => <option key={item.id} value={item.id}>{item.title || item.name}</option>)}
                            </select>
                          )}
                        </div>
                      )}
                      <button onClick={saveHomeHero} disabled={homeHeroSaving} style={{ alignSelf: "flex-start", background: "#4f46e5", border: "none", borderRadius: 8, padding: "11px 22px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: homeHeroSaving ? "not-allowed" : "pointer", opacity: homeHeroSaving ? 0.6 : 1 }}>
                        {homeHeroSaving ? "Saving…" : "Save Home Hero"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Header row with Add button */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: "#0f172a" }}>{({ home: "Home", shorts: "Movies", series: "Series", podcasts: "Podcasts", live: "Live TV" }[carouselPageTab])} rows ({carouselsOnPage(carouselPageTab).length}) <span style={{ color: "#6b7280", fontWeight: 400, fontSize: 13 }}>— drag ⠿ or use ▲▼ to reorder</span></h2>
              <button
                onClick={() => { setCarouselForm({ ...EMPTY_CAROUSEL, pages: carouselPageTab }); setEditingCarouselId(null); setDrawerOpen(true); }}
                style={{ background: "#4f46e5", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
              >
                + Add row to {({ home: "Home", shorts: "Movies", series: "Series", podcasts: "Podcasts", live: "Live TV" }[carouselPageTab])}
              </button>
            </div>

            {carouselLoading ? (
              <div style={{ padding: 40, textAlign: "center", color: "#6b7280" }}>Loading…</div>
            ) : carouselsOnPage(carouselPageTab).length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "#6b7280", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 12 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                <p style={{ margin: 0, fontSize: 14 }}>No rows on this screen yet. Add one above.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {carouselsOnPage(carouselPageTab).map((carousel, i) => {
                  const pageCount = carouselsOnPage(carouselPageTab).length;
                  const t = carousel.type;
                  const ct = carousel.content_type;
                  const rowPages = (carousel.pages || "home").split(",").map(p => p.trim()).filter(Boolean);
                  const contentLabel = t === "live_channels" ? "Live TV" : t === "creator_streams" ? "Creator Streams" : t === "podcast" ? "Podcasts" : ct === "shorts" ? "Movies only" : ct === "shows" ? "Series only" : "All content";
                  const handpickedCount = t === "handpicked" ? (() => { try { return JSON.parse(carousel.filter_value || "[]").length; } catch { return 0; } })() : 0;
                  const orderLabel = t === "trending" ? "Recently Added" : t === "recommended" ? "Recommended" : t === "continue" ? "Continue Watching" : t === "handpicked" ? `${handpickedCount} hand-picked` : t === "category" ? `Genre: ${carousel.filter_value || "?"}` : t === "podcast" ? (carousel.filter_value ? `Tag: ${carousel.filter_value}` : "All podcasts") : t === "live_channels" ? (carousel.filter_value ? `Category: ${carousel.filter_value}` : "All live channels") : t === "creator_streams" ? "Live creators" : "Default order";
                  const contentColor = t === "live_channels" ? "#ef4444" : t === "creator_streams" ? "#ef4444" : t === "podcast" ? "#a78bfa" : ct === "shorts" ? "#facc15" : ct === "shows" ? "#34d399" : "#f59e0b";
                  const pageLabels = { home: "Home", shorts: "Movies", series: "Series", podcasts: "Podcasts", live: "Live TV" };

                  const isDragging = dragCarouselIdx === i;
                  const isDragOver = dragOverCarouselIdx === i && dragCarouselIdx !== null && dragCarouselIdx !== i;
                  return (
                    <div key={carousel.id}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dragOverCarouselIdx !== i) setDragOverCarouselIdx(i); }}
                      onDrop={e => { e.preventDefault(); dropReorderCarousel(dragCarouselIdx, i); }}
                      style={{ background: isDragging ? "#eef2ff" : "#ffffff", border: `1px solid ${isDragOver ? "#4f46e5" : "#e2e8f0"}`, borderTop: isDragOver && dragCarouselIdx > i ? "2px solid #4f46e5" : undefined, borderBottom: isDragOver && dragCarouselIdx < i ? "2px solid #4f46e5" : undefined, borderRadius: 10, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, opacity: isDragging ? 0.4 : 1, transition: "opacity 0.15s, border-color 0.15s" }}>
                      {/* Drag handle */}
                      <div draggable
                        onDragStart={e => { setDragCarouselIdx(i); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(i)); } catch {} }}
                        onDragEnd={() => { setDragCarouselIdx(null); setDragOverCarouselIdx(null); }}
                        title="Drag to reorder"
                        style={{ flexShrink: 0, cursor: "grab", color: "#cbd5e1", padding: "0 2px", display: "flex", alignItems: "center", fontSize: 16, lineHeight: 1, userSelect: "none" }}>⠿</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                        <button onClick={() => moveCarouselOnPage(carousel, -1)} disabled={i === 0} style={{ background: "transparent", border: "none", color: i === 0 ? "#e2e8f0" : "#6b7280", cursor: i === 0 ? "default" : "pointer", fontSize: 11, padding: "2px 5px", lineHeight: 1 }}>▲</button>
                        <button onClick={() => moveCarouselOnPage(carousel, 1)} disabled={i === pageCount - 1} style={{ background: "transparent", border: "none", color: i === pageCount - 1 ? "#e2e8f0" : "#6b7280", cursor: i === pageCount - 1 ? "default" : "pointer", fontSize: 11, padding: "2px 5px", lineHeight: 1 }}>▼</button>
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
                          {carousel.visibility_tier && carousel.visibility_tier !== "production" && (
                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5, background: carousel.visibility_tier === "test" ? "rgba(168,85,247,0.12)" : "rgba(59,130,246,0.12)", color: carousel.visibility_tier === "test" ? "#7c3aed" : "#2563eb", border: `1px solid ${carousel.visibility_tier === "test" ? "rgba(168,85,247,0.4)" : "rgba(59,130,246,0.4)"}` }}>{carousel.visibility_tier}</span>
                          )}
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
            {/* Sub-tab nav (retired — replaced by section nav) */}
            {false && (
            <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "#f1f5f9", borderRadius: 10, padding: 4, width: "fit-content" }}>
              {[
                { key: "streams", label: "Streams" },
                { key: "channels", label: `Fast Channels${channelList.length > 0 ? ` (${channelList.length})` : ""}` },
                { key: "applications", label: `Applications${applications.filter(a => a.status === "pending").length > 0 ? ` (${applications.filter(a => a.status === "pending").length})` : ""}` },
              ].map(t => (
                <button key={t.key} onClick={() => setLiveSubTab(t.key)}
                  style={{ padding: "7px 16px", borderRadius: 7, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer", background: liveSubTab === t.key ? "#fff" : "transparent", color: liveSubTab === t.key ? "#0f172a" : "#6b7280", boxShadow: liveSubTab === t.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.15s" }}>
                  {t.label}
                </button>
              ))}
            </div>
            )}

            {/* Feeds sub-tab */}
            {liveSubTab === "feeds" && <FeedsPanel showToast={showToast} />}

            {/* Channels sub-tab */}
            {liveSubTab === "channels" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div>
                    <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Fast Channels ({channelList.length})</h2>
                    <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Always-on linear TV channels. Paste an HLS URL, or enter Cloudflare Stream / SRT ingest details.</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {testingFastChannels && <span style={{ fontSize: 12, color: "#6b7280" }}>Testing {fastTestProgress.done}/{fastTestProgress.total}…</span>}
                    {channelList.length > 0 && (
                      <button onClick={testFastChannels} disabled={testingFastChannels}
                        style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 16px", color: "#374151", fontSize: 13, fontWeight: 600, cursor: testingFastChannels ? "wait" : "pointer", opacity: testingFastChannels ? 0.6 : 1 }}>
                        {testingFastChannels ? "Testing…" : "Test all"}
                      </button>
                    )}
                    <button onClick={() => { setXmltvOpen(true); setXmltvParsed(null); setXmltvChannelMap({}); setXmltvError(""); setXmltvImportDone(null); setXmltvUrl(""); setXmltvFileName(""); setXmltvRawText(""); setXmltvRawOpen(false); }}
                      style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, padding: "9px 16px", color: "#4f46e5", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      Import EPG (XMLTV)
                    </button>
                    <button onClick={refreshEpgNow} disabled={refreshingEpg} title="Re-fetch guides for channels with an EPG source URL"
                      style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, padding: "9px 16px", color: "#4f46e5", fontSize: 13, fontWeight: 600, cursor: refreshingEpg ? "wait" : "pointer", opacity: refreshingEpg ? 0.6 : 1 }}>
                      {refreshingEpg ? "Refreshing…" : "↻ Refresh guides"}
                    </button>
                    <button onClick={() => { setM3uOpen(true); setM3uUrl(""); setM3uSourceLabel(""); resetM3UPreview(); }}
                      style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8, padding: "9px 16px", color: "#059669", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      Import M3U
                    </button>
                    <button onClick={() => { setChannelForm(EMPTY_CHANNEL); setEditingChannelId(null); setDrawerOpen(true); }}
                      style={{ background: "#ef4444", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      + Add Channel
                    </button>
                  </div>
                </div>
                {channelLoading ? (
                  <div style={{ color: "#6b7280", padding: 40, textAlign: "center" }}>Loading…</div>
                ) : channelList.length === 0 ? (
                  <div style={{ color: "#6b7280", padding: 40, textAlign: "center", border: "1px dashed #e2e8f0", borderRadius: 10 }}>No channels yet. Add one above.</div>
                ) : channelList.map(ch => (
                  <div key={ch.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px", marginBottom: 10, display: "flex", alignItems: "center", gap: 14 }}>
                    {ch.logo_url
                      ? <img src={ch.logo_url} alt="" onError={e => { e.target.onerror = null; e.target.style.display = "none"; }} style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0, background: "#f1f5f9" }} />
                      : <div style={{ width: 44, height: 44, borderRadius: 8, background: "#f1f5f9", border: "1px solid #e2e8f0", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: "#94a3b8" }}>📺</div>
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                        {(() => {
                          const st = fastChannelStatuses[ch.id];
                          if (!st) return null;
                          const map = { testing: { c: "#f59e0b", t: "Testing…" }, ok: { c: "#22c55e", t: "Online" }, error: { c: "#ef4444", t: "Not responding" }, unknown: { c: "#9ca3af", t: "Couldn't test — service unavailable" } };
                          const m = map[st];
                          return <span title={m.t} style={{ width: 9, height: 9, borderRadius: "50%", background: m.c, flexShrink: 0, boxShadow: st === "ok" ? "0 0 0 3px rgba(34,197,94,0.15)" : st === "error" ? "0 0 0 3px rgba(239,68,68,0.15)" : "none", animation: st === "testing" ? "pulse 1s infinite" : "none" }} />;
                        })()}
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{ch.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 8px", borderRadius: 20, background: ch.is_active ? "rgba(34,197,94,0.1)" : "rgba(100,100,100,0.1)", color: ch.is_active ? "#15803d" : "#888", border: `1px solid ${ch.is_active ? "rgba(34,197,94,0.3)" : "rgba(100,100,100,0.2)"}` }}>{ch.is_active ? "ACTIVE" : "INACTIVE"}</span>
                        <span style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>{ch.ingest_type}</span>
                        {fastChannelStatuses[ch.id] === "error" && <span style={{ fontSize: 11, fontWeight: 600, color: "#ef4444" }}>· dead stream</span>}
                        {fastChannelStatuses[ch.id] === "unknown" && <span style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af" }}>· couldn't test</span>}
                      </div>
                      <p style={{ margin: 0, fontSize: 12, color: "#6b7280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.hls_url || "No playback URL set"}</p>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button onClick={() => {
                        if (selectedChannelForEpg?.id === ch.id) { setSelectedChannelForEpg(null); setEpgEntries([]); }
                        else { setSelectedChannelForEpg(ch); setEpgDayOffset(0); loadEpgEntries(ch.id, 0); loadContentForEpg(); }
                      }}
                        style={{ background: selectedChannelForEpg?.id === ch.id ? "rgba(79,70,229,0.15)" : "#eef2ff", border: `1px solid ${selectedChannelForEpg?.id === ch.id ? "#4f46e5" : "#c7d2fe"}`, borderRadius: 7, padding: "7px 14px", fontSize: 12, fontWeight: selectedChannelForEpg?.id === ch.id ? 700 : 600, color: "#4f46e5", cursor: "pointer" }}>
                        {selectedChannelForEpg?.id === ch.id ? "Close" : "Schedule"}
                      </button>
                      <button onClick={() => { setChannelForm({ name: ch.name, slug: ch.slug || "", description: ch.description || "", logo_url: ch.logo_url || "", hero_url: ch.hero_url || "", category: ch.category || "general", ingest_type: ch.ingest_type || "hls", hls_url: ch.hls_url || "", stream_uid: ch.stream_uid || "", is_active: ch.is_active ?? true, sort_order: ch.sort_order ?? 0, is_premium: ch.is_premium ?? false, tile_size: ch.tile_size || "normal", is_live_hero: ch.is_live_hero ?? false, live_feed_id: ch.live_feed_id ?? null, visibility_tier: ch.visibility_tier ?? "production" }); setEditingChannelId(ch.id); setDrawerOpen(true); }}
                        style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer" }}>
                        Edit
                      </button>
                      <button onClick={() => deleteChannel(ch.id)}
                        style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 7, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#dc2626", cursor: "pointer" }}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}

                {/* ── Inline channel schedule (EPG) ── */}
                {selectedChannelForEpg && channelList.some(c => c.id === selectedChannelForEpg.id) && (
                  <div style={{ marginTop: 24, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <h3 style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 700, color: "#4f46e5" }}>Schedule — {selectedChannelForEpg.name}</h3>
                        <p style={{ margin: 0, fontSize: 11, color: "#6b7280" }}>Programs the "Now / Up next" guide viewers see on the Live TV tab.</p>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={startEpgAdd} style={{ background: "#4f46e5", border: "none", borderRadius: 7, padding: "8px 16px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ Add Program</button>
                        <button onClick={() => { setSelectedChannelForEpg(null); setEpgEntries([]); }} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "2px 4px" }}>×</button>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
                      {Array.from({ length: 7 }, (_, off) => {
                        const d = new Date(); d.setDate(d.getDate() + off);
                        const label = off === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                        const active = epgDayOffset === off;
                        return (
                          <button key={off} onClick={() => { setEpgDayOffset(off); loadEpgEntries(selectedChannelForEpg.id, off); }}
                            style={{ background: active ? "#4f46e5" : "#fff", border: `1px solid ${active ? "#4f46e5" : "#e2e8f0"}`, borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: active ? 700 : 500, color: active ? "#fff" : "#374151", cursor: "pointer" }}>
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    {epgLoading ? (
                      <div style={{ color: "#6b7280", padding: 28, textAlign: "center", fontSize: 13 }}>Loading…</div>
                    ) : epgEntries.length === 0 ? (
                      <div style={{ color: "#9ca3af", padding: 28, textAlign: "center", fontSize: 13, border: "1px dashed #e2e8f0", borderRadius: 10 }}>No programs scheduled for this day. Click "+ Add Program".</div>
                    ) : epgEntries.map(entry => (
                      <div key={entry.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 9, padding: "11px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 84, flexShrink: 0 }}>
                          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#4f46e5" }}>{new Date(entry.start_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</p>
                          <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>{new Date(entry.end_time).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</p>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.title}</p>
                          {entry.content_type && <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>Linked {entry.content_type}</p>}
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button onClick={() => startEpgEdit(entry)} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 5, padding: "5px 10px", color: "#374151", fontSize: 11, cursor: "pointer" }}>Edit</button>
                          <button onClick={() => { if (confirm("Remove this program?")) deleteEpgEntry(entry.id); }} style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 5, padding: "5px 10px", color: "#f87171", fontSize: 11, cursor: "pointer" }}>Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Applications sub-tab */}
            {liveSubTab === "applications" && (
              <div>
                <div style={{ marginBottom: 20, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <div>
                    <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Streamer Applications</h2>
                    <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Approve to create a Cloudflare live input and send stream key. Reject to notify the applicant.</p>
                  </div>
                  <button onClick={loadApplications} disabled={appsLoading}
                    style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#374151", cursor: appsLoading ? "wait" : "pointer", opacity: appsLoading ? 0.6 : 1, flexShrink: 0 }}>
                    {appsLoading ? "Refreshing…" : "↻ Refresh"}
                  </button>
                </div>
                {appsLoading ? (
                  <div style={{ color: "#6b7280", padding: 40, textAlign: "center" }}>Loading…</div>
                ) : applications.length === 0 ? (
                  <div style={{ color: "#6b7280", padding: 40, textAlign: "center", border: "1px dashed #e2e8f0", borderRadius: 10 }}>No applications yet.</div>
                ) : applications.map(app => (
                  <div key={app.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "16px 20px", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{app.name}</span>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, letterSpacing: 0.5,
                            background: app.status === "pending" ? "rgba(234,179,8,0.1)" : app.status === "approved" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                            color: app.status === "pending" ? "#a16207" : app.status === "approved" ? "#15803d" : "#dc2626",
                            border: `1px solid ${app.status === "pending" ? "rgba(234,179,8,0.3)" : app.status === "approved" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                          }}>{app.status.toUpperCase()}</span>
                        </div>
                        <p style={{ margin: "0 0 8px", fontSize: 13, color: "#6b7280" }}>{app.email}</p>
                        <p style={{ margin: "0 0 6px", fontSize: 13, color: "#374151", lineHeight: 1.5 }}><strong>Why:</strong> {app.why_they_want_to_stream}</p>
                        {app.social_links && <p style={{ margin: "0 0 6px", fontSize: 12, color: "#6b7280" }}><strong>Links:</strong> {app.social_links}</p>}
                        {app.notes && <p style={{ margin: 0, fontSize: 12, color: "#dc2626" }}><strong>Note:</strong> {app.notes}</p>}
                        <p style={{ margin: "6px 0 0", fontSize: 11, color: "#9ca3af" }}>{new Date(app.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</p>
                      </div>
                      {app.status === "pending" && (
                        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                          <button onClick={() => approveApplication(app)} disabled={approvingId === app.id}
                            style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 7, padding: "8px 16px", color: "#15803d", fontSize: 13, fontWeight: 600, cursor: approvingId === app.id ? "wait" : "pointer", opacity: approvingId === app.id ? 0.6 : 1 }}>
                            {approvingId === app.id ? "Approving…" : "✓ Approve"}
                          </button>
                          <button onClick={() => { setRejectTarget(app); setAppRejectNote(""); }}
                            style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 7, padding: "8px 16px", color: "#dc2626", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                            ✕ Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Reject modal */}
                {rejectTarget && (
                  <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                    <div style={{ background: "#fff", borderRadius: 14, padding: "32px 28px", width: "min(420px,100%)", boxShadow: "0 24px 64px rgba(0,0,0,0.15)" }}>
                      <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "#0f172a" }}>Reject {rejectTarget.name}?</h3>
                      <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6b7280" }}>Optionally add a note — it'll be included in the rejection email.</p>
                      <textarea value={appRejectNote} onChange={e => setAppRejectNote(e.target.value)} placeholder="Optional note to applicant…" rows={3}
                        style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit", marginBottom: 16 }} />
                      <div style={{ display: "flex", gap: 10 }}>
                        <button onClick={() => setRejectTarget(null)} style={{ flex: 1, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "11px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                        <button onClick={rejectApplication} disabled={!!rejectingId}
                          style={{ flex: 1, background: "#dc2626", border: "none", borderRadius: 8, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: rejectingId ? "wait" : "pointer", opacity: rejectingId ? 0.6 : 1 }}>
                          {rejectingId ? "Rejecting…" : "Confirm Reject"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Streams sub-tab */}
            {liveSubTab === "streams" && <div>
            {/* Header row with Add button */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600, color: "#0f172a" }}>All Streams ({liveList.length})</h2>
                <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Live status is set automatically when a streamer connects via RTMP.</p>
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
              <div key={s.id} style={{ background: "#ffffff", border: `1px solid ${s.is_live ? "rgba(239,68,68,0.3)" : "#e2e8f0"}`, borderRadius: 10, padding: "12px 16px", marginBottom: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                {s.thumbnail && <img src={s.thumbnail} alt={s.title} style={{ width: 80, height: 45, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} onError={e => { e.target.style.display = "none"; }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: "0 0 3px", fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{s.channel_name || s.title}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
                    <span style={{ color: s.is_live ? "#ef4444" : "#9ca3af", fontWeight: s.is_live ? 600 : 400 }}>{s.is_live ? "🔴 LIVE" : "○ Offline"}</span>
                    {s.stream_title && <span style={{ color: "#6b7280" }}> · {s.stream_title}</span>}
                  </p>
                  {s.stream_key && (
                    <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Stream Key:</span>
                      <code style={{ fontSize: 10, color: "#4f46e5", background: "rgba(79,70,229,0.07)", padding: "1px 6px", borderRadius: 3, letterSpacing: "0.05em" }}>
                        {revealedKeys[s.id] ? s.stream_key : "••••••••••••"}
                      </code>
                      <button onClick={() => setRevealedKeys(k => ({ ...k, [s.id]: !k[s.id] }))}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#6366f1", fontSize: 10, padding: 0, fontWeight: 600 }}>
                        {revealedKeys[s.id] ? "Hide" : "Reveal"}
                      </button>
                      <button onClick={() => { navigator.clipboard.writeText(s.stream_key); showToast("Stream key copied!"); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 10, padding: 0 }}>
                        Copy
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, alignItems: "center", flexWrap: "wrap" }}>
                  <button onClick={() => startLiveEdit(s)} style={{ background: "rgba(79,70,229,0.08)", border: "1px solid rgba(79,70,229,0.2)", borderRadius: 5, padding: "5px 10px", color: "#4f46e5", fontSize: 11, cursor: "pointer" }}>Edit</button>
                  <button onClick={() => setDeleteLiveConfirm(s)} style={{ background: "rgba(220,38,38,0.07)", border: "1px solid rgba(220,38,38,0.15)", borderRadius: 5, padding: "5px 10px", color: "#dc2626", fontSize: 11, cursor: "pointer" }}>Delete</button>
                </div>
              </div>
            ))}

            {/* Import M3U modal is rendered at the top level (see M3U import modal below) so it works from any sub-tab */}

            {false && deletePlaylistConfirm && (
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

            {false && liveList.length > 0 && (
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
            </div>}
          </div>
        )}

        {/* ────── PODCASTS SUB-TAB ────── */}
        {tab === "content" && videoSubTab === "podcasts" && (
          <>
            <div>
              {/* Header row with Add button */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div>
                  <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 600, color: "#0f172a" }}>All Podcasts ({podcastsList.length})</h2>
                  <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Import a show from its RSS feed, or click <strong style={{ color: "#4f46e5", fontWeight: 600 }}>Episodes</strong> on any podcast to manage them manually.</p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => openRssImport(null)}
                    style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, padding: "9px 16px", color: "#4f46e5", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>
                    Import from RSS
                  </button>
                  <button
                    onClick={() => { setPodcastForm(EMPTY_PODCAST); setEditingPodcastId(null); setDrawerOpen(true); }}
                    style={{ background: "#4f46e5", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                  >
                    + Add Podcast
                  </button>
                </div>
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
                    <button onClick={() => openRssImport(pod)} title="Fetch new episodes from this podcast's RSS feed" style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 5, padding: "5px 10px", color: "#4f46e5", fontSize: 11, cursor: "pointer" }}>Sync</button>
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

              {/* ── RSS import / sync modal ── */}
              {rssOpen && (
                <div style={{ position: "fixed", inset: 0, zIndex: 210, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                  <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "28px 30px", width: "min(560px, 100%)", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
                        {rssSyncTarget ? `Sync "${rssSyncTarget.title}"` : "Import podcast from RSS"}
                      </h3>
                      <button onClick={closeRssImport} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 22, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
                    </div>
                    <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
                      {rssSyncTarget
                        ? "Re-fetch the feed and pull in any episodes that aren't already stored. Existing episodes are left untouched."
                        : "Paste a podcast's RSS feed URL. We'll read its details and episodes so you can import the whole show in one click."}
                    </p>

                    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                      <input
                        type="text" value={rssUrl}
                        onChange={e => { setRssUrl(e.target.value); setRssError(null); }}
                        onKeyDown={e => { if (e.key === "Enter" && !rssLoading) fetchRssPreview(); }}
                        placeholder="https://feeds.example.com/my-podcast.xml"
                        style={{ flex: 1, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                        onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")}
                      />
                      <button onClick={fetchRssPreview} disabled={rssLoading}
                        style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 18px", color: "#374151", fontSize: 13, fontWeight: 600, cursor: rssLoading ? "wait" : "pointer", whiteSpace: "nowrap", opacity: rssLoading ? 0.6 : 1 }}>
                        {rssLoading ? "Reading…" : "Fetch"}
                      </button>
                    </div>

                    {rssError && (
                      <div style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
                        <p style={{ margin: 0, fontSize: 13, color: "#dc2626" }}>{rssError}</p>
                      </div>
                    )}

                    {rssPreview && (
                      <>
                        <div style={{ display: "flex", gap: 14, alignItems: "center", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16, marginBottom: 16 }}>
                          {rssPreview.podcast?.artwork_url
                            ? <img src={rssPreview.podcast.artwork_url} alt="" style={{ width: 64, height: 64, borderRadius: 9, objectFit: "cover", flexShrink: 0 }} onError={e => { e.target.style.display = "none"; }} />
                            : <div style={{ width: 64, height: 64, borderRadius: 9, background: "linear-gradient(135deg, #e0e7ff, #c7d2fe)", flexShrink: 0 }} />}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 700, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rssPreview.podcast?.title || "Untitled Podcast"}</p>
                            {rssPreview.podcast?.host && <p style={{ margin: "0 0 4px", fontSize: 12, color: "#4f46e5" }}>{rssPreview.podcast.host}</p>}
                            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>{rssPreview.total} episode{rssPreview.total === 1 ? "" : "s"} in feed</p>
                          </div>
                        </div>

                        <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid #e2e8f0", borderRadius: 10, marginBottom: 20 }}>
                          {rssPreview.episodes.slice(0, 40).map((ep, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: i < Math.min(rssPreview.episodes.length, 40) - 1 ? "1px solid #f1f5f9" : "none" }}>
                              <span style={{ fontSize: 11, color: "#9ca3af", width: 40, flexShrink: 0 }}>{ep.duration || "—"}</span>
                              <span style={{ fontSize: 13, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{ep.title || "(untitled)"}</span>
                              {!ep.audio_url && <span style={{ fontSize: 10, color: "#f87171", flexShrink: 0 }}>no audio</span>}
                            </div>
                          ))}
                          {rssPreview.episodes.length > 40 && (
                            <div style={{ padding: "8px 12px", fontSize: 11, color: "#9ca3af", textAlign: "center" }}>+ {rssPreview.episodes.length - 40} more…</div>
                          )}
                        </div>

                        <div style={{ display: "flex", gap: 10 }}>
                          <button onClick={closeRssImport} style={{ flex: "0 0 auto", background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "11px 18px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                          <button onClick={importRss} disabled={rssImporting}
                            style={{ flex: 1, background: "#4f46e5", border: "none", borderRadius: 8, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: rssImporting ? "wait" : "pointer", opacity: rssImporting ? 0.7 : 1 }}>
                            {rssImporting ? (rssSyncTarget ? "Syncing…" : "Importing…") : (rssSyncTarget ? "Sync new episodes" : `Import podcast + ${rssPreview.episodes.filter(e => e.audio_url).length} episodes`)}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
          </>
        )}

        {/* ────── ANALYTICS SUB-TAB BAR (retired — replaced by section nav) ────── */}
        {false && tab === "analytics" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid #e2e8f0" }}>
            {[{ key: "reports", label: "Reports" }, { key: "ads", label: `Ads${adList.length > 0 ? ` (${adList.length})` : ""}` }].map(({ key, label }) => (
              <button key={key} onClick={() => setAnalyticsTab(key)} style={{ background: analyticsTab === key ? "rgba(52,211,153,0.08)" : "transparent", border: `1px solid ${analyticsTab === key ? "rgba(52,211,153,0.3)" : "#e2e8f0"}`, borderRadius: 8, padding: "7px 16px", color: analyticsTab === key ? "#059669" : "#6b7280", fontSize: 13, fontWeight: analyticsTab === key ? 600 : 400, cursor: "pointer" }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ────── ADS TAB ────── */}
        {tab === "analytics" && analyticsTab === "ads" && (
          <div>

            {/* ── Ad Performance ── */}
            {adAnalytics && (
              <div style={{ marginBottom: 36 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 18 }}>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Ad Performance <span style={{ fontSize: 12, fontWeight: 400, color: "#9ca3af" }}>last 30 days</span></h2>
                  {adLastFetched && <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: "auto" }}>Updated {adLastFetched.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</span>}
                  <button onClick={loadAdAnalytics} style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 6, padding: "5px 12px", color: "#6366f1", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Refresh</button>
                  <button onClick={async () => { if (!window.confirm("Clear all ad impression history?")) return; const { error, count } = await supabase.from("ad_impressions").delete({ count: "exact" }).lte("created_at", new Date().toISOString()); if (error) { showToast("Delete failed: " + error.message, "error"); return; } showToast(`Cleared ${count ?? "all"} ad impression records`, "success"); setAdAnalytics(null); loadAdAnalytics(); }} style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "5px 12px", color: "#ef4444", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Clear History</button>
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
              const SCOPE_LABELS = { global: "All content", movie: "Movies", show: "TV Shows", episode: "Episodes", podcast_episode: "Podcasts", live: "Live Channels" };
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
        {tab === "analytics" && analyticsTab === "reports" && (
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
                      {(p.role === "admin" || p.is_admin) && <span style={{ fontSize: 10, background: "#ede9fe", color: "#7c3aed", borderRadius: 4, padding: "2px 7px", fontWeight: 700 }}>Admin</span>}
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
              const pageLabels = { home: "Home", shorts: "Movies", series: "Series", podcasts: "Podcasts", live: "Live TV", "new-popular": "New & Popular", mylist: "My List", profile: "Profile", settings: "Settings" };
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
                          const username = u.profile?.full_name || u.profile?.username;
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
                        { label: "Videos", value: reportData.videoCount, color: "#4f46e5", desc: "Movies published on Peep" },
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
                          {(() => {
                            const svgW = 600, svgH = 100;
                            const pL = 24, pR = 24, pT = 20, pB = 24;
                            const cW = svgW - pL - pR, cH = svgH - pT - pB;
                            const n = reportData.userGrowth.length;
                            const pts = reportData.userGrowth.map(([month, count], i) => ({
                              x: n === 1 ? pL + cW / 2 : pL + (i / (n - 1)) * cW,
                              y: n === 1 ? pT + cH / 2 : pT + (max === 0 ? cH : (1 - count / max) * cH),
                              month, count,
                            }));
                            const line = pts.map(p => `${p.x},${p.y}`).join(" ");
                            const area = [`${pts[0].x},${pT + cH}`, ...pts.map(p => `${p.x},${p.y}`), `${pts[pts.length - 1].x},${pT + cH}`].join(" ");
                            return (
                              <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: "100%", height: "auto", overflow: "visible" }}>
                                <defs>
                                  <linearGradient id="signupFill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#6366f1" stopOpacity="0.15" />
                                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                                  </linearGradient>
                                </defs>
                                <polygon points={area} fill="url(#signupFill)" />
                                {n > 1 && <polyline points={line} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
                                {pts.map(p => (
                                  <g key={p.month}>
                                    <circle cx={p.x} cy={p.y} r="5" fill="#fff" stroke="#6366f1" strokeWidth="2.5" />
                                    <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0f172a">{p.count}</text>
                                    <text x={p.x} y={pT + cH + 18} textAnchor="middle" fontSize="11" fill="#9ca3af">{MONTH_NAMES[p.month.slice(5)] || p.month.slice(5)}</text>
                                  </g>
                                ))}
                              </svg>
                            );
                          })()}
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
                          const TYPE_COLORS = { Shorts: "#60a5fa", "TV Episodes": "#34d399", Podcasts: "#f472b6", Shows: "#a78bfa" };
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

        {/* ────── MEMBERS SUB-TAB BAR (retired — replaced by section nav) ────── */}
        {false && tab === "members" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid #e2e8f0" }}>
            {[{ key: "users", label: `Users${users.length > 0 ? ` (${users.length})` : ""}` }, { key: "subscriptions", label: `Subscriptions${subs.length > 0 ? ` (${subs.length})` : ""}` }, { key: "support", label: "Support" }].map(({ key, label }) => (
              <button key={key} onClick={() => { setMembersTab(key); if (key === "support") { setSupportUser(null); setSupportResults([]); setSupportSearch(""); setSupportActionMsg(null); } }} style={{ background: membersTab === key ? "rgba(129,140,248,0.08)" : "transparent", border: `1px solid ${membersTab === key ? "rgba(129,140,248,0.3)" : "#e2e8f0"}`, borderRadius: 8, padding: "7px 16px", color: membersTab === key ? "#4f46e5" : "#6b7280", fontSize: 13, fontWeight: membersTab === key ? 600 : 400, cursor: "pointer" }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ────── SUPPORT TAB ────── */}
        {tab === "members" && membersTab === "support" && (
          <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
            {/* Left: search panel */}
            <div style={{ width: 320, flexShrink: 0 }}>
              <h2 style={{ margin: "0 0 20px", fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Account Support</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input
                  value={supportSearch}
                  onChange={e => { setSupportSearch(e.target.value); searchSupportUsers(e.target.value); }}
                  placeholder="Search by email, name, or user ID…"
                  style={{ border: "none", outline: "none", fontSize: 14, color: "#0f172a", background: "transparent", flex: 1 }}
                />
                {supportSearching && <span style={{ color: "#9ca3af", fontSize: 12 }}>⋯</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {supportResults.map(u => (
                  <button key={u.id} onClick={() => loadSupportUser(u)}
                    style={{ background: supportUser?.id === u.id ? "rgba(34,211,238,0.08)" : "#fff", border: `1px solid ${supportUser?.id === u.id ? "rgba(34,211,238,0.4)" : "#e2e8f0"}`, borderRadius: 10, padding: "12px 14px", textAlign: "left", cursor: "pointer", transition: "all 0.15s" }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: u._ghost ? "#9ca3af" : "#0f172a" }}>{u.full_name || u.username || (u._ghost ? "Ghost Account" : "—")}</p>
                    <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6b7280" }}>{u.email || <span style={{ fontFamily: "monospace", fontSize: 11 }}>{u.id.slice(0, 20)}…</span>}</p>
                  </button>
                ))}
                {supportSearch && !supportSearching && supportResults.length === 0 && (
                  <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "20px 0" }}>No users found</p>
                )}
              </div>
            </div>

            {/* Right: user detail */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {!supportUser && !supportLoading && (
                <div style={{ textAlign: "center", padding: "80px 0", color: "#9ca3af" }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" strokeWidth="1.5" style={{ marginBottom: 12 }}><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                  <p style={{ margin: 0, fontSize: 14 }}>Search and select a user</p>
                </div>
              )}
              {supportLoading && <div style={{ textAlign: "center", padding: "80px 0", color: "#9ca3af" }}>Loading…</div>}
              {supportUser && !supportLoading && (() => {
                const sub = supportUser.subscription;
                const lastSeen = supportUser.presence?.last_seen ? new Date(supportUser.presence.last_seen) : null;
                const daysSince = lastSeen ? Math.floor((Date.now() - lastSeen) / 86400000) : null;
                return (
                  <div>
                    {/* Header */}
                    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "24px", marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                        <div>
                          <p style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{supportUser.full_name || supportUser.username || "—"}</p>
                          <p style={{ margin: "0 0 4px", fontSize: 14, color: "#6b7280" }}>{supportUser.email}</p>
                          <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>Member since {supportUser.created_at ? new Date(supportUser.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" }) : "—"}</p>
                        </div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {sub ? (
                            <span style={{ background: sub.status === "active" ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)", color: sub.status === "active" ? "#059669" : "#dc2626", border: `1px solid ${sub.status === "active" ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`, borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 600 }}>
                              {sub.plan === "comp" ? "COMP" : sub.status}
                            </span>
                          ) : (
                            <span style={{ background: "rgba(156,163,175,0.1)", color: "#9ca3af", border: "1px solid #e2e8f0", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 600 }}>No Subscription</span>
                          )}
                        </div>
                      </div>

                      {/* Stats row */}
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 20, paddingTop: 20, borderTop: "1px solid #f1f5f9" }}>
                        {[
                          { label: "Profiles", value: supportUser.viewer_profiles.length },
                          { label: "Watch Sessions", value: supportUser.watch_count },
                          { label: "Last Seen", value: daysSince === null ? "Never" : daysSince === 0 ? "Today" : `${daysSince}d ago` },
                          { label: "Current Page", value: supportUser.presence?.current_page || "—" },
                        ].map(({ label, value }) => (
                          <div key={label} style={{ textAlign: "center" }}>
                            <p style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#0f172a" }}>{value}</p>
                            <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Subscription detail */}
                    {sub && (
                      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "20px", marginBottom: 16 }}>
                        <p style={{ margin: "0 0 14px", fontSize: 13, fontWeight: 700, color: "#0f172a", textTransform: "uppercase", letterSpacing: 0.5 }}>Subscription</p>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
                          <div><span style={{ color: "#9ca3af" }}>Started: </span><span style={{ color: "#0f172a" }}>{sub.created_at ? new Date(sub.created_at).toLocaleDateString() : "—"}</span></div>
                          <div><span style={{ color: "#9ca3af" }}>Renews: </span><span style={{ color: "#0f172a" }}>{sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : "—"}</span></div>
                          {sub.stripe_customer_id && <div style={{ gridColumn: "span 2" }}><span style={{ color: "#9ca3af" }}>Stripe Customer: </span><a href={`https://dashboard.stripe.com/customers/${sub.stripe_customer_id}`} target="_blank" rel="noreferrer" style={{ color: "#4f46e5", fontFamily: "monospace", fontSize: 12 }}>{sub.stripe_customer_id}</a></div>}
                          {sub.stripe_subscription_id && <div style={{ gridColumn: "span 2" }}><span style={{ color: "#9ca3af" }}>Stripe Sub: </span><a href={`https://dashboard.stripe.com/subscriptions/${sub.stripe_subscription_id}`} target="_blank" rel="noreferrer" style={{ color: "#4f46e5", fontFamily: "monospace", fontSize: 12 }}>{sub.stripe_subscription_id}</a></div>}
                        </div>
                      </div>
                    )}

                    {/* Viewer profiles */}
                    {supportUser.viewer_profiles.length > 0 && (
                      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "20px", marginBottom: 16 }}>
                        <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "#0f172a", textTransform: "uppercase", letterSpacing: 0.5 }}>Profiles</p>
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {supportUser.viewer_profiles.map(vp => (
                            <span key={vp.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 14px", fontSize: 13, color: "#374151" }}>{vp.name}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: "20px" }}>
                      <p style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 700, color: "#0f172a", textTransform: "uppercase", letterSpacing: 0.5 }}>Actions</p>
                      {supportActionMsg && (
                        <div style={{ background: supportActionMsg.ok ? "rgba(52,211,153,0.08)" : "rgba(248,113,113,0.08)", border: `1px solid ${supportActionMsg.ok ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: supportActionMsg.ok ? "#059669" : "#dc2626" }}>
                          {supportActionMsg.text}
                        </div>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <button onClick={supportGrantAccess} disabled={supportActionLoading}
                          style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: 9, padding: "12px", color: "#059669", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                          Grant Free Access
                        </button>
                        <button onClick={supportRevokeAccess} disabled={supportActionLoading || !sub}
                          style={{ background: sub ? "rgba(245,158,11,0.08)" : "#f8fafc", border: `1px solid ${sub ? "rgba(245,158,11,0.3)" : "#e2e8f0"}`, borderRadius: 9, padding: "12px", color: sub ? "#b45309" : "#9ca3af", fontSize: 13, fontWeight: 600, cursor: sub ? "pointer" : "not-allowed" }}>
                          Revoke Access
                        </button>
                        <button onClick={supportSendPasswordReset} disabled={supportActionLoading}
                          style={{ background: "rgba(79,70,229,0.08)", border: "1px solid rgba(79,70,229,0.3)", borderRadius: 9, padding: "12px", color: "#4f46e5", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                          Send Password Reset
                        </button>
                        {sub?.stripe_customer_id && (
                          <a href={`https://dashboard.stripe.com/customers/${sub.stripe_customer_id}`} target="_blank" rel="noreferrer"
                            style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 9, padding: "12px", color: "#6366f1", fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "none", textAlign: "center" }}>
                            Open in Stripe ↗
                          </a>
                        )}
                        {!supportDeleteConfirm ? (
                          <button onClick={() => setSupportDeleteConfirm(true)} disabled={supportActionLoading}
                            style={{ background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 9, padding: "12px", color: "#dc2626", fontSize: 13, fontWeight: 600, cursor: "pointer", gridColumn: sub?.stripe_customer_id ? "span 1" : "span 2" }}>
                            Delete Account
                          </button>
                        ) : (
                          <div style={{ gridColumn: "span 2", background: "rgba(220,38,38,0.05)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 9, padding: "14px" }}>
                            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#dc2626", fontWeight: 600 }}>Permanently delete {supportUser.full_name || supportUser.email}?</p>
                            <div style={{ display: "flex", gap: 8 }}>
                              <button onClick={() => setSupportDeleteConfirm(false)} style={{ flex: 1, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "9px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                              <button onClick={supportDeleteUser} disabled={supportActionLoading}
                                style={{ flex: 1, background: "#dc2626", border: "none", borderRadius: 7, padding: "9px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                                {supportActionLoading ? "Deleting…" : "Delete Forever"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ────── USERS TAB ────── */}
        {tab === "members" && membersTab === "users" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Users</h2>
              <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input value={usersSearch} onChange={e => setUsersSearch(e.target.value)} placeholder="Search by name or email…" style={{ border: "none", outline: "none", fontSize: 13, color: "#0f172a", background: "transparent", width: 220 }} />
                </div>
                <button onClick={loadUsers} style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 7, padding: "8px 16px", color: "#f87171", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Refresh</button>
              </div>
            </div>

            {usersLoading ? (
              <div style={{ textAlign: "center", padding: 60, color: "#9ca3af" }}>Loading…</div>
            ) : (
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                      {["Name", "Email", "Type", "Tier", "Subscription", "Joined", ""].map(h => (
                        <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.filter(u => !usersSearch || (u.email || "").toLowerCase().includes(usersSearch.toLowerCase()) || (u.full_name || "").toLowerCase().includes(usersSearch.toLowerCase())).map((u, i, arr) => (
                      <tr key={u.id} style={{ borderBottom: i < arr.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                        <td style={{ padding: "14px 16px", fontWeight: 600, color: "#0f172a" }}>{u.full_name || u.username || "—"}</td>
                        <td style={{ padding: "14px 16px", color: "#6b7280" }}>{u.email}</td>
                        <td style={{ padding: "14px 16px" }}>
                          {u.isStreamer
                            ? <span style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600, color: "#dc2626" }}>User + Streamer</span>
                            : <span style={{ background: "rgba(79,70,229,0.08)", border: "1px solid rgba(79,70,229,0.2)", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600, color: "#4f46e5" }}>User</span>
                          }
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          <select value={u.access_tier || "production"} onChange={e => setUserAccessTier(u.id, e.target.value)}
                            style={{ fontSize: 12, padding: "4px 8px", borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", color: (u.access_tier && u.access_tier !== "production") ? "#7c3aed" : "#374151", fontWeight: (u.access_tier && u.access_tier !== "production") ? 700 : 400, cursor: "pointer" }}>
                            <option value="production">Production</option>
                            <option value="test">Test</option>
                          </select>
                        </td>
                        <td style={{ padding: "14px 16px" }}>
                          {u.subscription ? (
                            <span style={{ background: u.subscription.status === "active" ? "rgba(52,211,153,0.1)" : "rgba(248,113,113,0.1)", color: u.subscription.status === "active" ? "#059669" : "#dc2626", border: `1px solid ${u.subscription.status === "active" ? "rgba(52,211,153,0.3)" : "rgba(248,113,113,0.3)"}`, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>
                              {u.subscription.plan === "comp" ? "COMP" : u.subscription.status}
                            </span>
                          ) : (
                            <span style={{ color: "#9ca3af", fontSize: 12 }}>None</span>
                          )}
                        </td>
                        <td style={{ padding: "14px 16px", color: "#6b7280", whiteSpace: "nowrap" }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</td>
                        <td style={{ padding: "14px 16px" }}>
                          <button onClick={() => setDeleteUserConfirm(u)} style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 6, padding: "5px 12px", color: "#dc2626", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {deleteUserConfirm && (
              <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 500, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: "#fff", borderRadius: 16, padding: "32px 36px", maxWidth: 400, width: "90%", textAlign: "center" }}>
                  <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "#0f172a" }}>Delete user?</p>
                  <p style={{ fontSize: 14, color: "#374151", marginBottom: 4 }}>{deleteUserConfirm.full_name}</p>
                  <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 6 }}>{deleteUserConfirm.email}</p>
                  <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 28 }}>This permanently deletes their account, profiles, subscription, and all watch data. Cannot be undone.</p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setDeleteUserConfirm(null)} disabled={deletingUser} style={{ flex: 1, background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "11px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    <button onClick={() => deleteUser(deleteUserConfirm.id)} disabled={deletingUser} style={{ flex: 1, background: "#dc2626", border: "none", borderRadius: 7, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: deletingUser ? "not-allowed" : "pointer", opacity: deletingUser ? 0.7 : 1 }}>
                      {deletingUser ? "Deleting…" : "Delete Forever"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "members" && membersTab === "subscriptions" && (() => {
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
        {tab === "security" && (() => {
          const now = new Date();
          return (
            <div style={{ maxWidth: 760 }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 32 }}>
                <button onClick={() => setCreatorsTab("list")} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#374151", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
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

        {tab === "settings" && (
          <div style={{ maxWidth: 700 }}>
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Settings</h2>
              <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>Platform controls and admin access.</p>
            </div>

            {/* ── Admin Access (owner only) ── */}
            {currentUser?.email?.toLowerCase() === "jacob.furlow@outlook.com" && (
              <AdminAccessCard supabaseUrl={SUPABASE_URL} currentUser={currentUser} />
            )}

            {/* ── Boss Goals + TODO ── */}
            {(() => {
              const goals = bossTodos.filter(t => t.section === "goal");
              const todos = bossTodos.filter(t => t.section === "todo");
              const totalDone = bossTodos.filter(t => t.done).length;
              const renderItem = t => {
                const labelMeta = TODO_LABELS.find(l => l.name === t.label);
                return (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: t.done ? "#f8fafc" : "#fff", border: "1px solid #f1f5f9", borderRadius: 8 }}>
                    <button onClick={() => toggleTodo(t.id)} style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${t.done ? "#7c3aed" : "#d1d5db"}`, background: t.done ? "#7c3aed" : "#fff", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                      {t.done && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </button>
                    <span style={{ flex: 1, fontSize: 13, color: t.done ? "#9ca3af" : "#0f172a", textDecoration: t.done ? "line-through" : "none" }}>{t.text}</span>
                    {labelMeta && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: labelMeta.color + "18", color: labelMeta.color, whiteSpace: "nowrap" }}>{labelMeta.name}</span>}
                    <button onClick={() => deleteTodo(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#d1d5db", fontSize: 16, lineHeight: 1, padding: "0 2px" }}>×</button>
                  </div>
                );
              };
              const renderAddRow = (val, setVal, labelVal, setLabelVal, onAdd, placeholder) => (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <select value={labelVal} onChange={e => setLabelVal(e.target.value)} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 10px", fontSize: 12, color: labelVal ? "#0f172a" : "#9ca3af", outline: "none", background: "#fff", flexShrink: 0 }}>
                    <option value="">Label</option>
                    {TODO_LABELS.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
                  </select>
                  <input value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === "Enter" && onAdd()} placeholder={placeholder} style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#0f172a", outline: "none" }} />
                  <button onClick={onAdd} style={{ background: "#facc15", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 13, fontWeight: 700, color: "#0a0a0a", cursor: "pointer", whiteSpace: "nowrap" }}>Add</button>
                </div>
              );
              return (
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "24px 28px", marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Boss Board</p>
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>{totalDone} of {bossTodos.length} done</span>
                  </div>

                  {/* Goals */}
                  <div style={{ marginBottom: 24 }}>
                    <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6 }}>Goals — {goals.filter(t => t.done).length}/{goals.length}</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {goals.length === 0 && <p style={{ margin: 0, fontSize: 13, color: "#d1d5db", padding: "8px 0" }}>No goals yet</p>}
                      {goals.map(renderItem)}
                    </div>
                    {renderAddRow(newGoal, setNewGoal, newGoalLabel, setNewGoalLabel, addGoal, "Add a goal...")}
                  </div>

                  <div style={{ height: 1, background: "#f1f5f9", marginBottom: 20 }} />

                  {/* To-Do */}
                  <div>
                    <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6 }}>To-Do — {todos.filter(t => t.done).length}/{todos.length}</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {todos.length === 0 && <p style={{ margin: 0, fontSize: 13, color: "#d1d5db", padding: "8px 0" }}>No tasks yet</p>}
                      {todos.map(renderItem)}
                    </div>
                    {renderAddRow(newTodo, setNewTodo, newTodoLabel, setNewTodoLabel, addTodo, "Add a task...")}
                  </div>
                </div>
              );
            })()}

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

            {/* ── Fraud Detection Toggle ── */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "24px 28px", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                <div>
                  <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Payout Fraud Detection</p>
                  <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>Flags creators where one account drives over 40% of their watch time. Turn on once you have enough real viewers.</p>
                </div>
                <button
                  onClick={() => { const next = bossSettings.fraud_detection_enabled !== "true"; saveSetting("fraud_detection_enabled", String(next)); showToast(next ? "Fraud detection ON" : "Fraud detection OFF"); }}
                  style={{ width: 52, height: 28, borderRadius: 14, border: "none", cursor: "pointer", background: bossSettings.fraud_detection_enabled === "true" ? "#7c3aed" : "#d1d5db", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                  <span style={{ position: "absolute", top: 4, left: bossSettings.fraud_detection_enabled === "true" ? 26 : 4, width: 20, height: 20, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.15)", transition: "left 0.2s" }} />
                </button>
              </div>
            </div>

            {/* ── Beta Access Code ── */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "24px 28px", marginBottom: 20 }}>
              <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Beta Access Code</p>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: "#9ca3af" }}>Visitors must enter this code to access the site. Leave blank to disable the gate.</p>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  defaultValue={bossSettings.beta_code || ""}
                  id="beta-code-input"
                  placeholder="e.g. PEEP2026"
                  style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, color: "#0f172a", outline: "none" }}
                />
                <button
                  onClick={() => {
                    const val = document.getElementById("beta-code-input").value.trim();
                    saveSetting("beta_code", val);
                    showToast(val ? `Access code set to "${val}"` : "Beta gate disabled");
                  }}
                  style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#0f172a", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
                >Save</button>
              </div>
            </div>

            {/* ── Creators Card ── */}
            <div onClick={() => { setSection("streaming"); setTab("creators"); setCreatorsTab("list"); }}
              style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "22px 28px", marginBottom: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "box-shadow 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"}
              onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fb923c" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                </div>
                <div>
                  <p style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Content Partners</p>
                  <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>Manage content partner agreements and revenue share</p>
                </div>
              </div>
              <span style={{ fontSize: 18, color: "#d1d5db" }}>→</span>
            </div>

            {/* ── Review Queue Card ── */}
            <div onClick={() => { setSection("streaming"); setTab("creators"); setCreatorsTab("review"); }}
              style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "22px 28px", marginBottom: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "box-shadow 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"}
              onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(250,204,21,0.08)", border: "1px solid rgba(250,204,21,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, position: "relative" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#facc15" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>
                  {pendingCount > 0 && (
                    <span style={{ position: "absolute", top: -6, right: -6, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 99, minWidth: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{pendingCount}</span>
                  )}
                </div>
                <div>
                  <p style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Review Queue</p>
                  <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>{pendingCount > 0 ? `${pendingCount} episode${pendingCount !== 1 ? "s" : ""} waiting for review` : "No pending uploads"}</p>
                </div>
              </div>
              <span style={{ fontSize: 18, color: "#d1d5db" }}>→</span>
            </div>

            {/* ── Payouts Card ── */}
            <div onClick={() => { setSection("streaming"); setTab("creators"); setCreatorsTab("payouts"); setPayoutView("current"); }}
              style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "22px 28px", marginBottom: 20, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "box-shadow 0.15s" }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"}
              onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/><line x1="12" y1="12" x2="12" y2="16"/><line x1="10" y1="14" x2="14" y2="14"/></svg>
                </div>
                <div>
                  <p style={{ margin: "0 0 3px", fontSize: 15, fontWeight: 600, color: "#0f172a" }}>Payouts</p>
                  <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>Calculate and track monthly partner revenue share</p>
                </div>
              </div>
              <span style={{ fontSize: 18, color: "#d1d5db" }}>→</span>
            </div>

            {/* ── Security Card ── */}
            <div onClick={() => { setSection("system"); setTab("security"); loadSecurityData(); }}
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

        {/* ────── MODERATION TAB ────── */}
        {tab === "moderation" && (
          <div style={{ maxWidth: 900 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Moderation</h2>
                <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>Content reports and global word filter.</p>
              </div>
              <button onClick={loadContentReports} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 16px", fontSize: 13, color: "#374151", cursor: "pointer", fontWeight: 500 }}>Refresh</button>
            </div>

            {/* Global banned words */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 24, marginBottom: 24 }}>
              <h3 style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Global Word Filter</h3>
              <p style={{ margin: "0 0 16px", fontSize: 13, color: "#6b7280" }}>Blocked in all live chat, site-wide. Applies on top of each channel's own banned words.</p>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input value={bannedWordInput} onChange={e => setBannedWordInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && bannedWordInput.trim()) { const w = bannedWordInput.trim().toLowerCase(); if (!globalBannedWords.includes(w)) saveGlobalBannedWords([...globalBannedWords, w]); setBannedWordInput(""); }}} placeholder="Add a word or phrase…" style={{ flex: 1, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#0f172a", outline: "none" }} />
                <button onClick={() => { const w = bannedWordInput.trim().toLowerCase(); if (w && !globalBannedWords.includes(w)) { saveGlobalBannedWords([...globalBannedWords, w]); setBannedWordInput(""); }}} style={{ background: "#0f172a", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Add</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {globalBannedWords.length === 0 && <span style={{ fontSize: 13, color: "#9ca3af" }}>No words added yet.</span>}
                {globalBannedWords.map(w => (
                  <span key={w} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 10px", fontSize: 13, color: "#dc2626", fontWeight: 500 }}>
                    {w}
                    <button onClick={() => saveGlobalBannedWords(globalBannedWords.filter(x => x !== w))} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                  </span>
                ))}
              </div>
            </div>

            {/* Reports queue */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #e2e8f0" }}>
                {[
                  { value: "pending", label: "Pending" },
                  { value: "actioned", label: "Resolved" },
                  { value: "dismissed", label: "Dismissed" },
                  { value: "all", label: "All" },
                ].map(({ value: f, label }) => {
                  const count = f === "all" ? contentReports.length : contentReports.filter(r => r.status === f).length;
                  return (
                    <button key={f} onClick={() => setReportsFilter(f)} style={{ flex: 1, background: reportsFilter === f ? "#f8fafc" : "transparent", border: "none", borderBottom: reportsFilter === f ? "2px solid #fb923c" : "none", padding: "12px 8px", fontSize: 13, fontWeight: reportsFilter === f ? 600 : 400, color: reportsFilter === f ? "#0f172a" : "#6b7280", cursor: "pointer" }}>
                      {label} {count > 0 && <span style={{ background: f === "pending" ? "#fef2f2" : "#f1f5f9", color: f === "pending" ? "#dc2626" : "#6b7280", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{count}</span>}
                    </button>
                  );
                })}
              </div>

              {reportsLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>Loading…</div>
              ) : (() => {
                const visible = reportsFilter === "all" ? contentReports : contentReports.filter(r => r.status === reportsFilter);
                if (visible.length === 0) return <div style={{ padding: 40, textAlign: "center", color: "#9ca3af", fontSize: 14 }}>No {reportsFilter} reports.</div>;
                return (
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                        {["Channel", "Reason", "Status", "Reported", "Actions"].map(h => (
                          <th key={h} style={{ padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#6b7280", textAlign: "left", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map(r => {
                        const statusLabel = r.status === "actioned" ? "Resolved" : r.status === "pending" ? "Pending" : "Dismissed";
                        const statusColor = r.status === "pending" ? "#dc2626" : r.status === "actioned" ? "#16a34a" : "#6b7280";
                        const statusBg = r.status === "pending" ? "#fef2f2" : r.status === "actioned" ? "#f0fdf4" : "#f1f5f9";
                        return (
                          <tr key={r.id} onClick={() => openReportDrawer(r)} style={{ borderBottom: "1px solid #f1f5f9", cursor: "pointer", transition: "background 0.1s" }}
                            onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                            onMouseLeave={e => e.currentTarget.style.background = ""}>
                            <td style={{ padding: "12px 16px", fontSize: 13, color: "#0f172a", fontWeight: 600 }}>
                              {r.channel_name || r.content_id}
                              {r.notes && <span title="Has investigation notes" style={{ marginLeft: 6, fontSize: 10, color: "#fb923c" }}>●</span>}
                            </td>
                            <td style={{ padding: "12px 16px", fontSize: 13, color: "#374151", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.reason}</td>
                            <td style={{ padding: "12px 16px" }}>
                              <span style={{ display: "inline-block", background: statusBg, color: statusColor, borderRadius: 6, padding: "2px 9px", fontSize: 12, fontWeight: 600 }}>{statusLabel}</span>
                            </td>
                            <td style={{ padding: "12px 16px", fontSize: 12, color: "#9ca3af" }}>{new Date(r.created_at).toLocaleDateString()}</td>
                            <td style={{ padding: "12px 16px" }}>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={e => { e.stopPropagation(); openReportDrawer(r); }}
                                  style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 12px", fontSize: 12, color: "#374151", fontWeight: 600, cursor: "pointer" }}>
                                  Review →
                                </button>
                                <button onClick={e => { e.stopPropagation(); if (window.confirm("Delete this report permanently?")) deleteReport(r.id); }}
                                  style={{ background: "none", border: "1px solid #fecaca", borderRadius: 6, padding: "5px 10px", fontSize: 12, color: "#dc2626", fontWeight: 600, cursor: "pointer" }}>
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                );
              })()}
            </div>
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
                  {tab === "content" && videoSubTab === "shorts" && (editingId ? "Edit Movie" : "Add Movie")}
                  {tab === "content" && videoSubTab === "series" && (editingShowId ? "Edit Series" : "Add Series")}
                  {tab === "content" && videoSubTab === "episodes" && (editingEpisodeId ? "Edit Episode" : "Add Episode")}
                  {tab === "content" && videoSubTab === "podcasts" && (editingPodcastId ? "Edit Podcast" : "Add Podcast")}
                  {tab === "content" && videoSubTab === "carousels" && (editingCarouselId ? "Edit Carousel" : "Add Carousel")}
                  {tab === "live" && liveSubTab === "channels" && (editingChannelId ? "Edit Channel" : "Add Channel")}
                  {tab === "live" && liveSubTab !== "channels" && drawerFormType !== "epg" && drawerFormType !== "bulk" && (editingLiveId ? "Edit Stream" : "Add Stream")}
                  {tab === "live" && drawerFormType === "epg" && (editingEpgId ? "Edit Program" : "Add Program")}
                  {tab === "live" && drawerFormType === "bulk" && "Auto-Schedule Block"}
                  {tab === "analytics" && analyticsTab === "ads" && (editingAdId ? "Edit Ad Tag" : "Add Ad Tag")}
                  {drawerFormType === "report" && "Report Details"}
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

                {/* ── REPORT DETAIL ── */}
                {drawerFormType === "report" && selectedReport && (() => {
                  const r = selectedReport;
                  const statusColor = r.status === "pending" ? "#dc2626" : r.status === "actioned" ? "#16a34a" : "#6b7280";
                  const statusBg = r.status === "pending" ? "#fef2f2" : r.status === "actioned" ? "#f0fdf4" : "#f1f5f9";
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                      {/* Status + Channel */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ background: statusBg, color: statusColor, borderRadius: 6, padding: "3px 11px", fontSize: 12, fontWeight: 700, textTransform: "capitalize" }}>{r.status}</span>
                        <span style={{ fontSize: 12, color: "#9ca3af" }}>{new Date(r.created_at).toLocaleString()}</span>
                      </div>

                      {/* Channel */}
                      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
                        <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>Reported Channel</p>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{r.channel_name || r.content_id}</p>
                          <a href={`/stream/${r.content_id}`} target="_blank" rel="noopener noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#0f172a", color: "#fff", borderRadius: 6, padding: "4px 10px", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                            Visit
                          </a>
                        </div>
                      </div>

                      {/* Reason */}
                      <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 10, padding: 16 }}>
                        <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>Reported For</p>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#7c2d12" }}>{r.reason}</p>
                      </div>

                      {/* Reporter */}
                      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 }}>
                        <p style={{ margin: "0 0 8px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>Reporter</p>
                        {!r.reporter_id ? (
                          <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>Anonymous (not signed in)</p>
                        ) : reporterProfile === null ? (
                          <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>Loading…</p>
                        ) : reporterProfile === false ? (
                          <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>Profile not found</p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{reporterProfile?.full_name || reporterProfile?.username || "—"}</p>
                            {reporterProfile?.username && <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>@{reporterProfile.username}</p>}
                            <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>{r.reporter_id}</p>
                          </div>
                        )}
                      </div>

                      {/* VODs */}
                      <div>
                        <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>
                          Channel VODs
                          {r.status === "pending"
                            ? <span style={{ marginLeft: 6, color: "#ef4444", fontWeight: 500, fontSize: 10, textTransform: "none", letterSpacing: 0 }}>⚠ Locked from deletion</span>
                            : <span style={{ marginLeft: 6, color: "#16a34a", fontWeight: 500, fontSize: 10, textTransform: "none", letterSpacing: 0 }}>✓ Deletion unlocked</span>
                          }
                        </p>
                        {reportVodsLoading ? (
                          <p style={{ fontSize: 13, color: "#9ca3af" }}>Loading recordings…</p>
                        ) : reportVods.length === 0 ? (
                          <p style={{ fontSize: 13, color: "#9ca3af" }}>No recordings found for this channel.</p>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {reportPlayingVod && (
                              <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #e2e8f0", marginBottom: 4 }}>
                                <iframe
                                  src={`https://iframe.cloudflarestream.com/${reportPlayingVod}`}
                                  style={{ width: "100%", aspectRatio: "16/9", border: "none", display: "block" }}
                                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                                  allowFullScreen
                                />
                                <button onClick={() => setReportPlayingVod(null)}
                                  style={{ width: "100%", background: "#f8fafc", border: "none", borderTop: "1px solid #e2e8f0", padding: "8px", fontSize: 12, color: "#6b7280", cursor: "pointer" }}>
                                  Close player ×
                                </button>
                              </div>
                            )}
                            {reportVods.map(v => {
                              const title = (v.meta?.name && !/peep live/i.test(v.meta.name))
                                ? v.meta.name
                                : new Date(v.created).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
                              const dur = v.duration
                                ? `${Math.floor(v.duration / 3600) > 0 ? Math.floor(v.duration / 3600) + "h " : ""}${Math.floor((v.duration % 3600) / 60)}m`
                                : null;
                              const playing = reportPlayingVod === v.uid;
                              return (
                                <div key={v.uid} style={{ display: "flex", alignItems: "center", gap: 10, background: playing ? "#f0fdf4" : "#f8fafc", border: `1px solid ${playing ? "#bbf7d0" : "#e2e8f0"}`, borderRadius: 8, padding: "8px 10px", cursor: "pointer", transition: "all 0.1s" }}
                                  onClick={() => setReportPlayingVod(playing ? null : v.uid)}>
                                  <div style={{ width: 64, height: 36, borderRadius: 5, overflow: "hidden", flexShrink: 0, background: "#e2e8f0", position: "relative" }}>
                                    {v.thumbnail
                                      ? <img src={v.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                          <svg width="16" height="16" viewBox="0 0 24 24" fill="#9ca3af"><polygon points="5,3 19,12 5,21"/></svg>
                                        </div>
                                    }
                                    {!playing && (
                                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.3)" }}>
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
                                      </div>
                                    )}
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</p>
                                    {dur && <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>{dur}</p>}
                                  </div>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: playing ? "#16a34a" : "#6b7280", flexShrink: 0 }}>{playing ? "Playing" : "Play"}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Admin notes */}
                      <div>
                        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Investigation Notes</label>
                        <textarea
                          value={reportNotes}
                          onChange={e => setReportNotes(e.target.value)}
                          placeholder="Add notes about what you found, actions taken, etc…"
                          rows={5}
                          style={{ width: "100%", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#0f172a", outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }}
                          onFocus={e => e.target.style.borderColor = "#fb923c"}
                          onBlur={e => e.target.style.borderColor = "#e2e8f0"}
                        />
                        <button onClick={saveReportNotes} disabled={notesSaving}
                          style={{ marginTop: 8, background: "#0f172a", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: notesSaving ? 0.6 : 1 }}>
                          {notesSaving ? "Saving…" : "Save Notes"}
                        </button>
                      </div>

                      {/* Actions */}
                      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                        {r.status === "pending" ? (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => updateReportStatus(r.id, "actioned")}
                              style={{ flex: 1, background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "11px", fontSize: 13, color: "#16a34a", fontWeight: 700, cursor: "pointer" }}>
                              ✓ Mark Resolved
                            </button>
                            <button onClick={() => updateReportStatus(r.id, "dismissed")}
                              style={{ flex: 1, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "11px", fontSize: 13, color: "#6b7280", fontWeight: 700, cursor: "pointer" }}>
                              Dismiss
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => updateReportStatus(r.id, "pending")}
                            style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "9px", fontSize: 13, color: "#ea580c", fontWeight: 600, cursor: "pointer" }}>
                            Re-open as Pending
                          </button>
                        )}
                        <button onClick={() => { if (window.confirm("Delete this report permanently? The VOD lock will be lifted immediately.")) deleteReport(r.id); }}
                          style={{ background: "none", border: "1px solid #fecaca", borderRadius: 8, padding: "9px", fontSize: 13, color: "#dc2626", fontWeight: 600, cursor: "pointer" }}>
                          Delete Report Permanently
                        </button>
                      </div>
                    </div>
                  );
                })()}

                {/* ── MOVIES FORM ── */}
                {tab === "content" && videoSubTab === "shorts" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <FieldInput label="Title *" value={form.title} onChange={v => setForm(f => ({ ...f, title: v }))} placeholder="e.g. Metropolis" />
                    <PremiumToggleButton on={form.is_premium} onToggle={() => setForm(f => ({ ...f, is_premium: !f.is_premium }))} />
                    <TierSelect value={form.visibility_tier} onChange={v => setForm(f => ({ ...f, visibility_tier: v }))} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <FieldCombo label="Category" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={categories} />
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
                      <div style={{ display: "flex", gap: 8 }}>
                        <input type="text" value={form.thumbnail} onChange={e => setForm(f => ({ ...f, thumbnail: e.target.value }))} placeholder="https://… or upload →" style={{ flex: 1, minWidth: 0, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                        <UploadButton onUploaded={url => setForm(f => ({ ...f, thumbnail: url }))} />
                      </div>
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
                      <div style={{ display: "flex", gap: 8 }}>
                        <input type="text" value={form.poster} onChange={e => setForm(f => ({ ...f, poster: e.target.value }))} placeholder="https://… or upload →" style={{ flex: 1, minWidth: 0, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                        <UploadButton onUploaded={url => setForm(f => ({ ...f, poster: url }))} />
                      </div>
                      {form.poster && (
                        <div style={{ marginTop: 10, borderRadius: 6, overflow: "hidden", border: "1px solid #e2e8f0", width: 80 }}>
                          <img src={form.poster} alt="Poster preview" style={{ width: "100%", aspectRatio: "2/3", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />
                        </div>
                      )}
                    </div>
                    <FieldInput label="Video URL *" value={form.url} onChange={v => setForm(f => ({ ...f, url: v }))} placeholder="https://..." />
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
                {tab === "content" && videoSubTab === "series" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <FieldInput label="Title *" value={showForm.title} onChange={v => setShowForm(f => ({ ...f, title: v }))} placeholder="e.g. The Twilight Zone" />
                    <PremiumToggleButton on={showForm.is_premium} onToggle={() => setShowForm(f => ({ ...f, is_premium: !f.is_premium }))} />
                    <TierSelect value={showForm.visibility_tier} onChange={v => setShowForm(f => ({ ...f, visibility_tier: v }))} />
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <FieldCombo label="Category" value={showForm.category} onChange={v => setShowForm(f => ({ ...f, category: v }))} options={categories} />
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
                {tab === "content" && videoSubTab === "episodes" && (
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
                {tab === "content" && videoSubTab === "podcasts" && (
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
                      <div style={{ marginTop: 16 }}>
                        <TierSelect value={podcastForm.visibility_tier} onChange={v => setPodcastForm(f => ({ ...f, visibility_tier: v }))} />
                      </div>
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
                {tab === "content" && videoSubTab === "carousels" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                    <p style={{ margin: "0 0 4px", fontSize: 12, color: "#6b7280" }}>A horizontal scrolling row shown on selected pages.</p>

                    <div>
                      <label style={{ display: "block", fontSize: 11, color: "#4f46e5", fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>1 · Row Title</label>
                      <FieldInput value={carouselForm.title} onChange={v => setCarouselForm(f => ({ ...f, title: v }))} placeholder="e.g. Too Weird For TV, Watch At 2AM, New Drops…" />
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        {["Too Weird For TV", "Certified Unhinged", "Watch At 2AM", "Your Parents Won't Get It", "Underground Classics", "New Drops", "Currently Obsessed With", "Just Added", "Live Now"].map(name => (
                          <button key={name} type="button" onClick={() => setCarouselForm(f => ({ ...f, title: name }))}
                            style={{ background: carouselForm.title === name ? "#4f46e5" : "#f1f5f9", border: "none", borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 600, color: carouselForm.title === name ? "#fff" : "#475569", cursor: "pointer", transition: "all 0.15s" }}>
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Location is already chosen by the screen tab you added from — just confirm it */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px" }}>
                      <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>Appears on</span>
                      {pagesArr.length === 0
                        ? <span style={{ fontSize: 12, color: "#dc2626" }}>No screen selected</span>
                        : pagesArr.map(p => (
                            <span key={p} style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "rgba(79,70,229,0.08)", color: "#4f46e5", border: "1px solid rgba(79,70,229,0.2)" }}>
                              {({ home: "🏠 Home", shorts: "🎬 Movies", series: "📺 Series", podcasts: "🎙️ Podcasts", live: "📡 Live TV" }[p] || p)}
                            </span>
                          ))}
                    </div>

                    <div style={{ height: 1, background: "#e2e8f0" }} />

                    <div>
                      <label style={{ display: "block", fontSize: 11, color: "#4f46e5", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>2 · Type</label>
                      <p style={{ margin: "0 0 10px", fontSize: 11, color: "#6b7280" }}>What kind of row is this?</p>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {[
                          { k: "vod",     icon: "🎬", label: "VOD",             desc: "Movies & series" },
                          { k: "live",    icon: "📡", label: "Live TV",         desc: "Your FAST channels" },
                          { k: "creator", icon: "🎥", label: "Creator Streams", desc: "Live creators" },
                          { k: "podcast", icon: "🎙️", label: "Podcasts",        desc: "Podcast shows" },
                        ].map(({ k, icon, label, desc }) => {
                          const curKind = carouselForm.type === "live_channels" ? "live" : carouselForm.type === "creator_streams" ? "creator" : carouselForm.type === "podcast" ? "podcast" : "vod";
                          const isActive = curKind === k;
                          return (
                            <button key={k} onClick={() => {
                              if (k === "live") setCarouselForm(f => ({ ...f, type: "live_channels", content_type: "all", filter_value: "" }));
                              else if (k === "creator") setCarouselForm(f => ({ ...f, type: "creator_streams", content_type: "all", filter_value: "" }));
                              else if (k === "podcast") setCarouselForm(f => ({ ...f, type: "podcast", content_type: "all", filter_value: "" }));
                              else setCarouselForm(f => ({ ...f, type: ["live_channels", "creator_streams", "podcast"].includes(f.type) ? "custom" : f.type, content_type: f.content_type || "all", filter_value: ["live_channels", "creator_streams", "podcast"].includes(f.type) ? "" : f.filter_value }));
                            }}
                              style={{ background: isActive ? "rgba(79,70,229,0.08)" : "#f8fafc", border: `1.5px solid ${isActive ? "#4f46e5" : "#e2e8f0"}`, borderRadius: 10, padding: "14px 12px", cursor: "pointer", textAlign: "left", transition: "border-color 0.15s, background 0.15s" }}>
                              <div style={{ fontSize: 22, marginBottom: 5 }}>{icon}</div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: isActive ? "#4f46e5" : "#374151", marginBottom: 2 }}>{label}</div>
                              <div style={{ fontSize: 11, color: "#6b7280" }}>{desc}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* VOD: which content */}
                    {!["podcast", "live_channels", "creator_streams"].includes(carouselForm.type) && (
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: "#374151", fontWeight: 600, marginBottom: 8 }}>Which content?</label>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                          {[
                            { ct: "shorts", icon: "🎬", label: "Movies" },
                            { ct: "shows",  icon: "📺", label: "Series" },
                            { ct: "all",    icon: "⭐", label: "Everything" },
                          ].map(({ ct, icon, label }) => {
                            const on = carouselForm.content_type === ct;
                            return (
                              <button key={ct} onClick={() => setCarouselForm(f => ({ ...f, content_type: ct }))}
                                style={{ background: on ? "rgba(79,70,229,0.08)" : "#f8fafc", border: `1.5px solid ${on ? "#4f46e5" : "#e2e8f0"}`, borderRadius: 9, padding: "11px 8px", cursor: "pointer", textAlign: "center", transition: "border-color 0.15s, background 0.15s" }}>
                                <div style={{ fontSize: 18, marginBottom: 3 }}>{icon}</div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: on ? "#4f46e5" : "#374151" }}>{label}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {carouselForm.type === "live_channels" && (
                      <div style={{ marginTop: 6, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14 }}>
                        <label style={{ display: "block", fontSize: 12, color: "#374151", fontWeight: 600, marginBottom: 8 }}>Which channels?</label>
                        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                          {[{ v: "", l: "All live channels" }, { v: "__cat__", l: "By category" }].map(o => {
                            const on = o.v === "__cat__" ? (carouselForm.filter_value && carouselForm.filter_value !== "") : (!carouselForm.filter_value);
                            return (
                              <button key={o.l} onClick={() => setCarouselForm(f => ({ ...f, filter_value: o.v === "__cat__" ? (f.filter_value || "news") : "" }))}
                                style={{ flex: 1, background: on ? "rgba(79,70,229,0.08)" : "#fff", border: `1.5px solid ${on ? "#4f46e5" : "#e2e8f0"}`, borderRadius: 8, padding: "9px 10px", fontSize: 12, fontWeight: 600, color: on ? "#4f46e5" : "#374151", cursor: "pointer" }}>{o.l}</button>
                            );
                          })}
                        </div>
                        {carouselForm.filter_value && carouselForm.filter_value !== "" && (
                          <input value={carouselForm.filter_value} onChange={e => setCarouselForm(f => ({ ...f, filter_value: e.target.value }))}
                            placeholder="Category (e.g. news, sports, music) — matches the channel's Category field"
                            style={{ width: "100%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "9px 12px", color: "#0f172a", fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                        )}
                      </div>
                    )}

                    {carouselForm.type === "creator_streams" && (
                      <div style={{ marginTop: 6, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, fontSize: 12, color: "#6b7280" }}>
                        Shows every creator who's currently live. Great as a "Live Now" row.
                      </div>
                    )}

                    {!["podcast", "live_channels", "creator_streams"].includes(carouselForm.type) ? (
                      <div style={{ marginTop: 6 }}>
                        <label style={{ display: "block", fontSize: 12, color: "#374151", fontWeight: 600, marginBottom: 8 }}>…and how it's chosen</label>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {[
                            { val: "custom",      icon: "📋", label: "Everything",        desc: "Every title of the chosen type" },
                            { val: "trending",    icon: "🔥", label: "Recently Added",    desc: "Newest titles first" },
                            { val: "recommended", icon: "🪄", label: "Recommended",       desc: "Personalized picks from each viewer's history" },
                            { val: "continue",    icon: "⏱️", label: "Continue Watching", desc: "In-progress titles for the signed-in viewer" },
                            { val: "category",    icon: "🏷️", label: "By category",     desc: "Filter to a specific genre" },
                            { val: "handpicked",  icon: "🎯", label: "Hand-pick",        desc: "Choose specific titles" },
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
                            <label style={{ display: "block", fontSize: 11, color: "#6b7280", marginBottom: 6, fontWeight: 600 }}>
                              Category name
                            </label>
                            <input value={carouselForm.filter_value} onChange={e => setCarouselForm(f => ({ ...f, filter_value: e.target.value }))}
                              placeholder="e.g. Horror, Comedy, Sci-Fi…"
                              style={{ width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "9px 12px", color: "#0f172a", fontSize: 13, outline: "none" }}
                              onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                            <p style={{ margin: "6px 0 0", fontSize: 11, color: "#9ca3af" }}>
                              Must match exactly as set on your videos (case-insensitive).
                            </p>
                          </div>
                        )}

                        {carouselForm.type === "handpicked" && (() => {
                          const pool = [
                            ...rows.map(v => ({ id: v.id, type: "movie", title: v.title, subtitle: v.category, thumbnail: v.poster || v.thumbnail })),
                            ...showsList.map(s => ({ id: s.id, type: "show", title: s.title, subtitle: "Series", thumbnail: s.poster || s.thumbnail })),
                          ];
                          const q = handpickedSearch.toLowerCase().trim();
                          const results = q ? pool.filter(item =>
                            item.title?.toLowerCase().startsWith(q)
                          ).slice(0, 12) : [];
                          const selectedKey = item => `${item.type}_${item.id}`;
                          const selectedKeys = new Set(handpickedSelected.map(selectedKey));
                          const typeLabel = t => t === "movie" ? "Short" : t === "show" ? "Series" : t;
                          const typeColor = t => t === "movie" ? "#facc15" : t === "show" ? "#60a5fa" : "#4ade80";

                          return (
                            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 10 }}>
                              {/* Search input */}
                              <input
                                value={handpickedSearch}
                                onChange={e => setHandpickedSearch(e.target.value)}
                                placeholder="Search movies, series, music videos..."
                                style={{ width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                                onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")}
                              />

                              {/* Search results */}
                              {results.length > 0 && (
                                <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, overflow: "hidden" }}>
                                  {results.map(item => {
                                    const key = selectedKey(item);
                                    const isSelected = selectedKeys.has(key);
                                    return (
                                      <div key={key}
                                        onClick={() => {
                                          if (isSelected) setHandpickedSelected(prev => prev.filter(s => selectedKey(s) !== key));
                                          else setHandpickedSelected(prev => [...prev, item]);
                                        }}
                                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer", borderBottom: "1px solid #f1f5f9", background: isSelected ? "rgba(79,70,229,0.06)" : "transparent", transition: "background 0.1s" }}
                                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#f1f5f9"; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = isSelected ? "rgba(79,70,229,0.06)" : "transparent"; }}>
                                        <div style={{ width: 36, height: 36, borderRadius: 5, overflow: "hidden", flexShrink: 0, background: "#e2e8f0" }}>
                                          {item.thumbnail && <img src={item.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <p style={{ margin: "0 0 2px", fontSize: 13, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</p>
                                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: typeColor(item.type) }}>{typeLabel(item.type)}</span>
                                            {item.subtitle && <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.subtitle}</span>}
                                          </div>
                                        </div>
                                        <div style={{ width: 22, height: 22, borderRadius: 5, border: `2px solid ${isSelected ? "#4f46e5" : "#e2e8f0"}`, background: isSelected ? "#4f46e5" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s" }}>
                                          {isSelected && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              {q && results.length === 0 && (
                                <p style={{ margin: 0, fontSize: 12, color: "#9ca3af", padding: "8px 0" }}>No results for "{handpickedSearch}"</p>
                              )}

                              {/* Selected items */}
                              {handpickedSelected.length > 0 && (
                                <div>
                                  <p style={{ margin: "0 0 8px", fontSize: 11, color: "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                    Selected ({handpickedSelected.length}) — drag to reorder
                                  </p>
                                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {handpickedSelected.map((item, idx) => (
                                      <div key={selectedKey(item)} style={{ display: "flex", alignItems: "center", gap: 8, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px 10px" }}>
                                        <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, width: 18, textAlign: "center", flexShrink: 0 }}>{idx + 1}</span>
                                        <div style={{ width: 30, height: 30, borderRadius: 4, overflow: "hidden", flexShrink: 0, background: "#e2e8f0" }}>
                                          {item.thumbnail && <img src={item.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.title}</p>
                                          {item.subtitle && <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>{item.subtitle}</p>}
                                        </div>
                                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                          <button onClick={() => {
                                            if (idx === 0) return;
                                            const next = [...handpickedSelected];
                                            [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                            setHandpickedSelected(next);
                                          }} disabled={idx === 0} style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 4, width: 24, height: 24, cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? "#e2e8f0" : "#6b7280", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>▲</button>
                                          <button onClick={() => {
                                            if (idx === handpickedSelected.length - 1) return;
                                            const next = [...handpickedSelected];
                                            [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
                                            setHandpickedSelected(next);
                                          }} disabled={idx === handpickedSelected.length - 1} style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 4, width: 24, height: 24, cursor: idx === handpickedSelected.length - 1 ? "default" : "pointer", color: idx === handpickedSelected.length - 1 ? "#e2e8f0" : "#6b7280", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>▼</button>
                                          <button onClick={() => setHandpickedSelected(prev => prev.filter((_, i) => i !== idx))}
                                            style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 4, width: 24, height: 24, cursor: "pointer", color: "#f87171", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {handpickedSelected.length === 0 && !q && (
                                <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>Search above to add titles to this row.</p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    ) : carouselForm.type === "podcast" ? (
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: "#374151", fontWeight: 600, marginBottom: 8 }}>…and filter by tag (optional)</label>
                        <input value={carouselForm.filter_value} onChange={e => setCarouselForm(f => ({ ...f, filter_value: e.target.value }))}
                          placeholder="e.g. true-crime — leave blank to show all podcasts"
                          style={{ width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none" }}
                          onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                      </div>
                    ) : null}

                    <div style={{ height: 1, background: "#e2e8f0" }} />

                    {carouselForm.type !== "podcast" && (
                      <div>
                        <label style={{ display: "block", fontSize: 11, color: "#4f46e5", fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.8 }}>3 · Presentation</label>
                        <p style={{ margin: "0 0 10px", fontSize: 11, color: "#6b7280" }}>How this shelf looks on the home screen.</p>
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                          {[
                            { val: "standard",  icon: "🎞️", label: "Standard row", desc: "Normal poster cards" },
                            { val: "top10",     icon: "🔢", label: "Top 10",        desc: "Big ranked numbers behind each card" },
                            { val: "spotlight", icon: "🖼️", label: "Spotlight",     desc: "Larger cards for a featured feel" },
                          ].map(({ val, icon, label, desc }) => {
                            const isActive = (carouselForm.layout || "standard") === val;
                            return (
                              <button key={val} onClick={() => setCarouselForm(f => ({ ...f, layout: val }))}
                                style={{ background: isActive ? "rgba(79,70,229,0.08)" : "#f8fafc", border: `1.5px solid ${isActive ? "#4f46e5" : "#e2e8f0"}`, borderRadius: 9, padding: "11px 14px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12 }}>
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
                      </div>
                    )}

                    {carouselForm.type !== "podcast" && <div style={{ height: 1, background: "#e2e8f0" }} />}

                    <div>
                      <label style={{ display: "block", fontSize: 11, color: "#4f46e5", fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>4 · Visibility</label>
                      <button onClick={() => setCarouselForm(f => ({ ...f, enabled: !f.enabled }))}
                        style={{ width: "100%", background: carouselForm.enabled ? "rgba(16,185,129,0.1)" : "rgba(107,114,128,0.08)", border: `1px solid ${carouselForm.enabled ? "rgba(16,185,129,0.35)" : "#222"}`, borderRadius: 8, padding: "11px", color: carouselForm.enabled ? "#10b981" : "#555", fontSize: 13, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{carouselForm.enabled ? "✓" : "○"}</span>
                        {carouselForm.enabled ? "Live — visible to users" : "Hidden — not shown to users"}
                      </button>

                      <label style={{ display: "block", fontSize: 11, color: "#4f46e5", fontWeight: 700, margin: "18px 0 8px", textTransform: "uppercase", letterSpacing: 0.8 }}>5 · Tier</label>
                      <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                        {[
                          { v: "production", l: "Production", d: "All real users", c: "#22c55e" },
                          { v: "test", l: "Test", d: "Test accounts only", c: "#a855f7" },
                        ].map(o => {
                          const on = (carouselForm.visibility_tier || "production") === o.v;
                          return (
                            <button key={o.v} onClick={() => setCarouselForm(f => ({ ...f, visibility_tier: o.v }))}
                              style={{ flex: 1, background: on ? `${o.c}1f` : "#f8fafc", border: `1.5px solid ${on ? o.c : "#e2e8f0"}`, borderRadius: 9, padding: "10px 8px", cursor: "pointer", textAlign: "left" }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: on ? o.c : "#374151" }}>{o.l}</div>
                              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 1 }}>{o.d}</div>
                            </button>
                          );
                        })}
                      </div>
                      <p style={{ margin: "0 0 4px", fontSize: 11, color: "#9ca3af" }}>Production = live for everyone. Test = only Test accounts see this row (preview it before going public).</p>
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

                {/* ── CHANNEL FORM ── */}
                {tab === "live" && liveSubTab === "channels" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    <p style={{ margin: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>Basics</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                      <FieldInput label="Name *" value={channelForm.name} onChange={v => setChannelForm(f => ({ ...f, name: v }))} placeholder="e.g. Peep Classics" />
                      <PremiumToggleButton on={channelForm.is_premium} onToggle={() => setChannelForm(f => ({ ...f, is_premium: !f.is_premium }))} />
                      <TierSelect value={channelForm.visibility_tier} onChange={v => setChannelForm(f => ({ ...f, visibility_tier: v }))} />
                      <FieldInput label="Slug" value={channelForm.slug} onChange={v => setChannelForm(f => ({ ...f, slug: v }))} placeholder="auto-generated from name" />
                      <FieldInput label="Description" value={channelForm.description} onChange={v => setChannelForm(f => ({ ...f, description: v }))} placeholder="What's on this channel?" />
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Category</label>
                        <select value={channelForm.category} onChange={e => setChannelForm(f => ({ ...f, category: e.target.value }))}
                          style={{ width: "100%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none" }}>
                          {["general","movies","sports","news","gaming","music","kids","education","entertainment"].map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                        </select>
                      </div>
                      <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                          <input type="checkbox" checked={channelForm.is_active} onChange={e => setChannelForm(f => ({ ...f, is_active: e.target.checked }))} />
                          <span style={{ fontSize: 13, color: "#374151" }}>Active (visible to users)</span>
                        </label>
                      </div>
                      {/* Living Mosaic presentation controls */}
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Mosaic tile size</label>
                        <div style={{ display: "flex", gap: 6 }}>
                          {[{ k: "normal", l: "Normal" }, { k: "large", l: "Large" }, { k: "spotlight", l: "Spotlight" }].map(({ k, l }) => (
                            <button key={k} onClick={() => setChannelForm(f => ({ ...f, tile_size: k }))}
                              style={{ flex: 1, background: (channelForm.tile_size || "normal") === k ? "#facc15" : "#f1f5f9", border: `1px solid ${(channelForm.tile_size || "normal") === k ? "#facc15" : "#e2e8f0"}`, borderRadius: 7, padding: "8px 4px", color: (channelForm.tile_size || "normal") === k ? "#0a0a0a" : "#374151", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                              {l}
                            </button>
                          ))}
                        </div>
                        <p style={{ margin: "6px 0 0", fontSize: 11, color: "#9ca3af" }}>How big this channel appears on the Live TV wall.</p>
                      </div>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                        <input type="checkbox" checked={!!channelForm.is_live_hero} onChange={e => setChannelForm(f => ({ ...f, is_live_hero: e.target.checked }))} />
                        <span style={{ fontSize: 13, color: "#374151" }}>Feature as Live TV hero (pins to the top of the wall)</span>
                      </label>
                    </div>

                    <p style={{ margin: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>Source</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Linked Live Feed</label>
                        <select value={channelForm.live_feed_id || ""} onChange={e => setChannelForm(f => ({ ...f, live_feed_id: e.target.value || null }))}
                          style={{ width: "100%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none", cursor: "pointer" }}>
                          <option value="">None — use the playback URL below</option>
                          {channelFeeds.map(fd => <option key={fd.id} value={fd.id}>{fd.name}{fd.playback_status === "available" ? " · live" : ""}</option>)}
                        </select>
                        <p style={{ margin: "6px 0 0", fontSize: 11, color: "#9ca3af" }}>When a feed is linked, this channel plays the feed's Cloudflare stream — the fields below are ignored.</p>
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Protocol</label>
                        <div style={{ display: "flex", gap: 6 }}>
                          {[{ k: "hls", l: "HLS (pull)" }, { k: "rtmp", l: "RTMP (push)" }, { k: "srt", l: "SRT (push)" }].map(({ k, l }) => (
                            <button key={k} onClick={() => setChannelForm(f => ({ ...f, ingest_type: k }))}
                              style={{ flex: 1, background: channelForm.ingest_type === k ? "#ef4444" : "#f1f5f9", border: `1px solid ${channelForm.ingest_type === k ? "#ef4444" : "#e2e8f0"}`, borderRadius: 7, padding: "8px 4px", color: channelForm.ingest_type === k ? "#fff" : "#374151", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                              {l}
                            </button>
                          ))}
                        </div>
                      </div>
                      <FieldInput label="Playback URL (HLS .m3u8) *" value={channelForm.hls_url} onChange={v => setChannelForm(f => ({ ...f, hls_url: v }))} placeholder="https://…/video.m3u8" />
                      {channelForm.ingest_type !== "hls" && (
                        <FieldInput label="Cloudflare Live Input UID" value={channelForm.stream_uid} onChange={v => setChannelForm(f => ({ ...f, stream_uid: v }))} placeholder="From Cloudflare Stream dashboard" />
                      )}
                      {channelForm.ingest_type === "rtmp" && (
                        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px" }}>
                          <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 600, color: "#374151" }}>RTMP push endpoint</p>
                          <p style={{ margin: 0, fontSize: 12, color: "#6b7280", fontFamily: "monospace" }}>rtmps://live.cloudflare.com/live/{"<stream_key>"}</p>
                          <p style={{ margin: "8px 0 0", fontSize: 11, color: "#9ca3af" }}>Get the stream key from Cloudflare Stream → Live Inputs. Feed it to FFmpeg or your encoder 24/7.</p>
                        </div>
                      )}
                      {channelForm.ingest_type === "srt" && (
                        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px" }}>
                          <p style={{ margin: "0 0 4px", fontSize: 12, fontWeight: 600, color: "#374151" }}>SRT push endpoint</p>
                          <p style={{ margin: 0, fontSize: 12, color: "#6b7280", fontFamily: "monospace" }}>srt://live.cloudflare.com:778</p>
                          <p style={{ margin: "8px 0 0", fontSize: 11, color: "#9ca3af" }}>Pass the stream key as the SRT stream ID. Cloudflare Stream supports SRT ingest natively.</p>
                        </div>
                      )}
                      <FieldInput label="Sort Order" value={String(channelForm.sort_order)} onChange={v => setChannelForm(f => ({ ...f, sort_order: parseInt(v) || 0 }))} placeholder="0" />
                    </div>

                    <p style={{ margin: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>Media</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 20 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Logo (square)</label>
                        <ImageUploader label="Upload Logo" folder="channels" onUploadSuccess={url => setChannelForm(f => ({ ...f, logo_url: url }))} onError={err => showToast("Upload failed: " + err, "error")} />
                        <input type="text" value={channelForm.logo_url} onChange={e => setChannelForm(f => ({ ...f, logo_url: e.target.value }))} placeholder="or paste URL..." style={{ width: "100%", marginTop: 8, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                        {channelForm.logo_url && (
                          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 64, height: 64, borderRadius: 8, background: "radial-gradient(circle at 50% 40%, #26262b, #0a0a0c)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "1px solid #e2e8f0", overflow: "hidden" }}>
                              <img src={channelForm.logo_url} alt="" style={{ maxWidth: "78%", maxHeight: "78%", objectFit: "contain" }} onError={e => { e.currentTarget.parentElement.innerHTML = '<span style=\"color:#ef4444;font-size:11px\">broken</span>'; }} />
                            </div>
                            <span style={{ fontSize: 11, color: "#9ca3af" }}>Preview on dark (how it looks on the wall)</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.7 }}>Hero Image</label>
                        <p style={{ margin: "0 0 6px", fontSize: 11, color: "#9ca3af" }}>1920×1080 recommended. Optional — the logo carries the tile if this is empty.</p>
                        <ImageUploader label="Upload Hero" folder="channels" onUploadSuccess={url => setChannelForm(f => ({ ...f, hero_url: url }))} onError={err => showToast("Upload failed: " + err, "error")} />
                        <input type="text" value={channelForm.hero_url} onChange={e => setChannelForm(f => ({ ...f, hero_url: e.target.value }))} placeholder="or paste URL..." style={{ width: "100%", marginTop: 8, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                        {channelForm.hero_url && <img src={channelForm.hero_url} alt="" style={{ marginTop: 8, width: "100%", height: 90, objectFit: "cover", borderRadius: 6, border: "1px solid #e2e8f0" }} onError={e => { e.target.style.display = "none"; }} />}
                      </div>

                      {/* Live tile preview — exactly how this channel renders on the Live TV wall */}
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Wall tile preview</label>
                        <div style={{ position: "relative", width: (channelForm.tile_size === "large" || channelForm.tile_size === "spotlight") ? 320 : 240, aspectRatio: channelForm.tile_size === "spotlight" ? "3 / 2" : channelForm.tile_size === "large" ? "1 / 1" : "16 / 9", borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0", background: "#0a0a0c" }}>
                          {channelForm.hero_url
                            ? <img src={channelForm.hero_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />
                            : <div style={{ position: "absolute", inset: 0, background: "radial-gradient(circle at 50% 38%, #26262b 0%, #141417 55%, #0a0a0c 100%)" }} />}
                          {!channelForm.hero_url && channelForm.logo_url && (
                            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", paddingBottom: 34 }}>
                              <img src={channelForm.logo_url} alt="" style={{ maxWidth: "52%", maxHeight: "52%", objectFit: "contain", filter: "drop-shadow(0 6px 18px rgba(0,0,0,0.5))" }} onError={e => { e.target.style.display = "none"; }} />
                            </div>
                          )}
                          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.1) 45%, transparent 100%)" }} />
                          <div style={{ position: "absolute", top: 8, left: 8, background: "#ef4444", borderRadius: 4, padding: "2px 7px", fontSize: 9, fontWeight: 800, color: "#fff", letterSpacing: 0.5 }}>● LIVE</div>
                          {channelForm.is_live_hero && <div style={{ position: "absolute", top: 8, right: 8, background: "#facc15", borderRadius: 4, padding: "2px 7px", fontSize: 9, fontWeight: 800, color: "#0a0a0a" }}>HERO</div>}
                          <div style={{ position: "absolute", left: 10, right: 10, bottom: 9, fontSize: 13, fontWeight: 700, color: "#fff", textShadow: "0 1px 6px rgba(0,0,0,0.6)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{channelForm.name || "Channel name"}</div>
                        </div>
                        <p style={{ margin: "6px 0 0", fontSize: 11, color: "#9ca3af" }}>Reflects your logo, hero, name & tile size. Live preview + real program art appear on the actual wall.</p>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={saveChannel} disabled={channelSaving} style={{ flex: 1, background: "#ef4444", border: "none", borderRadius: 7, padding: "12px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: channelSaving ? "not-allowed" : "pointer", opacity: channelSaving ? 0.7 : 1 }}>
                        {channelSaving ? "Saving…" : editingChannelId ? "Save Changes" : "Add Channel"}
                      </button>
                      <button onClick={() => { setEditingChannelId(null); setChannelForm(EMPTY_CHANNEL); setDrawerOpen(false); }} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 7, padding: "12px 20px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                )}

                {/* ── LIVE FORM ── */}
                {tab === "live" && liveSubTab !== "channels" && drawerFormType !== "epg" && drawerFormType !== "bulk" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

                    {/* Section: Basics */}
                    <p style={{ margin: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>Basics</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                      <FieldInput label="Title *" value={liveForm.title} onChange={v => setLiveForm(f => ({ ...f, title: v }))} placeholder="Channel name" />
                      <FieldInput label="Description" value={liveForm.description} onChange={v => setLiveForm(f => ({ ...f, description: v }))} placeholder="About this stream..." />
                    </div>

                    {/* Section: Stream */}
                    <p style={{ margin: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>Stream</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                      <FieldInput label="Stream URL" value={liveForm.stream_url} onChange={v => setLiveForm(f => ({ ...f, stream_url: v }))} placeholder="https://... (.m3u8)" />
                      <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>Live status is controlled automatically by the RTMP webhook when the streamer connects.</p>
                    </div>

                    {/* Section: Media */}
                    <p style={{ margin: "0 0 10px", fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 1 }}>Media</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 28 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Thumbnail</label>
                        <ImageUploader label="Upload Thumbnail" folder="live" onUploadSuccess={url => setLiveForm(f => ({ ...f, thumbnail: url }))} onError={err => showToast("Upload failed: " + err, "error")} />
                        <input type="text" value={liveForm.thumbnail} onChange={e => setLiveForm(f => ({ ...f, thumbnail: e.target.value }))} placeholder="or paste URL..." style={{ width: "100%", marginTop: 8, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 2, textTransform: "uppercase", letterSpacing: 0.7 }}>Hero Image</label>
                        <p style={{ margin: "0 0 6px", fontSize: 11, color: "#9ca3af" }}>1920×1080 recommended. Keep subject center-right.</p>
                        <ImageUploader label="Upload Hero Image" folder="live" onUploadSuccess={url => setLiveForm(f => ({ ...f, hero_image: url }))} onError={err => showToast("Upload failed: " + err, "error")} />
                        <input type="text" value={liveForm.hero_image} onChange={e => setLiveForm(f => ({ ...f, hero_image: e.target.value }))} placeholder="or paste URL..." style={{ width: "100%", marginTop: 8, background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none" }} onFocus={e => (e.target.style.borderColor = "#4f46e5")} onBlur={e => (e.target.style.borderColor = "#e2e8f0")} />
                        {liveForm.hero_image && <img src={liveForm.hero_image} alt="" style={{ marginTop: 8, width: "100%", height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid #e2e8f0" }} onError={e => { e.target.style.display = "none"; }} />}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={saveLiveStream} disabled={liveSaving} style={{ flex: 1, background: "#ef4444", border: "none", borderRadius: 7, padding: "12px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: liveSaving ? "not-allowed" : "pointer", opacity: liveSaving ? 0.7 : 1 }}>
                        {liveSaving ? "Saving…" : editingLiveId ? "Save Changes" : "Add Stream"}
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
                            {t === "movie" ? "Short" : "Episode"}
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
                              Shorts <span style={{ color: "#4f46e5", fontWeight: 700 }}>{bulkSelectedMovies.size > 0 ? `(${bulkSelectedMovies.size} selected)` : ""}</span>
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
                {tab === "analytics" && analyticsTab === "ads" && (
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
                        <option value="movie">Shorts</option>
                        <option value="show">TV Shows</option>
                        <option value="episode">Episodes</option>
                        <option value="podcast_episode">Podcasts</option>
                        <option value="live">Live Channels</option>
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

    {/* ── IMPORT M3U MODAL ── (top level so it opens from any sub-tab) */}
    {m3uOpen && (
      <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
        onClick={e => { if (e.target === e.currentTarget && !m3uImporting) setM3uOpen(false); }}>
        <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 860, height: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.2)", overflow: "hidden" }}>

          {/* Header */}
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 20 }}>📺</span>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>Import M3U Playlist</h2>
              <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Upload an .m3u/.m3u8 file or paste a playlist URL, then pick the channels to import.</p>
            </div>
            <button onClick={() => setM3uOpen(false)} style={{ marginLeft: "auto", background: "transparent", border: "none", fontSize: 20, color: "#9ca3af", cursor: "pointer", lineHeight: 1 }}>✕</button>
          </div>

          {/* Source: URL + file upload */}
          <div style={{ padding: "16px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={m3uUrl} onChange={e => setM3uUrl(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !m3uFetching && fetchM3UPlaylist()}
              placeholder="https://example.com/playlist.m3u"
              style={{ flex: "1 1 260px", minWidth: 0, border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#0f172a", outline: "none" }}
            />
            <button onClick={fetchM3UPlaylist} disabled={m3uFetching || !m3uUrl.trim()}
              style={{ background: "#0f172a", border: "none", borderRadius: 8, padding: "10px 20px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: m3uFetching ? "wait" : "pointer", opacity: !m3uUrl.trim() ? 0.5 : 1, whiteSpace: "nowrap" }}>
              {m3uFetching ? "Loading…" : "Fetch URL"}
            </button>
            <span style={{ fontSize: 12, color: "#cbd5e1" }}>or</span>
            <input ref={m3uFileInputRef} type="file" accept=".m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain"
              onChange={e => loadM3UFromFile(e.target.files?.[0])} style={{ display: "none" }} />
            <button onClick={() => m3uFileInputRef.current?.click()} disabled={m3uFetching}
              style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 8, padding: "10px 18px", color: "#059669", fontSize: 13, fontWeight: 600, cursor: m3uFetching ? "wait" : "pointer", whiteSpace: "nowrap" }}>
              Upload File
            </button>
          </div>

          {/* Source label */}
          {m3uSourceLabel && m3uChannels.length > 0 && (
            <div style={{ padding: "8px 24px", fontSize: 12, color: "#6b7280", borderBottom: "1px solid #f8fafc" }}>
              Source: <span style={{ color: "#0f172a", fontWeight: 600 }}>{m3uSourceLabel}</span> · parsed <strong>{m3uChannels.length}</strong> · <span style={{ color: "#f59e0b" }}>{m3uChannels.filter(c => c.duplicate).length} duplicate{m3uChannels.filter(c => c.duplicate).length !== 1 ? "s" : ""} skipped</span>
            </div>
          )}

          {/* Error */}
          {m3uError && <div style={{ padding: "12px 24px", background: "#fef2f2", borderBottom: "1px solid #fecaca", color: "#dc2626", fontSize: 13 }}>{m3uError}</div>}

          {/* Import summary (after import) */}
          {m3uImportResult && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, padding: 40 }}>
              <div style={{ fontSize: 40 }}>✅</div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" }}>Import complete</h3>
              <div style={{ display: "flex", gap: 14 }}>
                <div style={{ textAlign: "center", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "16px 26px" }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#16a34a" }}>{m3uImportResult.imported}</div>
                  <div style={{ fontSize: 12, color: "#15803d" }}>Imported</div>
                </div>
                <div style={{ textAlign: "center", background: "#fefce8", border: "1px solid #fde68a", borderRadius: 10, padding: "16px 26px" }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "#ca8a04" }}>{m3uImportResult.skipped}</div>
                  <div style={{ fontSize: 12, color: "#a16207" }}>Skipped duplicates</div>
                </div>
                <div style={{ textAlign: "center", background: m3uImportResult.failed ? "#fef2f2" : "#f8fafc", border: `1px solid ${m3uImportResult.failed ? "#fecaca" : "#e2e8f0"}`, borderRadius: 10, padding: "16px 26px" }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: m3uImportResult.failed ? "#dc2626" : "#94a3b8" }}>{m3uImportResult.failed}</div>
                  <div style={{ fontSize: 12, color: m3uImportResult.failed ? "#b91c1c" : "#94a3b8" }}>Failed</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
                <button onClick={() => { setM3uUrl(""); setM3uSourceLabel(""); resetM3UPreview(); }}
                  style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 18px", color: "#374151", fontSize: 13, cursor: "pointer" }}>Import another</button>
                <button onClick={() => setM3uOpen(false)}
                  style={{ background: "#0f172a", border: "none", borderRadius: 8, padding: "10px 22px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Done</button>
              </div>
            </div>
          )}

          {/* Channel list */}
          {!m3uImportResult && m3uChannels.length > 0 && (() => {
            const PAGE_SIZE = 100;
            const q = m3uSearch.trim().toLowerCase();
            const cats = Array.from(new Set(m3uChannels.map(ch => ch.group).filter(Boolean))).sort();
            const filtered = m3uChannels.filter(ch =>
              (m3uCategoryFilter === "All" || ch.group === m3uCategoryFilter) &&
              (!q || ch.name.toLowerCase().includes(q) || ch.group.toLowerCase().includes(q) || ch.url.toLowerCase().includes(q))
            );
            const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
            const page = Math.min(m3uPage, totalPages - 1);
            const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
            const selectableFiltered = filtered.filter(ch => !ch.duplicate);
            const selectedCount = m3uSelected.size;
            const allVisibleSelected = selectableFiltered.length > 0 && selectableFiltered.every(ch => m3uSelected.has(m3uChannels.indexOf(ch)));
            const btn = { background: "transparent", border: "1px solid #e2e8f0", borderRadius: 6, padding: "6px 12px", fontSize: 12, color: "#374151", cursor: "pointer", whiteSpace: "nowrap" };
            return (
              <>
                {/* Toolbar */}
                <div style={{ padding: "10px 24px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", flexWrap: "wrap" }}>
                  <input value={m3uSearch} onChange={e => { setM3uSearch(e.target.value); setM3uPage(0); }}
                    placeholder="Search name, category or URL…"
                    style={{ flex: "1 1 200px", minWidth: 0, border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px 12px", fontSize: 12, outline: "none" }} />
                  <select value={m3uCategoryFilter} onChange={e => { setM3uCategoryFilter(e.target.value); setM3uPage(0); }}
                    style={{ border: "1px solid #e2e8f0", borderRadius: 7, padding: "7px 10px", fontSize: 12, color: "#374151", background: "#fff", cursor: "pointer", maxWidth: 180 }}>
                    <option value="All">All categories ({cats.length})</option>
                    {cats.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button style={btn} onClick={() => {
                    const all = new Set(m3uChannels.map((ch, i) => ch.duplicate ? -1 : i).filter(i => i >= 0));
                    setM3uSelected(all);
                  }}>Select all ({m3uChannels.filter(ch => !ch.duplicate).length})</button>
                  <button style={btn} onClick={() => {
                    const s = new Set(m3uSelected);
                    if (allVisibleSelected) selectableFiltered.forEach(ch => s.delete(m3uChannels.indexOf(ch)));
                    else selectableFiltered.forEach(ch => s.add(m3uChannels.indexOf(ch)));
                    setM3uSelected(s);
                  }}>{allVisibleSelected ? "Deselect visible" : `Select visible (${selectableFiltered.length})`}</button>
                  <button style={btn} onClick={() => setM3uSelected(new Set())}>Deselect all</button>
                </div>

                {/* Column header */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 24px", borderBottom: "1px solid #e2e8f0", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  <span style={{ width: 15, flexShrink: 0 }} />
                  <span style={{ width: 36, flexShrink: 0 }}>Logo</span>
                  <span style={{ flex: 1 }}>Channel</span>
                  <span style={{ width: 140, flexShrink: 0 }}>Category</span>
                </div>

                {/* Rows */}
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {paginated.map((ch) => {
                    const idx = m3uChannels.indexOf(ch);
                    const checked = m3uSelected.has(idx);
                    return (
                      <div key={idx} onClick={() => { if (ch.duplicate) return; const s = new Set(m3uSelected); checked ? s.delete(idx) : s.add(idx); setM3uSelected(s); }}
                        style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 24px", borderBottom: "1px solid #f8fafc", background: ch.duplicate ? "#f8fafc" : checked ? "#f0fdf4" : "#fff", cursor: ch.duplicate ? "default" : "pointer", opacity: ch.duplicate ? 0.7 : 1 }}>
                        <input type="checkbox" checked={checked} readOnly disabled={ch.duplicate} style={{ width: 15, height: 15, flexShrink: 0, accentColor: "#22c55e" }} />
                        {ch.logo ? (
                          <img src={ch.logo} alt="" style={{ width: 36, height: 24, objectFit: "contain", borderRadius: 3, flexShrink: 0, background: "#f1f5f9" }} onError={e => { e.target.style.visibility = "hidden"; }} />
                        ) : (
                          <div style={{ width: 36, height: 24, background: "#e2e8f0", borderRadius: 3, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#94a3b8" }}>CH</div>
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: ch.duplicate ? "#9ca3af" : "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {ch.name}
                            {ch.duplicate && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: "#f59e0b" }}>· {ch.dupeReason}</span>}
                          </div>
                          <div style={{ fontSize: 11, color: "#9ca3af", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ch.url}</div>
                        </div>
                        <span style={{ width: 140, flexShrink: 0, fontSize: 11, color: ch.group ? "#6366f1" : "#cbd5e1", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {ch.group ? <span style={{ background: "#eef2ff", borderRadius: 4, padding: "2px 7px" }}>{ch.group}</span> : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{ padding: "10px 24px", borderTop: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 8, background: "#f8fafc" }}>
                    <button onClick={() => setM3uPage(p => Math.max(0, p - 1))} disabled={page === 0} style={{ background: "transparent", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", opacity: page === 0 ? 0.4 : 1 }}>← Prev</button>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>Page {page + 1} of {totalPages}</span>
                    <button onClick={() => setM3uPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1} style={{ background: "transparent", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", opacity: page === totalPages - 1 ? 0.4 : 1 }}>Next →</button>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>Showing {filtered.length === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
                  </div>
                )}

                {/* Footer */}
                <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", alignItems: "center", gap: 12, background: "#fff" }}>
                  <span style={{ fontSize: 13, color: "#6b7280" }}>
                    {m3uImporting
                      ? `Importing ${m3uImportProgress.done} / ${m3uImportProgress.total}…`
                      : `${selectedCount} channel${selectedCount !== 1 ? "s" : ""} selected`}
                  </span>
                  <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                    <button onClick={() => setM3uOpen(false)} disabled={m3uImporting} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 18px", color: "#374151", fontSize: 13, cursor: m3uImporting ? "not-allowed" : "pointer", opacity: m3uImporting ? 0.6 : 1 }}>Cancel</button>
                    <button onClick={importM3USelected} disabled={m3uImporting || selectedCount === 0}
                      style={{ background: "#22c55e", border: "none", borderRadius: 8, padding: "10px 22px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: (m3uImporting || selectedCount === 0) ? "not-allowed" : "pointer", opacity: (m3uImporting || selectedCount === 0) ? 0.5 : 1 }}>
                      {m3uImporting ? "Importing…" : `Import ${selectedCount > 0 ? selectedCount + " " : ""}Selected`}
                    </button>
                  </div>
                </div>
              </>
            );
          })()}

          {/* Empty / loading states */}
          {!m3uImportResult && !m3uFetching && m3uChannels.length === 0 && !m3uError && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "#9ca3af", fontSize: 13, textAlign: "center", padding: 40 }}>
              <div style={{ fontSize: 32 }}>🗂️</div>
              <div>Fetch a URL or upload an .m3u file to preview its channels.</div>
            </div>
          )}
          {m3uFetching && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280", fontSize: 13 }}>Reading playlist…</div>
          )}
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
              <p style={{ margin: "3px 0 0", fontSize: 12, color: "#6b7280" }}>Upload a .xml/.xml.gz file or load from a URL, then map each guide channel to one of your channels</p>
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

                    <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#374151" }}>2. Map XMLTV channels to your channels</p>
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
                              {channelList.map(ch => (
                                <option key={ch.id} value={ch.id}>{ch.name}</option>
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
        {/* ────── PARTNERS SUB-TAB BAR ────── */}
        {tab === "creators" && (
          <div style={{ display: "flex", gap: 6, padding: `20px ${PAD} 20px`, borderBottom: "1px solid #e2e8f0", background: "#fafafa" }}>
            {[{ key: "list", label: "Content Partners" }, { key: "review", label: `Review Queue${pendingCount > 0 ? ` (${pendingCount})` : ""}` }, { key: "payouts", label: "Payouts" }].map(({ key, label }) => (
              <button key={key} onClick={() => setCreatorsTab(key)} style={{ background: creatorsTab === key ? "rgba(249,115,22,0.08)" : "transparent", border: `1px solid ${creatorsTab === key ? "rgba(249,115,22,0.3)" : "#e2e8f0"}`, borderRadius: 8, padding: "7px 16px", color: creatorsTab === key ? "#ea580c" : "#6b7280", fontSize: 13, fontWeight: creatorsTab === key ? 600 : 400, cursor: "pointer" }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ────── CREATORS LIST ────── */}
        {tab === "creators" && creatorsTab === "list" && (
          <div style={{ maxWidth: 1600, margin: "0 auto", padding: `40px ${PAD} 80px` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: "0 0 2px", fontSize: 22, fontWeight: 700, color: "#0f172a" }}>Content Partners</h2>
                <p style={{ margin: 0, fontSize: 13, color: "#9ca3af" }}>{creatorsList.length} partner{creatorsList.length !== 1 ? "s" : ""}</p>
              </div>
              <button onClick={() => openCreatorModal()} style={{ marginLeft: "auto", background: "#fb923c", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ Add Partner</button>
            </div>

            {creatorsLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner /></div>
            ) : creatorsList.length === 0 ? (
              <div style={{ textAlign: "center", padding: 80, color: "#9ca3af" }}>No content partners yet. Add one to get started.</div>
            ) : (
              <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 14 }}>
                <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse", fontSize: 13, background: "#fff" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
                      {["Name", "Email", "Payment", "Agreement", "Status", "Actions"].map(h => (
                        <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6, whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {creatorsList.map((c, i) => (
                      <tr key={c.id} style={{ borderBottom: i < creatorsList.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                        <td style={{ padding: "12px 16px", fontWeight: 600, color: "#0f172a", whiteSpace: "nowrap" }}>{c.name}</td>
                        <td style={{ padding: "12px 16px", color: "#475569" }}>{c.email}</td>
                        <td style={{ padding: "12px 16px", color: "#475569", whiteSpace: "nowrap" }}>{c.payment_method}{c.payment_handle ? ` — ${c.payment_handle}` : ""}</td>
                        <td style={{ padding: "12px 16px" }}>
                          {parseAgreementDate(c.notes) ? (
                            <span style={{ fontSize: 11, background: "rgba(74,222,128,0.08)", color: "#16a34a", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 20, padding: "2px 10px", fontWeight: 700, whiteSpace: "nowrap" }}>
                              ✓ {parseAgreementDate(c.notes)}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 600 }}>Unsigned</span>
                          )}
                        </td>
                        <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: c.status === "active" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: c.status === "active" ? "#16a34a" : "#dc2626" }}>
                            {c.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => openCreatorModal(c)} style={{ background: "rgba(79,70,229,0.08)", border: "1px solid rgba(79,70,229,0.2)", borderRadius: 6, padding: "5px 12px", color: "#4f46e5", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Edit</button>
                            <button onClick={() => setDeleteCreatorConfirm(c)} style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 6, padding: "5px 12px", color: "#ef4444", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Add/Edit Creator Modal */}
            {creatorModal && (
              <div onClick={() => setCreatorModal(false)} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: "32px 36px", width: "min(520px,94vw)", fontFamily: "'Space Grotesk',sans-serif", maxHeight: "90vh", overflowY: "auto" }}>
                  <h3 style={{ margin: "0 0 24px", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{editingCreator ? "Edit Partner" : "Add Partner"}</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {[["Name", "name", "text", "e.g. Jarrad Wright"], ["Email", "email", "email", "creator@email.com"]].map(([label, key, type, ph]) => (
                      <div key={key}>
                        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{label}</label>
                        <input type={type} value={creatorForm[key]} onChange={e => setCreatorForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph}
                          style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#0f172a", outline: "none", boxSizing: "border-box" }} />
                      </div>
                    ))}
                    {creatorForm.payment_method !== "Bank Transfer" ? (
                      <div>
                        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Payment Handle</label>
                        <input value={creatorForm.payment_handle} onChange={e => setCreatorForm(f => ({ ...f, payment_handle: e.target.value }))} placeholder="e.g. @username or email"
                          style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#0f172a", outline: "none", boxSizing: "border-box" }} />
                      </div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        <div>
                          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Account Number</label>
                          <input value={creatorForm.payment_handle} onChange={e => setCreatorForm(f => ({ ...f, payment_handle: e.target.value }))} placeholder="e.g. 000123456789"
                            style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#0f172a", outline: "none", boxSizing: "border-box", fontFamily: "monospace" }} />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Routing Number</label>
                          <input value={creatorForm.routing_number} onChange={e => setCreatorForm(f => ({ ...f, routing_number: e.target.value }))} placeholder="e.g. 021000021"
                            style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#0f172a", outline: "none", boxSizing: "border-box", fontFamily: "monospace" }} />
                        </div>
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      <div>
                        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Payment Method</label>
                        <select value={creatorForm.payment_method} onChange={e => setCreatorForm(f => ({ ...f, payment_method: e.target.value }))}
                          style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#0f172a", outline: "none", background: "#fff" }}>
                          <option>PayPal</option><option>Venmo</option><option>Cash App</option><option>Bank Transfer</option><option>Other</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Status</label>
                        <select value={creatorForm.status} onChange={e => setCreatorForm(f => ({ ...f, status: e.target.value }))}
                          style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#0f172a", outline: "none", background: "#fff" }}>
                          <option value="active">Active</option><option value="inactive">Inactive</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Notes</label>
                      <textarea value={creatorForm.notes} onChange={e => setCreatorForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Internal notes…"
                        style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#0f172a", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
                    </div>
                    <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                        <label style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6 }}>Partner Agreement</label>
                        {creatorForm.agreement_signed_at && (
                          <span style={{ fontSize: 11, background: "rgba(74,222,128,0.1)", color: "#4ade80", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 20, padding: "2px 10px", fontWeight: 700 }}>
                            SIGNED {creatorForm.agreement_signed_at}
                          </span>
                        )}
                      </div>
                      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "14px 16px", fontSize: 12, color: "#374151", lineHeight: 1.7, marginBottom: 12, maxHeight: 160, overflowY: "auto" }}>
                        <strong>Peep Creator Revenue Share Agreement</strong><br /><br />
                        By joining Peep as a creator partner, you agree to the following terms:<br /><br />
                        <strong>1. Revenue Share.</strong> Each month, 50% of Peep's total subscription revenue is allocated to a Creator Pool. Your share of that pool is determined by your content's proportion of total platform watch time during that calendar month.<br /><br />
                        <strong>2. Watch Qualification.</strong> A viewing session counts toward your watch total only if the viewer watches at least 25% of the episode or piece of content.<br /><br />
                        <strong>3. Payment Schedule.</strong> Payments are issued on or around the 15th of each month for the prior month's watch data. Payments below the $10 minimum threshold will roll over to the following month.<br /><br />
                        <strong>4. Payment Method.</strong> You are responsible for providing accurate payment details (PayPal, Venmo, Cash App, or bank transfer). Peep is not responsible for misdirected payments due to incorrect information.<br /><br />
                        <strong>5. Content Ownership.</strong> You retain full ownership of your content. Peep is granted a non-exclusive license to distribute your content on the platform for the duration of this agreement.<br /><br />
                        <strong>6. Termination.</strong> Either party may terminate this agreement with 30 days written notice. Outstanding earned payments will still be issued upon termination.<br /><br />
                        <strong>7. Fraud.</strong> Any attempt to artificially inflate watch time (bots, repeat loops, etc.) will result in immediate removal and forfeiture of pending payouts.
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <input type="date" value={creatorForm.agreement_signed_at} onChange={e => setCreatorForm(f => ({ ...f, agreement_signed_at: e.target.value }))}
                          style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#0f172a", outline: "none" }} />
                        {!creatorForm.agreement_signed_at && (
                          <button type="button" onClick={() => setCreatorForm(f => ({ ...f, agreement_signed_at: new Date().toISOString().slice(0, 10) }))}
                            style={{ background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 700, color: "#16a34a", cursor: "pointer", whiteSpace: "nowrap" }}>
                            Mark Signed Today
                          </button>
                        )}
                        {creatorForm.agreement_signed_at && (
                          <button type="button" onClick={() => setCreatorForm(f => ({ ...f, agreement_signed_at: "" }))}
                            style={{ background: "transparent", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#9ca3af", cursor: "pointer" }}>
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  {editingCreator && (
                    <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 20, marginTop: 4 }}>
                      <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "#0f172a" }}>Linked Content</p>
                      <p style={{ margin: "0 0 12px", fontSize: 11, color: "#9ca3af" }}>Watch time from these shows/movies counts toward this creator's payout share.</p>

                      {/* Currently linked */}
                      {contentCreators.filter(l => l.creator_id === editingCreator.id).length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                          {contentCreators.filter(l => l.creator_id === editingCreator.id).map(link => {
                            const label = (() => {
                              if (link.content_type === "show") return showsList.find(s => String(s.id) === link.content_id)?.title || link.content_id;
                              if (link.content_type === "movie") return rows.find(r => String(r.id) === link.content_id)?.title || link.content_id;
                              if (link.content_type === "podcast") return podcastsList.find(p => String(p.id) === link.content_id)?.title || link.content_id;
                              return link.content_id;
                            })();
                            return (
                              <div key={link.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px" }}>
                                <div>
                                  <span style={{ fontSize: 13, fontWeight: 500, color: "#0f172a" }}>{label}</span>
                                  <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 8, textTransform: "capitalize" }}>{link.content_type.replace("_", " ")}</span>
                                </div>
                                <button onClick={() => unlinkCreatorContent(link.id)} style={{ background: "none", border: "none", color: "#f87171", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>×</button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Add content dropdown */}
                      {(() => {
                        const linked = contentCreators.filter(l => l.creator_id === editingCreator.id).map(l => `${l.content_type}:${l.content_id}`);
                        const options = [
                          ...showsList.map(s => ({ label: `${s.title} (Show)`, value: `show:${s.id}` })),
                          ...rows.map(r => ({ label: `${r.title} (Movie)`, value: `movie:${r.id}` })),
                          ...podcastsList.map(p => ({ label: `${p.title} (Podcast)`, value: `podcast:${p.id}` })),
                        ].filter(o => !linked.includes(o.value));
                        if (!options.length) return <p style={{ fontSize: 12, color: "#9ca3af" }}>All content linked.</p>;
                        return (
                          <select defaultValue="" onChange={e => { if (!e.target.value) return; const [type, id] = e.target.value.split(":"); linkCreatorContent(editingCreator.id, id, type); e.target.value = ""; }}
                            style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#6b7280", outline: "none", background: "#fff" }}>
                            <option value="">+ Link content…</option>
                            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        );
                      })()}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 24, flexWrap: "wrap" }}>
                    {editingCreator && (
                      <button onClick={() => resendInvite(editingCreator)} disabled={resendingInvite} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, color: "#475569", cursor: resendingInvite ? "not-allowed" : "pointer", opacity: resendingInvite ? 0.7 : 1, marginRight: "auto" }}>
                        {resendingInvite ? "Sending…" : "↺ Resend Invite"}
                      </button>
                    )}
                    <button onClick={() => setCreatorModal(false)} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, color: "#475569", cursor: "pointer" }}>Cancel</button>
                    <button onClick={saveCreator} disabled={creatorSaving} style={{ background: "#fb923c", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer", opacity: creatorSaving ? 0.7 : 1 }}>
                      {creatorSaving ? "Saving…" : editingCreator ? "Save Changes" : "Add Partner"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Delete confirm */}
            {deleteCreatorConfirm && (
              <div onClick={() => setDeleteCreatorConfirm(null)} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, padding: "32px 36px", width: "min(400px,92vw)", textAlign: "center" }}>
                  <p style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>Delete "{deleteCreatorConfirm.name}"?</p>
                  <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>Their referral code will stop working. Past payout records are preserved.</p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setDeleteCreatorConfirm(null)} style={{ flex: 1, background: "#f1f5f9", border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 600, color: "#475569", cursor: "pointer" }}>Cancel</button>
                    <button onClick={() => deleteCreator(deleteCreatorConfirm.id)} style={{ flex: 1, background: "#ef4444", border: "none", borderRadius: 8, padding: "10px", fontSize: 13, fontWeight: 600, color: "#fff", cursor: "pointer" }}>Delete</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ────── REVIEW QUEUE VIEW (inside Boss) ────── */}
        {tab === "creators" && creatorsTab === "review" && (
          <div style={{ maxWidth: 1000, margin: "0 auto", padding: `40px ${PAD} 80px` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
              <button onClick={() => setCreatorsTab("list")} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#374151", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>← Back</button>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Review Queue</h2>
              {reviewEpisodes.length > 0 && <span style={{ fontSize: 13, color: "#9ca3af" }}>{reviewEpisodes.length} pending</span>}
            </div>

            {reviewLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner /></div>
            ) : reviewEpisodes.length === 0 ? (
              <div style={{ textAlign: "center", padding: 80, color: "#9ca3af" }}>
                <p style={{ fontSize: 32, marginBottom: 12 }}>✓</p>
                <p style={{ fontSize: 16, fontWeight: 600, color: "#374151", marginBottom: 8 }}>All clear</p>
                <p style={{ fontSize: 13 }}>No episodes waiting for review.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {reviewEpisodes.map(ep => (
                  <div key={ep.id} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, overflow: "hidden" }}>
                    {/* Episode header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 22px", borderBottom: "1px solid #f1f5f9", flexWrap: "wrap" }}>
                      {ep.showThumb && <img src={ep.showThumb} alt="" style={{ width: 64, height: 42, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: "0 0 2px", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>{ep.showTitle}</p>
                        <p style={{ margin: "0 0 2px", fontSize: 13, color: "#475569" }}>S{ep.season}E{ep.episode_number} — {ep.title}</p>
                        <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>
                          {ep.creator ? `${ep.creator.name} · ${ep.creator.email}` : "Unknown creator"} · {new Date(ep.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </p>
                      </div>
                    </div>

                    {/* Video preview */}
                    {ep.url && (
                      <div style={{ padding: "16px 22px", borderBottom: "1px solid #f1f5f9", background: "#fafafa" }}>
                        <video controls src={ep.url} style={{ width: "100%", maxHeight: 280, borderRadius: 8, background: "#000" }} />
                      </div>
                    )}

                    {/* Description */}
                    {ep.description && (
                      <div style={{ padding: "14px 22px", borderBottom: "1px solid #f1f5f9" }}>
                        <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.6 }}>{ep.description}</p>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 10, padding: "14px 22px" }}>
                      <button onClick={() => approveEpisode(ep)}
                        style={{ flex: 1, background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 10, padding: "11px", color: "#16a34a", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                        ✓ Approve — Go Live
                      </button>
                      <button onClick={() => { setRejectModal(ep); setRejectNote(""); }}
                        style={{ flex: 1, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "11px", color: "#ef4444", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                        ✕ Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Reject modal */}
        {rejectModal && (
          <div onClick={e => { if (e.target === e.currentTarget) { setRejectModal(null); setRejectNote(""); } }} style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: "32px 36px", width: "min(480px,94vw)" }}>
              <h3 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 700, color: "#0f172a" }}>Reject Episode</h3>
              <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6b7280" }}>
                S{rejectModal.season}E{rejectModal.episode_number} — {rejectModal.title}
              </p>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 }}>Rejection Note (sent to creator)</label>
              <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={4} placeholder="Tell the creator why this was rejected and what they can fix…"
                style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#0f172a", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                <button onClick={() => { setRejectModal(null); setRejectNote(""); }} style={{ flex: 1, background: "#f1f5f9", border: "none", borderRadius: 8, padding: "11px", fontSize: 13, fontWeight: 600, color: "#475569", cursor: "pointer" }}>Cancel</button>
                <button onClick={() => rejectEpisode(rejectModal, rejectNote)} style={{ flex: 1, background: "#ef4444", border: "none", borderRadius: 8, padding: "11px", fontSize: 13, fontWeight: 700, color: "#fff", cursor: "pointer" }}>Reject & Notify Partner</button>
              </div>
            </div>
          </div>
        )}

        {/* ────── PAYOUTS VIEW (inside Boss) ────── */}
        {tab === "creators" && creatorsTab === "payouts" && (
          <div style={{ maxWidth: 1600, margin: "0 auto", padding: `40px ${PAD} 80px` }}>
            <div style={{ marginBottom: 24 }}>
              <button onClick={() => setCreatorsTab("list")} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 14px", fontSize: 13, color: "#374151", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>← Back</button>
            </div>
            {/* Sub-tab toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
              {[["current", "Monthly Payouts"], ["history", "Payout History"]].map(([v, label]) => (
                <button key={v} onClick={() => setPayoutView(v)} style={{ background: payoutView === v ? "rgba(167,139,250,0.12)" : "transparent", border: `1px solid ${payoutView === v ? "rgba(167,139,250,0.4)" : "#e2e8f0"}`, borderRadius: 8, padding: "8px 18px", color: payoutView === v ? "#7c3aed" : "#6b7280", fontSize: 13, fontWeight: payoutView === v ? 700 : 400, cursor: "pointer" }}>
                  {label}
                </button>
              ))}
            </div>

            {/* How payouts work info box */}
            <div style={{ marginBottom: 20 }}>
              <button onClick={() => setShowPayoutInfo(v => !v)} style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: "#6b7280", fontSize: 12, fontWeight: 600 }}>
                <span style={{ fontSize: 14 }}>{showPayoutInfo ? "▾" : "▸"}</span> How payouts work
              </button>
              {showPayoutInfo && (
                <div style={{ marginTop: 12, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px" }}>
                  <p style={{ margin: "0 0 12px", fontWeight: 700, fontSize: 14, color: "#0f172a" }}>Content Partner Revenue Share — How It Works</p>
                  <p style={{ margin: "0 0 10px", fontSize: 13, color: "#374151", lineHeight: 1.6 }}>Every month, <strong>50% of Peep's total revenue</strong> goes into a creator pool. Each creator's cut of that pool is based on how much of the platform's total watch time their content drove that month.</p>
                  <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Formula</p>
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontFamily: "monospace", fontSize: 12, color: "#374151" }}>
                    Creator Pool = Total Revenue × 50%<br />
                    Your Payout = Creator Pool × (Your Watch Mins ÷ All Watch Mins)
                  </div>
                  <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5 }}>Example</p>
                  <p style={{ margin: "0 0 10px", fontSize: 13, color: "#374151", lineHeight: 1.6 }}>Peep makes <strong>$2,000</strong> → pool is <strong>$1,000</strong>. Your content = <strong>30% of all watch time</strong> → you earn <strong>$300</strong>.</p>
                  <p style={{ margin: "0 0 10px", fontSize: 13, color: "#374151", lineHeight: 1.6 }}>The per-minute rate is never fixed — it grows as Peep grows. More subscribers = more revenue = bigger pool = more money per watch minute.</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>Payments go out on the 15th of each month for the previous month's watch data. Only watch sessions where the viewer watched at least 25% of an episode count toward your total.</p>
                </div>
              )}
            </div>

            {payoutView === "current" && (
              <div>
                {(() => {
                  const today = new Date();
                  const day = today.getDate();
                  const yr = today.getFullYear();
                  const mo = today.getMonth();
                  const nextDue = day < 15 ? new Date(yr, mo, 15) : new Date(yr, mo + 1, 15);
                  const daysUntil = Math.ceil((nextDue - today) / 86400000);
                  const nextDueStr = nextDue.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
                  const lastMonthStr = new Date(yr, mo - 1).toISOString().slice(0, 7);
                  const unpaidCount = payoutData.filter(r => r.status !== "paid").length;
                  const isOverdue = day >= 15 && payoutMonth === lastMonthStr && unpaidCount > 0;
                  const overdueMonthLabel = new Date(payoutMonth + "-02").toLocaleDateString("en-US", { month: "long", year: "numeric" });
                  return (
                    <div style={{ marginBottom: 20 }}>
                      {isOverdue && (
                        <div style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 12, padding: "14px 20px", marginBottom: 12, display: "flex", alignItems: "center", gap: 16 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", flexShrink: 0 }} />
                          <div>
                            <p style={{ margin: 0, fontWeight: 700, color: "#ef4444", fontSize: 14 }}>Overdue — {overdueMonthLabel} payouts not complete</p>
                            <p style={{ margin: "3px 0 0", fontSize: 12, color: "#6b7280" }}>Payments were due by the 15th. {unpaidCount} creator{unpaidCount !== 1 ? "s" : ""} still unpaid.</p>
                          </div>
                        </div>
                      )}
                      <div style={{ background: isOverdue ? "rgba(239,68,68,0.04)" : "rgba(167,139,250,0.06)", border: `1px solid ${isOverdue ? "rgba(239,68,68,0.15)" : "rgba(167,139,250,0.2)"}`, borderRadius: 12, padding: "14px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontSize: 11, color: "#6b7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Next Payout Due</p>
                          <p style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{nextDueStr}</p>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: isOverdue ? "#ef4444" : "#7c3aed" }}>{daysUntil === 0 ? "Due today" : daysUntil === 1 ? "1 day away" : `${daysUntil} days away`}</p>
                          <p style={{ margin: "3px 0 0", fontSize: 11, color: "#9ca3af" }}>Payments go out on the 15th of each month</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Monthly Payouts</h2>
                  <input type="month" value={payoutMonth} onChange={e => setPayoutMonth(e.target.value)}
                    style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 12px", fontSize: 13, color: "#0f172a", outline: "none" }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span style={{ fontSize: 12, color: "#6b7280" }}>Total Revenue: $</span>
                    <input type="number" value={totalRevenue}
                      onChange={e => { const v = parseFloat(e.target.value) || 0; if (v > 100000) { alert("Revenue over $100,000 — double-check this number before calculating."); return; } setTotalRevenue(v); }}
                      step="0.01" min="0" max="100000" placeholder="0.00"
                      style={{ width: 90, border: `1px solid ${totalRevenue > 50000 ? "#ef4444" : "#e2e8f0"}`, borderRadius: 8, padding: "7px 10px", fontSize: 13, color: "#0f172a", outline: "none" }} />
                    <button onClick={fetchStripeRevenue} disabled={fetchingRevenue} style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 8, padding: "7px 14px", color: "#16a34a", fontSize: 12, fontWeight: 600, cursor: fetchingRevenue ? "not-allowed" : "pointer", opacity: fetchingRevenue ? 0.7 : 1, whiteSpace: "nowrap" }}>
                      {fetchingRevenue ? "Fetching…" : "↓ From Stripe"}
                    </button>
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>50% pool = ${(totalRevenue * 0.5).toFixed(2)}</span>
                    <button onClick={() => { if (totalRevenue <= 0) { alert("Enter a total revenue amount before calculating."); return; } if (!window.confirm(`Calculate payouts for ${payoutMonth} with $${totalRevenue.toFixed(2)} total revenue?\n\nCreator pool: $${(totalRevenue * 0.5).toFixed(2)}`)) return; loadPayouts(); }} style={{ background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 8, padding: "7px 14px", color: "#7c3aed", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Calculate</button>
                    <button onClick={exportPayoutsCSV} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 14px", color: "#475569", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Export CSV</button>
                  </div>
                </div>

                {payoutLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner /></div>
                ) : payoutData.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 80, color: "#9ca3af" }}>No content partners yet. Add partners first.</div>
                ) : (
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
                          {["Partner", "Watch Time", "Share", "Payout (50%)", "Status", ""].map(h => (
                            <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {payoutData.map((row, i) => (
                          <tr key={row.creator.id} style={{ borderBottom: i < payoutData.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                            <td style={{ padding: "14px 16px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <p style={{ margin: "0 0 2px", fontWeight: 600, color: "#0f172a" }}>{row.creator.name}</p>
                                {row.fraudFlag && bossSettings.fraud_detection_enabled === "true" && (
                                  <span title={`One account = ${row.fraudFlag}% of this creator's watch time`} style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)", whiteSpace: "nowrap", cursor: "default" }}>Suspicious</span>
                                )}
                              </div>
                              <p style={{ margin: 0, fontSize: 11, color: "#9ca3af" }}>{row.creator.email}</p>
                            </td>
                            <td style={{ padding: "14px 16px", color: "#0f172a", fontWeight: 600 }}>
                              {row.watchMins >= 60 ? `${(row.watchMins / 60).toFixed(1)} hrs` : `${row.watchMins} mins`}
                            </td>
                            <td style={{ padding: "14px 16px", color: "#475569", fontWeight: 600 }}>{row.share}%</td>
                            <td style={{ padding: "14px 16px" }}>
                              <span style={{ fontWeight: 700, color: row.payout < 10 ? "#9ca3af" : "#7c3aed" }}>${row.payout.toFixed(2)}</span>
                              {row.rolloverAmount > 0 && (
                                <span title={`Includes $${row.rolloverAmount.toFixed(2)} rolled over from previous months`} style={{ display: "block", fontSize: 10, color: "#7c3aed", marginTop: 2 }}>+${row.rolloverAmount.toFixed(2)} rollover</span>
                              )}
                              {row.payout < 10 && row.status !== "paid" && (
                                <span title="Below $10 minimum — rolls over to next month" style={{ display: "block", fontSize: 10, color: "#9ca3af", marginTop: 2 }}>Below min — carries forward</span>
                              )}
                            </td>
                            <td style={{ padding: "14px 16px" }}>
                              {row.status === "paid"
                                ? <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "rgba(34,197,94,0.1)", color: "#16a34a" }}>Paid{row.paid_at ? ` ${new Date(row.paid_at).toLocaleDateString()}` : ""}</span>
                                : row.payout < 10
                                  ? <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "rgba(156,163,175,0.1)", color: "#9ca3af" }}>Below Min</span>
                                  : <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "rgba(251,146,60,0.1)", color: "#ea580c" }}>Unpaid</span>
                              }
                            </td>
                            <td style={{ padding: "14px 16px" }}>
                              <button onClick={() => togglePayoutStatus(row)} disabled={row.payout < 10 && row.status !== "paid"}
                                style={{ background: row.status === "paid" ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.1)", border: `1px solid ${row.status === "paid" ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.3)"}`, borderRadius: 6, padding: "5px 12px", color: row.status === "paid" ? "#ef4444" : "#16a34a", fontSize: 11, fontWeight: 600, cursor: (row.payout < 10 && row.status !== "paid") ? "default" : "pointer", opacity: (row.payout < 10 && row.status !== "paid") ? 0.4 : 1, whiteSpace: "nowrap" }}>
                                {row.status === "paid" ? "Mark Unpaid" : "Mark Paid"}
                              </button>
                            </td>
                          </tr>
                        ))}
                        {/* Totals row */}
                        {(() => {
                          const totalPayout = payoutData.reduce((s, r) => s + r.payout, 0);
                          const unpaidPayout = payoutData.filter(r => r.status !== "paid").reduce((s, r) => s + r.payout, 0);
                          const totalMins = payoutData.reduce((s, r) => s + r.watchMins, 0);
                          return (
                            <tr style={{ background: "#f8fafc", borderTop: "2px solid #e2e8f0" }}>
                              <td style={{ padding: "14px 16px", fontWeight: 700, color: "#0f172a" }}>Total</td>
                              <td style={{ padding: "14px 16px", fontWeight: 700, color: "#0f172a" }}>{totalMins >= 60 ? `${(totalMins / 60).toFixed(1)} hrs` : `${totalMins} mins`}</td>
                              <td style={{ padding: "14px 16px", fontWeight: 700, color: "#475569" }}>100%</td>
                              <td style={{ padding: "14px 16px", fontWeight: 700, color: "#7c3aed" }}>${totalPayout.toFixed(2)}</td>
                              <td colSpan={2} style={{ padding: "14px 16px" }}>
                                <span style={{ fontSize: 12, color: "#ea580c", fontWeight: 700 }}>${unpaidPayout.toFixed(2)} still owed</span>
                              </td>
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {payoutView === "history" && (
              <div>
                <h2 style={{ margin: "0 0 24px", fontSize: 20, fontWeight: 700, color: "#0f172a" }}>Payout History</h2>
                {payoutHistoryLoading ? (
                  <div style={{ display: "flex", justifyContent: "center", padding: 60 }}><Spinner /></div>
                ) : payoutHistory.length === 0 ? (
                  <div style={{ textAlign: "center", padding: 80, color: "#9ca3af" }}>No paid payouts yet.</div>
                ) : (
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
                          {["Month", "Partner", "Watch Time", "Revenue", "Paid Out", "Date Paid"].map(h => (
                            <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {payoutHistory.map((p, i) => (
                          <tr key={p.id} style={{ borderBottom: i < payoutHistory.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                            <td style={{ padding: "14px 16px", fontWeight: 600, color: "#0f172a" }}>{p.month}</td>
                            <td style={{ padding: "14px 16px", color: "#0f172a" }}>{p.creator_name}</td>
                            <td style={{ padding: "14px 16px", color: "#475569" }}>{p.watch_minutes} mins</td>
                            <td style={{ padding: "14px 16px", color: "#475569" }}>${(+p.revenue).toFixed(2)}</td>
                            <td style={{ padding: "14px 16px", fontWeight: 700, color: "#7c3aed" }}>${(+p.payout_amount).toFixed(2)}</td>
                            <td style={{ padding: "14px 16px", color: "#475569" }}>{p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ────── STORAGE TAB ────── */}
        {tab === "storage" && (
          <StoragePanel showToast={showToast} logAudit={logAudit}
            videosList={videosList} showsList={showsList} podcastsList={podcastsList} />
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

function FieldCombo({ label, value, onChange, options, placeholder }) {
  const id = `combo-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "#6b7280", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>
        {label}
      </label>
      <input
        list={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || "Type or pick..."}
        style={{ width: "100%", background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 7, padding: "10px 12px", color: "#0f172a", fontSize: 13, outline: "none", boxSizing: "border-box" }}
        onFocus={e => e.target.style.borderColor = "#4f46e5"}
        onBlur={e => e.target.style.borderColor = "#e2e8f0"}
      />
      <datalist id={id}>
        {options.map(o => <option key={o} value={o} />)}
      </datalist>
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

function AdminAccessCard({ supabaseUrl, currentUser }) {
  const [searchEmail, setSearchEmail] = useState("");
  const [result, setResult] = useState(null); // { email, role }
  const [searching, setSearching] = useState(false);
  const [acting, setActing] = useState(false);
  const [msg, setMsg] = useState(null);

  async function lookupUser() {
    if (!searchEmail.trim()) return;
    setSearching(true);
    setResult(null);
    setMsg(null);
    const { data } = await supabase.from("profiles").select("email, role").eq("email", searchEmail.trim().toLowerCase()).maybeSingle();
    if (!data) setMsg({ type: "error", text: "No account found with that email." });
    else setResult(data);
    setSearching(false);
  }

  async function changeRole(action) {
    setActing(true);
    setMsg(null);
    try {
      const token = await getAdminToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/manage-admin-role`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ targetEmail: result.email, action }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(prev => ({ ...prev, role: data.role }));
      setMsg({ type: "success", text: action === "promote" ? `${result.email} is now an admin.` : `${result.email} has been demoted to viewer.` });
    } catch (err) {
      setMsg({ type: "error", text: err.message });
    }
    setActing(false);
  }

  const inp = { width: "100%", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "10px 14px", color: "#0f172a", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "24px 28px", marginBottom: 28 }}>
      <p style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>Admin Access</p>
      <p style={{ margin: "0 0 18px", fontSize: 13, color: "#9ca3af" }}>Promote or demote accounts. Only visible to you.</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <input style={{ ...inp, flex: 1 }} placeholder="Enter their email address" value={searchEmail}
          onChange={e => { setSearchEmail(e.target.value); setResult(null); setMsg(null); }}
          onKeyDown={e => e.key === "Enter" && lookupUser()} />
        <button onClick={lookupUser} disabled={searching}
          style={{ background: "#0f172a", border: "none", borderRadius: 8, padding: "10px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: searching ? "not-allowed" : "pointer", opacity: searching ? 0.7 : 1, whiteSpace: "nowrap" }}>
          {searching ? "Looking up…" : "Look Up"}
        </button>
      </div>
      {result && (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 600, color: "#0f172a" }}>{result.email}</p>
            <p style={{ margin: 0, fontSize: 12, color: result.role === "admin" ? "#7c3aed" : "#6b7280", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{result.role}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {result.role !== "admin" ? (
              <button onClick={() => changeRole("promote")} disabled={acting}
                style={{ background: "#7c3aed", border: "none", borderRadius: 8, padding: "8px 16px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: acting ? "not-allowed" : "pointer", opacity: acting ? 0.7 : 1 }}>
                {acting ? "…" : "Make Admin"}
              </button>
            ) : (
              <button onClick={() => changeRole("demote")} disabled={acting}
                style={{ background: "#ef4444", border: "none", borderRadius: 8, padding: "8px 16px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: acting ? "not-allowed" : "pointer", opacity: acting ? 0.7 : 1 }}>
                {acting ? "…" : "Remove Admin"}
              </button>
            )}
          </div>
        </div>
      )}
      {msg && (
        <p style={{ margin: "10px 0 0", fontSize: 13, color: msg.type === "error" ? "#ef4444" : "#16a34a", fontWeight: 500 }}>{msg.text}</p>
      )}
    </div>
  );
}
