import { Router, type Request } from "express";
import {
  GetSiteAnalyticsSummaryQueryParams,
  TrackSiteAnalyticsPageviewBody,
} from "@workspace/api-zod";
import { execute, queryAll, queryOne } from "../lib/erp-sql.js";
import { isSysAdminToken } from "./auth.js";

const router = Router();

async function isCurrentAdmin(req: Request): Promise<boolean> {
  const authorization = req.headers.authorization?.trim() ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  if (await isSysAdminToken(token)) return true;
  const row = await queryOne(`
    SELECT u.id
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND datetime(s.expires_at)>datetime('now')
      AND u.active=1 AND u.role='admin'
      AND s.rowid=(SELECT MAX(newest.rowid) FROM sessions newest
                   WHERE newest.user_id=u.id AND datetime(newest.expires_at)>datetime('now'))
  `, token);
  return Boolean(row);
}

function sanitizePath(value: string): string {
  let pathname: string;
  try {
    pathname = new URL(value, "https://analytics.invalid").pathname;
  } catch {
    return "/";
  }
  if (!pathname.startsWith("/")) return "/";
  return pathname.split("/").map(segment => {
    if (/^\d+$/.test(segment) || /^[a-f0-9_-]{20,}$/i.test(segment)) return ":id";
    return segment.slice(0, 80);
  }).join("/").slice(0, 512);
}

function sourceHost(referrer: string, requestHost: string): string {
  if (!referrer) return "مباشر";
  try {
    const parsed = new URL(referrer);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "مباشر";
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const localHost = requestHost.toLowerCase().split(":")[0].replace(/^www\./, "");
    return !hostname || hostname === localHost ? "مباشر" : hostname.slice(0, 180);
  } catch {
    return "مباشر";
  }
}

router.post("/site-analytics/pageview", async (req, res) => {
  const parsed = TrackSiteAnalyticsPageviewBody.safeParse(req.body);
  if (!parsed.success) return void res.status(400).json({ error: "بيانات الزيارة غير صالحة" });
  if (process.env.HOSTINGER_SITE_ANALYTICS !== "1") {
    return void res.status(202).json({ accepted: false });
  }

  const pagePath = sanitizePath(parsed.data.page_path);
  const visitorId = parsed.data.visitor_id;
  const source = sourceHost(parsed.data.referrer ?? "", req.get("host") ?? "");
  await execute(`
    INSERT INTO site_analytics_events (visitor_id, page_path, source_host)
    VALUES (?, ?, ?)
  `, visitorId, pagePath, source);
  return void res.status(202).json({ accepted: true });
});

router.get("/site-analytics/summary", async (req, res) => {
  if (!await isCurrentAdmin(req)) {
    return void res.status(403).json({ error: "صلاحيات المدير مطلوبة لعرض إحصاءات الزيارات" });
  }
  const query = GetSiteAnalyticsSummaryQueryParams.safeParse(req.query);
  if (!query.success) return void res.status(400).json({ error: "نطاق الأيام يجب أن يكون بين 7 و365 يوماً" });
  const days = query.data.days ?? 30;
  const range = `-${days} days`;
  const totals = await queryOne<{ page_views: number; sessions: number }>(`
    SELECT COUNT(*) AS page_views, COUNT(DISTINCT visitor_id) AS sessions
    FROM site_analytics_events
    WHERE created_at >= datetime('now', ?)
  `, range) as { page_views: number; sessions: number };
  const daily = await queryAll<{ day: string; page_views: number; sessions: number }>(`
    SELECT date(created_at) AS day, COUNT(*) AS page_views,
      COUNT(DISTINCT visitor_id) AS sessions
    FROM site_analytics_events
    WHERE created_at >= datetime('now', ?)
    GROUP BY date(created_at)
    ORDER BY day DESC
  `, range);
  const topPages = await queryAll<{ label: string; count: number }>(`
    SELECT page_path AS label, COUNT(*) AS count
    FROM site_analytics_events
    WHERE created_at >= datetime('now', ?)
    GROUP BY page_path
    ORDER BY count DESC, label
    LIMIT 10
  `, range);
  const topSources = await queryAll<{ label: string; count: number }>(`
    SELECT source_host AS label, COUNT(*) AS count
    FROM site_analytics_events
    WHERE created_at >= datetime('now', ?)
    GROUP BY source_host
    ORDER BY count DESC, label
    LIMIT 10
  `, range);
  return res.json({
    days,
    page_views: totals.page_views,
    sessions: totals.sessions,
    daily,
    top_pages: topPages,
    top_sources: topSources,
  });
});

export default router;
