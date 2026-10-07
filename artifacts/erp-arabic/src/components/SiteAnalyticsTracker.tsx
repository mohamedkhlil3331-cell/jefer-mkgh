import { useEffect } from "react";
import { useLocation } from "wouter";
import { useTrackSiteAnalyticsPageview } from "@workspace/api-client-react";

const siteAnalyticsEnabled =
  (import.meta.env as unknown as Record<string, string | undefined>).VITE_SITE_ANALYTICS === "1";
const VISITOR_ID_KEY = "mkgh-site-analytics-visitor";

function getVisitorId(): string {
  const existing = window.sessionStorage.getItem(VISITOR_ID_KEY);
  if (existing) return existing;
  const visitorId = typeof window.crypto?.randomUUID === "function"
    ? window.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  window.sessionStorage.setItem(VISITOR_ID_KEY, visitorId);
  return visitorId;
}

function normalizePagePath(location: string): string {
  const pathname = location.split("?")[0] || "/";
  return pathname.split("/").map(segment => {
    if (/^\d+$/.test(segment) || /^[a-f0-9_-]{20,}$/i.test(segment)) return ":id";
    return segment.slice(0, 80);
  }).join("/").slice(0, 512);
}

export default function SiteAnalyticsTracker() {
  const [location] = useLocation();
  const mutation = useTrackSiteAnalyticsPageview({
    mutation: { retry: false },
  });

  useEffect(() => {
    if (!siteAnalyticsEnabled || typeof window === "undefined") return;
    mutation.mutate({
      data: {
        page_path: normalizePagePath(location),
        visitor_id: getVisitorId(),
        referrer: document.referrer.slice(0, 2048),
      },
    });
  }, [location, mutation.mutate]);

  return null;
}
