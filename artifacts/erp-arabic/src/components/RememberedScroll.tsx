import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { VIEW_SCROLL_PREFIX } from "@/lib/remembered-view-storage";

/** The staff shell scrolls in <main>; full-screen customer pages scroll the window. */
export default function RememberedScroll() {
  const [location] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const container = document.querySelector<HTMLElement>("main[data-page-scroll]");
    const key = `${VIEW_SCROLL_PREFIX}${user.role}:${user.id}:${location}`;
    const getTop = () => container ? container.scrollTop : window.scrollY;
    const setTop = (top: number) => {
      if (container) container.scrollTop = top;
      else window.scrollTo({ top, behavior: "auto" });
    };
    let saved = 0;
    try { saved = Math.max(0, Number(sessionStorage.getItem(key)) || 0); } catch { /* optional */ }
    if (!saved) setTop(0);
    let restoring = saved > 0;
    const remember = () => {
      if (restoring) return;
      try { sessionStorage.setItem(key, String(getTop())); } catch { /* optional */ }
    };

    // Lists can finish loading after their route renders, so retry until the
    // saved position fits the page. Stop when the user starts scrolling.
    let interrupted = false;
    const stopRestore = () => { interrupted = true; restoring = false; };
    const timers = [0, 100, 350, 800, 1600, 3000].map(delay => window.setTimeout(() => {
      if (!interrupted && saved > 0) {
        setTop(saved);
        if (getTop() >= saved - 2 || delay === 3000) restoring = false;
      }
    }, delay));
    const target: HTMLElement | Window = container ?? window;
    target.addEventListener("scroll", remember, { passive: true });
    target.addEventListener("wheel", stopRestore, { passive: true });
    target.addEventListener("touchstart", stopRestore, { passive: true });
    target.addEventListener("keydown", stopRestore);
    return () => {
      timers.forEach(window.clearTimeout);
      target.removeEventListener("scroll", remember);
      target.removeEventListener("wheel", stopRestore);
      target.removeEventListener("touchstart", stopRestore);
      target.removeEventListener("keydown", stopRestore);
    };
  }, [location, user?.id, user?.role]);
  return null;
}