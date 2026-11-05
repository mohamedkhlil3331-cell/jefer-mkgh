import { useEffect } from "react";

type AssetTransfer = {
  path: string;
  transferred_bytes: number;
  requests: number;
};

const ASSET_PATH_PATTERN =
  /^\/(?:assets\/|fonts\/)?[A-Za-z0-9._/-]+\.(?:js|mjs|css|png|jpe?g|webp|svg|woff2?|ttf|ico)$/i;
const MAX_ASSETS_PER_REPORT = 50;
const MAX_BYTES_PER_ASSET = 100_000_000;
const MAX_REQUESTS_PER_ASSET = 500;

export default function StaticAssetTransferTracker() {
  useEffect(() => {
    if (!import.meta.env.PROD || typeof PerformanceObserver === "undefined") return;

    const seenEntries = new Set<string>();
    const pendingTransfers = new Map<string, AssetTransfer>();
    let flushTimer: number | undefined;

    const flush = () => {
      if (flushTimer !== undefined) {
        window.clearTimeout(flushTimer);
        flushTimer = undefined;
      }
      if (pendingTransfers.size === 0) return;

      const assets = Array.from(pendingTransfers.values());
      pendingTransfers.clear();
      void fetch("/api/site-analytics/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assets }),
        credentials: "omit",
        keepalive: true,
        cache: "no-store",
      }).catch(() => {
        // Diagnostics are best-effort and must not affect the app.
      });
    };

    const scheduleFlush = () => {
      if (flushTimer !== undefined) window.clearTimeout(flushTimer);
      flushTimer = window.setTimeout(flush, 2000);
    };

    const collect = (entries: PerformanceEntry[]) => {
      for (const entry of entries) {
        const resource = entry as PerformanceResourceTiming;
        const transferredBytes = Math.round(resource.transferSize || 0);
        if (transferredBytes <= 0) continue;

        let url: URL;
        try {
          url = new URL(resource.name, window.location.href);
        } catch {
          continue;
        }
        if (url.origin !== window.location.origin || !ASSET_PATH_PATTERN.test(url.pathname)) continue;

        const entryKey = `${resource.name}:${resource.startTime}:${transferredBytes}`;
        if (seenEntries.has(entryKey)) continue;
        seenEntries.add(entryKey);

        let asset = pendingTransfers.get(url.pathname);
        if (!asset) {
          if (pendingTransfers.size >= MAX_ASSETS_PER_REPORT) continue;
          asset = { path: url.pathname, transferred_bytes: 0, requests: 0 };
          pendingTransfers.set(url.pathname, asset);
        }
        if (
          asset.transferred_bytes + transferredBytes > MAX_BYTES_PER_ASSET ||
          asset.requests >= MAX_REQUESTS_PER_ASSET
        ) continue;

        asset.transferred_bytes += transferredBytes;
        asset.requests += 1;
      }

      if (pendingTransfers.size > 0) scheduleFlush();
    };

    const observer = new PerformanceObserver(list => collect(list.getEntries()));
    try {
      observer.observe({ type: "resource", buffered: true });
    } catch {
      observer.observe({ type: "resource" });
    }
    collect(performance.getEntriesByType("resource"));
    window.addEventListener("pagehide", flush);

    return () => {
      observer.disconnect();
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  return null;
}
