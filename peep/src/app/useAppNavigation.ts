import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";

type Page =
  | "home"
  | "player"
  | "show"
  | "podcast"
  | "podcast_player"
  | "settings"
  | "profile"
  | "creator";

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
}: NavState) {
  const navigate = useNavigate();

  useEffect(() => {
    if (page === "player" && selectedVideo) {
      const t = selectedVideo._type;
      if (t === "live" || t === "live_epg") navigate(`?live=${selectedVideo.id}`, { replace: true });
      else if (selectedVideo.show_id) navigate(`?e=${selectedVideo.id}`, { replace: true });
      else navigate(`?v=${selectedVideo.id}`, { replace: true });
    } else if (page === "show" && selectedShow) {
      navigate(`?s=${selectedShow.id}`, { replace: true });
    } else if (page === "podcast" && selectedPodcast) {
      navigate(`?podcast=${selectedPodcast.id}`, { replace: true });
    } else if (page === "settings") {
      navigate("/settings", { replace: true });
    } else if (page === "profile") {
      navigate("/profile", { replace: true });
    } else if (page === "creator") {
      navigate("/creator", { replace: true });
    } else if (page === "home") {
      navigate("/", { replace: true });
    }
  }, [page, selectedVideo?.id, selectedShow?.id, selectedPodcast?.id, navigate, selectedVideo]);

  const goHome = useCallback(() => {
    sessionStorage.setItem("peep_nav", "Home");
    setPage("home");
    navigate("/");
  }, [navigate, setPage]);

  return { goHome, navigate };
}
