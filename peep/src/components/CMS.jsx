import { useState, useEffect, useRef } from "react";
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
};

export function CMS({ onExit }) {
  const [tab, setTab] = useState("videos"); // "videos" | "shows" | "episodes" | "carousels"
  
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

  const [heroConfirm, setHeroConfirm] = useState(null); // { current, next, type: "video"|"show" }

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
      description: row.description ?? "",
      tags: Array.isArray(row.tags) ? row.tags.join(", ") : (row.tags ?? ""),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_ROW);
  }

  function parseForm() {
    return {
      ...form,
      score: form.score !== "" ? Number(form.score) : null,
      year: form.year !== "" ? Number(form.year) : null,
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
    setCarouselForm({
      title: carousel.title ?? "",
      type: carousel.type ?? "category",
      filter_value: carousel.filter_value ?? "",
      content_type: carousel.content_type ?? "all",
      enabled: carousel.enabled ?? true,
      position: carousel.position ?? 0,
    });
  }

  function cancelCarouselEdit() {
    setEditingCarouselId(null);
    setCarouselForm(EMPTY_CAROUSEL);
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
    setShowForm({ title: show.title ?? "", category: show.category ?? "Horror", rating: show.rating ?? "NR", year: show.year ?? "", score: show.score ?? "", thumbnail: show.thumbnail ?? "", poster: show.poster ?? "", description: show.description ?? "", tags: Array.isArray(show.tags) ? show.tags.join(", ") : (show.tags ?? "") });
  }

  function cancelShowEdit() { setEditingShowId(null); setShowForm(EMPTY_SHOW); }

  async function saveShow() {
    if (!showForm.title.trim()) { showToast("Title is required.", "error"); return; }
    setShowSaving(true);
    const payload = { ...showForm, year: showForm.year !== "" ? Number(showForm.year) : null, score: showForm.score !== "" ? Number(showForm.score) : null, tags: showForm.tags ? showForm.tags.split(",").map(t => t.trim()).filter(Boolean) : [] };
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
    setEpisodeForm({ show_id: ep.show_id, season: ep.season, episode_number: ep.episode_number, title: ep.title ?? "", description: ep.description ?? "", url: ep.url ?? "", thumbnail: ep.thumbnail ?? "", duration: ep.duration ?? "" });
  }

  function cancelEpisodeEdit() { setEditingEpisodeId(null); setEpisodeForm({ ...EMPTY_EPISODE, show_id: selectedShowForEpisodes }); }

  async function saveEpisode() {
    if (!episodeForm.title.trim() || !episodeForm.show_id) { showToast("Show and title are required.", "error"); return; }
    setEpisodeSaving(true);
    const payload = { ...episodeForm, season: Number(episodeForm.season), episode_number: Number(episodeForm.episode_number) };
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
    <div style={{ background: "#0a0a0a", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#fff" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display&display=swap" rel="stylesheet" />

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 32,
            right: 32,
            zIndex: 999,
            background: toast.type === "error" ? "#7f1d1d" : "#14532d",
            border: `1px solid ${toast.type === "error" ? "#991b1b" : "#166534"}`,
            color: "#fff",
            padding: "12px 20px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Hero Confirm Modal */}
      {heroConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: 14, padding: "36px 40px", width: 440, textAlign: "center" }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>★</div>
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "#fff" }}>Change Hero Banner?</p>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 6 }}>
              Currently showing: <span style={{ color: "#fcd34d", fontWeight: 600 }}>"{heroConfirm.current.title}"</span>
            </p>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 28 }}>
              Replace with: <span style={{ color: "#fff", fontWeight: 600 }}>"{heroConfirm.next.title}"</span>
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setHeroConfirm(null)} style={{ flex: 1, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 7, padding: "11px", color: "#888", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => applyHero(heroConfirm.next, heroConfirm.type)} style={{ flex: 1, background: "#fcd34d", border: "none", borderRadius: 7, padding: "11px", color: "#0a0a0a", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Yes, Switch</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal - Carousel */}
      {deleteCarouselConfirm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: 14, padding: "36px 40px", width: 400, textAlign: "center" }}>
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Delete this carousel?</p>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 28 }}>"{deleteCarouselConfirm.title}" will be permanently removed.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setDeleteCarouselConfirm(null)}
                style={{ flex: 1, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 7, padding: "11px", color: "#888", fontSize: 13, cursor: "pointer" }}
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
      <div style={{ borderBottom: "1px solid #1a1a1a", padding: `0 ${PAD}`, display: "flex", alignItems: "center", justifyContent: "space-between", height: "auto", minHeight: 68, flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <span style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22 }}>
            peep<span style={{ color: "#ff4d4d" }}>.</span>
          </span>
          <span style={{ fontSize: 13, color: "#555", borderLeft: "1px solid #2a2a2a", paddingLeft: 24 }}>
            Content Management System
          </span>
        </div>
        <button
          onClick={onExit}
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "none",
            borderRadius: 6,
            padding: "7px 16px",
            color: "#888",
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
      <div style={{ borderBottom: "1px solid #1a1a1a", padding: `0 ${PAD}`, display: "flex", gap: 24, background: "rgba(0,0,0,0.5)" }}>
        <button
          onClick={() => setTab("videos")}
          style={{
            background: "transparent",
            border: "none",
            borderBottom: tab === "videos" ? "2px solid #ff4d4d" : "none",
            color: tab === "videos" ? "#fff" : "#666",
            padding: "16px 0",
            fontSize: 14,
            fontWeight: tab === "videos" ? 600 : 400,
            cursor: "pointer",
            transition: "color 0.2s",
          }}
        >
          Videos ({rows.length})
        </button>
        <button onClick={() => setTab("shows")} style={{ background: "transparent", border: "none", borderBottom: tab === "shows" ? "2px solid #ff4d4d" : "none", color: tab === "shows" ? "#fff" : "#666", padding: "16px 0", fontSize: 14, fontWeight: tab === "shows" ? 600 : 400, cursor: "pointer", transition: "color 0.2s" }}>
          Shows ({showsList.length})
        </button>
        <button onClick={() => setTab("episodes")} style={{ background: "transparent", border: "none", borderBottom: tab === "episodes" ? "2px solid #ff4d4d" : "none", color: tab === "episodes" ? "#fff" : "#666", padding: "16px 0", fontSize: 14, fontWeight: tab === "episodes" ? 600 : 400, cursor: "pointer", transition: "color 0.2s" }}>
          Episodes
        </button>
        <button onClick={() => setTab("carousels")} style={{ background: "transparent", border: "none", borderBottom: tab === "carousels" ? "2px solid #ff4d4d" : "none", color: tab === "carousels" ? "#fff" : "#666", padding: "16px 0", fontSize: 14, fontWeight: tab === "carousels" ? 600 : 400, cursor: "pointer", transition: "color 0.2s" }}>
          Carousels ({carousels.length})
        </button>
      </div>

      <div style={{ maxWidth: 1600, margin: "0 auto", padding: `40px ${PAD} 80px`, display: "grid", gridTemplateColumns: "400px 1fr", gap: 40, alignItems: "start" }}>

        {/* ────── VIDEOS TAB ────── */}
        {tab === "videos" && (
          <>
            {/* ── Edit Panel ── */}
            <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: 32, position: "sticky", top: 24, maxHeight: "90vh", overflowY: "auto" }}>
              <h2 style={{ margin: "0 0 28px", fontSize: 17, fontWeight: 600, color: "#e5e5e5" }}>
                {editingId ? "Edit Row" : "Add New Row"}
              </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Title */}
            <FieldInput
              label="Title *"
              value={form.title}
              onChange={v => setForm(f => ({ ...f, title: v }))}
              placeholder="e.g. Metropolis"
            />

            {/* Category & Rating */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FieldSelect
                label="Category"
                value={form.category}
                onChange={v => setForm(f => ({ ...f, category: v }))}
                options={categories}
              />
              <FieldSelect
                label="Rating"
                value={form.rating}
                onChange={v => setForm(f => ({ ...f, rating: v }))}
                options={["NR", "G", "PG", "PG-13", "R"]}
              />
            </div>

            {/* Year, Duration, Score */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <FieldInput
                label="Year"
                value={form.year}
                onChange={v => setForm(f => ({ ...f, year: v }))}
                placeholder="1927"
                type="number"
              />
              <FieldInput
                label="Duration"
                value={form.duration}
                onChange={v => setForm(f => ({ ...f, duration: v }))}
                placeholder="2h 33m"
              />
              <FieldInput
                label="Score %"
                value={form.score}
                onChange={v => setForm(f => ({ ...f, score: v }))}
                placeholder="99"
                type="number"
              />
            </div>

            {/* Hero Image */}
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>
                Hero Image
              </label>
              <p style={{ fontSize: 11, color: "#3a3a3a", margin: "0 0 8px" }}>Landscape · 1920×1080px · full-screen banner</p>
              <ImageUploader
                label="Upload Hero Image (JPG/PNG)"
                folder="hero"
                onUploadSuccess={url => setForm(f => ({ ...f, thumbnail: url }))}
                onError={err => showToast("Upload failed: " + err, "error")}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
                <div style={{ flex: 1, height: 1, background: "#1e1e1e" }} />
                <span style={{ fontSize: 11, color: "#333" }}>or paste URL</span>
                <div style={{ flex: 1, height: 1, background: "#1e1e1e" }} />
              </div>
              <input
                type="text"
                value={form.thumbnail}
                onChange={e => setForm(f => ({ ...f, thumbnail: e.target.value }))}
                placeholder="https://..."
                style={{ width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 7, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none" }}
              />
              {form.thumbnail && (
                <div style={{ marginTop: 10, borderRadius: 6, overflow: "hidden", border: "1px solid #1e1e1e" }}>
                  <img src={form.thumbnail} alt="Hero preview" style={{ width: "100%", height: 110, objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />
                </div>
              )}
            </div>

            {/* Poster Image */}
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>
                Poster
              </label>
              <p style={{ fontSize: 11, color: "#3a3a3a", margin: "0 0 8px" }}>Portrait · 400×600px · browse cards (optional)</p>
              <ImageUploader
                label="Upload Poster (JPG/PNG)"
                folder="posters"
                onUploadSuccess={url => setForm(f => ({ ...f, poster: url }))}
                onError={err => showToast("Upload failed: " + err, "error")}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "8px 0" }}>
                <div style={{ flex: 1, height: 1, background: "#1e1e1e" }} />
                <span style={{ fontSize: 11, color: "#333" }}>or paste URL</span>
                <div style={{ flex: 1, height: 1, background: "#1e1e1e" }} />
              </div>
              <input
                type="text"
                value={form.poster}
                onChange={e => setForm(f => ({ ...f, poster: e.target.value }))}
                placeholder="https://..."
                style={{ width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 7, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none" }}
              />
              {form.poster && (
                <div style={{ marginTop: 10, borderRadius: 6, overflow: "hidden", border: "1px solid #1e1e1e", width: 80 }}>
                  <img src={form.poster} alt="Poster preview" style={{ width: "100%", aspectRatio: "2/3", objectFit: "cover" }} onError={e => { e.target.style.display = "none"; }} />
                </div>
              )}
            </div>

            {/* Video URL */}
            <FieldInput
              label="Video URL *"
              value={form.url}
              onChange={v => setForm(f => ({ ...f, url: v }))}
              placeholder="https://archive.org/..."
            />

            {/* Tags */}
            <FieldInput
              label="Tags (comma-separated)"
              value={form.tags}
              onChange={v => setForm(f => ({ ...f, tags: v }))}
              placeholder="Silent, Epic, Classic"
            />

            {/* Description */}
            <div>
              <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>
                Description
              </label>
              <textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Short synopsis..."
                style={{
                  width: "100%",
                  background: "#0a0a0a",
                  border: "1px solid #2a2a2a",
                  borderRadius: 7,
                  padding: "10px 12px",
                  color: "#fff",
                  fontSize: 13,
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                }}
                onFocus={e => (e.target.style.borderColor = "#ff4d4d")}
                onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
              />
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <button
              onClick={saveRow}
              disabled={saving}
              style={{
                flex: 1,
                background: "#ff4d4d",
                border: "none",
                borderRadius: 7,
                padding: "12px",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving…" : editingId ? "Save Changes" : "Add Row"}
            </button>
            {editingId && (
              <button
                onClick={cancelEdit}
                style={{
                  background: "#1a1a1a",
                  border: "1px solid #2a2a2a",
                  borderRadius: 7,
                  padding: "12px 20px",
                  color: "#888",
                  fontSize: 13,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* ── Data Table ── */}
        <div>
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
                  background: "#111",
                  border: "1px solid #2a2a2a",
                  borderRadius: 8,
                  padding: "10px 14px",
                  color: "#fff",
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
                    background: categoryFilter === cat ? "#ff4d4d" : "#1a1a1a",
                    border: `1px solid ${categoryFilter === cat ? "#ff4d4d" : "#2a2a2a"}`,
                    borderRadius: 6,
                    padding: "8px 14px",
                    color: categoryFilter === cat ? "#fff" : "#888",
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
                background: "#1a1a1a",
                border: "1px solid #2a2a2a",
                borderRadius: 6,
                padding: "10px 14px",
                color: "#888",
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
              background: "#111",
              border: "1px solid #1e1e1e",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "80px 1fr 100px 100px 100px 100px",
                gap: 16,
                padding: "14px 16px",
                borderBottom: "1px solid #1e1e1e",
                background: "#0a0a0a",
              }}
            >
              <span style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase" }}>Thumb</span>
              <span style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase" }}>Title & Info</span>
              <span style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase" }}>Category</span>
              <span style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase" }}>Year</span>
              <span style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase" }}>Score</span>
              <span style={{ fontSize: 11, color: "#555", fontWeight: 600, textTransform: "uppercase" }}>Actions</span>
            </div>

            {/* Rows */}
            {loading ? (
              <div style={{ padding: "40px", textAlign: "center" }}>
                <Spinner />
              </div>
            ) : filteredRows.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#555", fontSize: 14 }}>
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
                      borderBottom: idx < filteredRows.length - 1 ? "1px solid #0f0f0f" : "none",
                      alignItems: "center",
                      background: editingId === row.id ? "#1a0a0a" : "transparent",
                      borderLeft: editingId === row.id ? "2px solid #ff4d4d" : "none",
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
                          background: "#1a1a1a",
                        }}
                        onError={e => {
                          e.target.style.display = "none";
                        }}
                      />
                    </div>

                    {/* Title & Info */}
                    <div>
                      <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#fff" }}>
                        {row.title}
                      </p>
                      <div style={{ display: "flex", gap: 8, fontSize: 11, color: "#666" }}>
                        {row.duration && <span>{row.duration}</span>}
                        {row.rating && <span>{row.rating}</span>}
                      </div>
                    </div>

                    {/* Category */}
                    <div>
                      <span style={{ fontSize: 12, color: "#ff4d4d", fontWeight: 500 }}>
                        {row.category}
                      </span>
                    </div>

                    {/* Year */}
                    <div>
                      <span style={{ fontSize: 12, color: "#888" }}>
                        {row.year || "—"}
                      </span>
                    </div>

                    {/* Score */}
                    <div>
                      <span style={{ fontSize: 12, color: row.score ? "#4ade80" : "#555", fontWeight: 500 }}>
                        {row.score ? row.score + "%" : "—"}
                      </span>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => setHeroVideo(row)} style={{ background: row.featured ? "rgba(255,200,0,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${row.featured ? "rgba(255,200,0,0.4)" : "#2a2a2a"}`, borderRadius: 5, padding: "5px 10px", color: row.featured ? "#fcd34d" : "#555", fontSize: 11, cursor: "pointer", fontWeight: 500 }} title="Set as hero banner">
                        {row.featured ? "★ Hero" : "☆ Hero"}
                      </button>
                      <button onClick={() => startEdit(row)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid #2a2a2a", borderRadius: 5, padding: "5px 10px", color: "#aaa", fontSize: 11, cursor: "pointer", fontWeight: 500 }}>Edit</button>
                      <button onClick={() => setDeleteConfirm(row)} style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 5, padding: "5px 10px", color: "#f87171", fontSize: 11, cursor: "pointer", fontWeight: 500 }}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stats */}
          <div style={{ marginTop: 16, padding: "12px 16px", background: "#111", border: "1px solid #1e1e1e", borderRadius: 8, fontSize: 12, color: "#666" }}>
            Showing {filteredRows.length} of {rows.length} rows
          </div>
        </div>
          </>
        )}

        {/* ────── SHOWS TAB ────── */}
        {tab === "shows" && (
          <>
            <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: 32, position: "sticky", top: 24, maxHeight: "90vh", overflowY: "auto" }}>
              <h2 style={{ margin: "0 0 28px", fontSize: 17, fontWeight: 600, color: "#e5e5e5" }}>{editingShowId ? "Edit Show" : "Add New Show"}</h2>
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
                  <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Hero Image</label>
                  <p style={{ fontSize: 11, color: "#3a3a3a", margin: "0 0 8px" }}>Landscape · 1920×1080px · banner background</p>
                  <ImageUploader label="Upload Hero Image" folder="hero" onUploadSuccess={url => setShowForm(f => ({ ...f, thumbnail: url }))} onError={err => showToast("Upload failed: " + err, "error")} />
                  <input type="text" value={showForm.thumbnail} onChange={e => setShowForm(f => ({ ...f, thumbnail: e.target.value }))} placeholder="or paste URL..." style={{ width: "100%", marginTop: 8, background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 7, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none" }} />
                  {showForm.thumbnail && <img src={showForm.thumbnail} alt="" style={{ width: "100%", height: 100, objectFit: "cover", borderRadius: 6, marginTop: 8 }} onError={e => { e.target.style.display = "none"; }} />}
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Poster</label>
                  <p style={{ fontSize: 11, color: "#3a3a3a", margin: "0 0 8px" }}>Portrait · 400×600px · card image</p>
                  <ImageUploader label="Upload Poster" folder="posters" onUploadSuccess={url => setShowForm(f => ({ ...f, poster: url }))} onError={err => showToast("Upload failed: " + err, "error")} />
                  <input type="text" value={showForm.poster} onChange={e => setShowForm(f => ({ ...f, poster: e.target.value }))} placeholder="or paste URL..." style={{ width: "100%", marginTop: 8, background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 7, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none" }} />
                  {showForm.poster && <img src={showForm.poster} alt="" style={{ width: 70, aspectRatio: "2/3", objectFit: "cover", borderRadius: 6, marginTop: 8 }} onError={e => { e.target.style.display = "none"; }} />}
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Description</label>
                  <textarea value={showForm.description} onChange={e => setShowForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Short synopsis..." style={{ width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 7, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                <button onClick={saveShow} disabled={showSaving} style={{ flex: 1, background: "#ff4d4d", border: "none", borderRadius: 7, padding: "12px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: showSaving ? "not-allowed" : "pointer", opacity: showSaving ? 0.7 : 1 }}>
                  {showSaving ? "Saving…" : editingShowId ? "Save Changes" : "Add Show"}
                </button>
                {editingShowId && <button onClick={cancelShowEdit} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 7, padding: "12px 20px", color: "#888", fontSize: 13, cursor: "pointer" }}>Cancel</button>}
              </div>
            </div>

            <div>
              <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 600, color: "#e5e5e5" }}>All Shows ({showsList.length})</h3>
              {showsLoading ? <div style={{ color: "#555", padding: 20 }}>Loading...</div> : showsList.length === 0 ? (
                <div style={{ color: "#555", padding: 40, textAlign: "center" }}>No shows yet.</div>
              ) : showsList.map(show => (
                <div key={show.id} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "16px 20px", marginBottom: 12, display: "flex", gap: 16, alignItems: "center" }}>
                  {(show.poster || show.thumbnail) && <img src={show.poster || show.thumbnail} alt={show.title} style={{ width: 44, height: 64, objectFit: "cover", borderRadius: 5, flexShrink: 0 }} />}
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: "0 0 4px", fontSize: 14, fontWeight: 600 }}>{show.title}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "#666" }}>{show.category} · {show.year} · {show.rating}</p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setHeroShow(show)} style={{ background: show.featured ? "rgba(255,200,0,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${show.featured ? "rgba(255,200,0,0.4)" : "#2a2a2a"}`, borderRadius: 5, padding: "5px 10px", color: show.featured ? "#fcd34d" : "#555", fontSize: 11, cursor: "pointer", fontWeight: 500 }}>
                      {show.featured ? "★ Hero" : "☆ Hero"}
                    </button>
                    <button onClick={() => { setTab("episodes"); setSelectedShowForEpisodes(String(show.id)); loadEpisodes(String(show.id)); setEpisodeForm({ ...EMPTY_EPISODE, show_id: String(show.id) }); }} style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 5, padding: "5px 10px", color: "#60a5fa", fontSize: 11, cursor: "pointer", fontWeight: 500 }}>Episodes</button>
                    <button onClick={() => startShowEdit(show)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid #2a2a2a", borderRadius: 5, padding: "5px 10px", color: "#aaa", fontSize: 11, cursor: "pointer" }}>Edit</button>
                    <button onClick={() => setDeleteShowConfirm(show)} style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 5, padding: "5px 10px", color: "#f87171", fontSize: 11, cursor: "pointer" }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>

            {deleteShowConfirm && (
              <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: 14, padding: "36px 40px", width: 400, textAlign: "center" }}>
                  <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Delete "{deleteShowConfirm.title}"?</p>
                  <p style={{ fontSize: 13, color: "#666", marginBottom: 28 }}>All episodes will also be deleted.</p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setDeleteShowConfirm(null)} style={{ flex: 1, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 7, padding: "11px", color: "#888", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    <button onClick={() => deleteShow(deleteShowConfirm.id)} style={{ flex: 1, background: "#dc2626", border: "none", borderRadius: 7, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ────── EPISODES TAB ────── */}
        {tab === "episodes" && (
          <>
            <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: 32, position: "sticky", top: 24, maxHeight: "90vh", overflowY: "auto" }}>
              <h2 style={{ margin: "0 0 20px", fontSize: 17, fontWeight: 600, color: "#e5e5e5" }}>{editingEpisodeId ? "Edit Episode" : "Add Episode"}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Show *</label>
                  <select value={selectedShowForEpisodes} onChange={e => { setSelectedShowForEpisodes(e.target.value); loadEpisodes(e.target.value); setEpisodeForm({ ...EMPTY_EPISODE, show_id: e.target.value }); cancelEpisodeEdit(); }}
                    style={{ width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 7, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none" }}>
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
                  <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.7 }}>Episode Thumbnail</label>
                  <p style={{ fontSize: 11, color: "#3a3a3a", margin: "0 0 8px" }}>16:9 still from the episode (optional)</p>
                  <ImageUploader label="Upload Thumbnail" folder="episodes" onUploadSuccess={url => setEpisodeForm(f => ({ ...f, thumbnail: url }))} onError={err => showToast("Upload failed: " + err, "error")} />
                  <input type="text" value={episodeForm.thumbnail} onChange={e => setEpisodeForm(f => ({ ...f, thumbnail: e.target.value }))} placeholder="or paste URL..." style={{ width: "100%", marginTop: 8, background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 7, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none" }} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Description</label>
                  <textarea value={episodeForm.description} onChange={e => setEpisodeForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Episode synopsis..." style={{ width: "100%", background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 7, padding: "10px 12px", color: "#fff", fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                <button onClick={saveEpisode} disabled={episodeSaving || !selectedShowForEpisodes} style={{ flex: 1, background: "#ff4d4d", border: "none", borderRadius: 7, padding: "12px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: (episodeSaving || !selectedShowForEpisodes) ? "not-allowed" : "pointer", opacity: (episodeSaving || !selectedShowForEpisodes) ? 0.5 : 1 }}>
                  {episodeSaving ? "Saving…" : editingEpisodeId ? "Save Changes" : "Add Episode"}
                </button>
                {editingEpisodeId && <button onClick={cancelEpisodeEdit} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 7, padding: "12px 20px", color: "#888", fontSize: 13, cursor: "pointer" }}>Cancel</button>}
              </div>
            </div>

            <div>
              {!selectedShowForEpisodes ? (
                <div style={{ padding: 40, textAlign: "center", color: "#555" }}>Select a show to manage its episodes.</div>
              ) : (
                <>
                  <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 600, color: "#e5e5e5" }}>
                    Episodes — {showsList.find(s => String(s.id) === selectedShowForEpisodes)?.title}
                  </h3>
                  {episodesLoading ? <div style={{ color: "#555", padding: 20 }}>Loading...</div> : episodesList.length === 0 ? (
                    <div style={{ color: "#555", padding: 40, textAlign: "center" }}>No episodes yet. Add one using the form.</div>
                  ) : episodesList.map(ep => (
                    <div key={ep.id} style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 10, padding: "14px 18px", marginBottom: 10, display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ flexShrink: 0, width: 80, aspectRatio: "16/9", borderRadius: 5, overflow: "hidden", background: "#1a1a1a" }}>
                        {ep.thumbnail && <img src={ep.thumbnail} alt={ep.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: "0 0 3px", fontSize: 13, fontWeight: 600 }}>S{ep.season} E{ep.episode_number} · {ep.title}</p>
                        <p style={{ margin: 0, fontSize: 11, color: "#555" }}>{ep.duration || "No duration"}</p>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => startEpisodeEdit(ep)} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid #2a2a2a", borderRadius: 5, padding: "5px 10px", color: "#aaa", fontSize: 11, cursor: "pointer" }}>Edit</button>
                        <button onClick={() => setDeleteEpisodeConfirm(ep)} style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 5, padding: "5px 10px", color: "#f87171", fontSize: 11, cursor: "pointer" }}>Delete</button>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>

            {deleteEpisodeConfirm && (
              <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: 14, padding: "36px 40px", width: 400, textAlign: "center" }}>
                  <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Delete this episode?</p>
                  <p style={{ fontSize: 13, color: "#666", marginBottom: 28 }}>S{deleteEpisodeConfirm.season} E{deleteEpisodeConfirm.episode_number} · "{deleteEpisodeConfirm.title}"</p>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button onClick={() => setDeleteEpisodeConfirm(null)} style={{ flex: 1, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 7, padding: "11px", color: "#888", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                    <button onClick={() => deleteEpisode(deleteEpisodeConfirm.id)} style={{ flex: 1, background: "#dc2626", border: "none", borderRadius: 7, padding: "11px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ────── CAROUSELS TAB ────── */}
        {tab === "carousels" && (
          <>
            {/* ── Carousel Edit Panel ── */}
            <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 14, padding: 32, position: "sticky", top: 24, maxHeight: "90vh", overflowY: "auto" }}>
              <h2 style={{ margin: "0 0 28px", fontSize: 17, fontWeight: 600, color: "#e5e5e5" }}>
                {editingCarouselId ? "Edit Carousel" : "Add New Carousel"}
              </h2>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Title */}
                <FieldInput
                  label="Title *"
                  value={carouselForm.title}
                  onChange={v => setCarouselForm(f => ({ ...f, title: v }))}
                  placeholder="e.g. Action Movies"
                />

                {/* Type */}
                <FieldSelect
                  label="Type"
                  value={carouselForm.type}
                  onChange={v => setCarouselForm(f => ({ ...f, type: v }))}
                  options={["category", "trending", "custom"]}
                />

                {/* Filter Value */}
                <FieldInput
                  label="Filter Value"
                  value={carouselForm.filter_value}
                  onChange={v => setCarouselForm(f => ({ ...f, filter_value: v }))}
                  placeholder="e.g. Action (for category type)"
                />

                {/* Content Type */}
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>Show On Page</label>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                    {[["all", "All Pages"], ["movies", "Movies Only"], ["shows", "Series Only"]].map(([val, label]) => (
                      <button key={val} onClick={() => setCarouselForm(f => ({ ...f, content_type: val }))}
                        style={{ background: carouselForm.content_type === val ? "rgba(255,77,77,0.15)" : "#0a0a0a", border: `1px solid ${carouselForm.content_type === val ? "#ff4d4d" : "#2a2a2a"}`, borderRadius: 7, padding: "9px 6px", color: carouselForm.content_type === val ? "#ff4d4d" : "#666", fontSize: 12, cursor: "pointer", fontWeight: carouselForm.content_type === val ? 600 : 400, textAlign: "center" }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Enabled */}
                <div>
                  <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.7 }}>
                    Enabled
                  </label>
                  <button
                    onClick={() => setCarouselForm(f => ({ ...f, enabled: !f.enabled }))}
                    style={{
                      width: "100%",
                      background: carouselForm.enabled ? "rgba(16, 185, 129, 0.1)" : "rgba(107, 114, 128, 0.1)",
                      border: `1px solid ${carouselForm.enabled ? "rgba(16, 185, 129, 0.3)" : "rgba(107, 114, 128, 0.3)"}`,
                      borderRadius: 7,
                      padding: "10px 12px",
                      color: carouselForm.enabled ? "#10b981" : "#888",
                      fontSize: 13,
                      cursor: "pointer",
                      fontWeight: 500,
                    }}
                  >
                    {carouselForm.enabled ? "✓ Enabled" : "○ Disabled"}
                  </button>
                </div>

              </div>

              {/* Buttons */}
              <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                <button
                  onClick={saveCarousel}
                  disabled={carouselSaving}
                  style={{
                    flex: 1,
                    background: "#ff4d4d",
                    border: "none",
                    borderRadius: 7,
                    padding: "12px",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: carouselSaving ? "not-allowed" : "pointer",
                    opacity: carouselSaving ? 0.6 : 1,
                  }}
                >
                  {carouselSaving ? "Saving..." : editingCarouselId ? "Update" : "Create"}
                </button>
                {editingCarouselId && (
                  <button
                    onClick={cancelCarouselEdit}
                    style={{
                      flex: 1,
                      background: "#1a1a1a",
                      border: "1px solid #2a2a2a",
                      borderRadius: 7,
                      padding: "12px",
                      color: "#888",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* ── Carousels Table ── */}
            <div>
              <h3 style={{ margin: "0 0 20px", fontSize: 15, fontWeight: 600, color: "#e5e5e5" }}>
                All Carousels
              </h3>

              {carouselLoading ? (
                <div style={{ padding: 40, textAlign: "center", color: "#666" }}>Loading carousels...</div>
              ) : carousels.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: "#666" }}>No carousels yet. Create one to get started.</div>
              ) : (
                <div>
                  {carousels.map((carousel, idx) => (
                    <div
                      key={carousel.id}
                      style={{
                        background: "#111",
                        border: "1px solid #1e1e1e",
                        borderRadius: 10,
                        padding: "16px 20px",
                        marginBottom: 12,
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      {/* Reorder arrows */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
                        <button onClick={() => moveCarousel(idx, -1)} disabled={idx === 0} style={{ background: "transparent", border: "none", color: idx === 0 ? "#333" : "#666", cursor: idx === 0 ? "default" : "pointer", fontSize: 12, padding: "2px 4px", lineHeight: 1 }}>▲</button>
                        <button onClick={() => moveCarousel(idx, 1)} disabled={idx === carousels.length - 1} style={{ background: "transparent", border: "none", color: idx === carousels.length - 1 ? "#333" : "#666", cursor: idx === carousels.length - 1 ? "default" : "pointer", fontSize: 12, padding: "2px 4px", lineHeight: 1 }}>▼</button>
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: "0 0 6px", fontSize: 14, fontWeight: 600, color: "#fff" }}>
                          {carousel.title}
                        </p>
                        <p style={{ margin: 0, fontSize: 12, color: "#666" }}>
                          Type: <span style={{ color: "#aaa" }}>{carousel.type}</span>
                          {carousel.filter_value && ` • Filter: ${carousel.filter_value}`}
                          {" • "}
                          <span style={{ color: "#888" }}>
                            {carousel.content_type === "movies" ? "Movies only" : carousel.content_type === "shows" ? "Series only" : "All pages"}
                          </span>
                          {" • "}
                          <span style={{ color: carousel.enabled ? "#10b981" : "#f87171" }}>
                            {carousel.enabled ? "Enabled" : "Disabled"}
                          </span>
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: 10 }}>
                        <button
                          onClick={() => startCarouselEdit(carousel)}
                          style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 5, padding: "5px 10px", color: "#60a5fa", fontSize: 11, cursor: "pointer", fontWeight: 500 }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteCarouselConfirm(carousel)}
                          style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)", borderRadius: 5, padding: "5px 10px", color: "#f87171", fontSize: 11, cursor: "pointer", fontWeight: 500 }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Stats */}
              <div style={{ marginTop: 16, padding: "12px 16px", background: "#111", border: "1px solid #1e1e1e", borderRadius: 8, fontSize: 12, color: "#666" }}>
                Total: {carousels.length} carousel{carousels.length !== 1 ? "s" : ""}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──

function FieldInput({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          background: "#0a0a0a",
          border: "1px solid #2a2a2a",
          borderRadius: 7,
          padding: "10px 12px",
          color: "#fff",
          fontSize: 13,
          outline: "none",
        }}
        onFocus={e => (e.target.style.borderColor = "#ff4d4d")}
        onBlur={e => (e.target.style.borderColor = "#2a2a2a")}
      />
    </div>
  );
}

function FieldSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.7 }}>
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%",
          background: "#0a0a0a",
          border: "1px solid #2a2a2a",
          borderRadius: 7,
          padding: "10px 12px",
          color: "#fff",
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
    <div style={{ width: 32, height: 32, border: "3px solid #222", borderTop: "3px solid #ff4d4d", borderRadius: "50%", animation: "spin 0.8s linear infinite" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
