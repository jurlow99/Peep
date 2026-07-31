import { useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation, useNavigationType } from "react-router-dom";

type Page =
  | "home"
  | "player"
  | "show"
  | "podcast"
  | "podcast_player"
  | "settings"
  | "profile"
  | "creator"
  | "studio";

type NavState = {
  page: Page;
  setPage: (p: Page) => void;
  selectedVideo: { id: string | number; show_id?: number; _type?: string } | null;
  selectedShow: { id: number } | null;
  selectedPodcast: { id: number } | null;
  onClearSelection?: () => void;
};

/** Sync in-app page state with browser URL (shareable links + back button). */
export function useAppNavigation({
  page,
  setPage,
  selectedVideo,
  selectedShow,
  selectedPodcast,
  onClearSelection,
}: NavState) {
  const navigate     = useNavigate();
  const location     = useLocation();
  const navType      = useNavigationType();
  const suppressRef  = useRef(false); // true while we're handling a POP so the page→URL effect skips

  // ── Browser back / forward ────────────────────────────────────────────────
  useEffect(() => {
    if (navType !== "POP") return;
    suppressRef.current = true;

    const params = new URLSearchParams(location.search);
    const hasContent =
      params.get("v") || params.get("e") || params.get("live") ||
      params.get("s") || params.get("podcast");

    if (!hasContent) {
      if (location.pathname === "/")         { setPage("home");     onClearSelection?.(); }
      else if (location.pathname === "/settings") setPage("settings");
      else if (location.pathname === "/profile")  setPage("profile");
      else if (location.pathname === "/creator")  setPage("creator");
    }

    requestAnimationFrame(() => { suppressRef.current = false; });
  }, [location.key]); // location.key changes on every navigation, including POPs

  // ── Page state → URL (push so back button has somewhere to go) ────────────
  useEffect(() => {
    if (suppressRef.current) return;

    if (page === "player" && selectedVideo) {
      const t = selectedVideo._type;
      if (t === "live" || t === "live_epg") navigate(`?live=${selectedVideo.id}`);
      else if (selectedVideo.show_id)        navigate(`?e=${selectedVideo.id}`);
      else                                   navigate(`?v=${selectedVideo.id}`);
    } else if (page === "show"    && selectedShow)    navigate(`?s=${selectedShow.id}`);
    else if (page === "podcast"   && selectedPodcast)  navigate(`?podcast=${selectedPodcast.id}`);
    else if (page === "settings")  navigate("/settings");
    else if (page === "profile")   navigate("/profile");
    else if (page === "creator")   navigate("/creator");
    else if (page === "home")      navigate("/", { replace: true }); // going home replaces — no point going "forward" to home
  }, [page, selectedVideo?.id, selectedShow?.id, selectedPodcast?.id, navigate, selectedVideo]);

  const goHome = useCallback(() => {
    sessionStorage.setItem("peep_nav", "Home");
    setPage("home");
    navigate("/");
  }, [navigate, setPage]);

  return { goHome, navigate };
}
